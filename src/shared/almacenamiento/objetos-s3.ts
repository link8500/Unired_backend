// Archivo: src/shared/almacenamiento/objetos-s3.ts
// Configura el cliente S3, transfiere objetos y verifica su tamaño y metadatos para Cloudflare R2.

import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { ErrorDominio, ensure } from '../../core/dominio/comun/errores';

export interface ConfiguracionS3 {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function storageProvider(): 'local' | 's3' {
  const provider = process.env.STORAGE_PROVIDER ?? 'local';
  if (provider !== 'local' && provider !== 's3')
    throw new Error('STORAGE_PROVIDER debe ser local o s3.');
  return provider;
}

/** Credenciales exclusivas del servidor; nunca se incorporan a Flutter. */
export function s3Settings(): ConfiguracionS3 {
  const values = {
    endpoint: process.env.AWS_ENDPOINT_URL_S3 ?? '',
    region: process.env.AWS_REGION ?? '',
    bucket: process.env.S3_BUCKET ?? '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  };
  if (Object.values(values).some((value) => !value.trim()))
    throw new Error(
      'Completa S3_BUCKET y las variables AWS_* del almacenamiento.',
    );
  let url: URL;
  try {
    url = new URL(values.endpoint);
  } catch {
    throw new Error('AWS_ENDPOINT_URL_S3 inválido.');
  }
  if (
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['development', 'test'].includes(process.env.NODE_ENV ?? '')
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(
      'AWS_ENDPOINT_URL_S3 debe ser un origen HTTPS sin credenciales.',
    );
  if (!/^[a-z0-9][a-z0-9.-]{1,98}[a-z0-9]$/.test(values.bucket))
    throw new Error('S3_BUCKET inválido.');
  return { ...values, endpoint: url.origin };
}

/** Transporte S3 compartido por la API y la migración; no conoce usuarios ni permisos. */
export class ObjetosS3 {
  readonly bucket: string;
  private readonly client: S3Client;
  constructor(settings: ConfiguracionS3 = s3Settings()) {
    this.bucket = settings.bucket;
    this.client = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
      forcePathStyle: true,
      maxAttempts: 3,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: { connectionTimeout: 10000, requestTimeout: 60000 },
    });
  }
  private key(key: string): string {
    ensure(
      /^[a-z0-9/_-]+\.[a-z0-9]{1,12}$/.test(key) &&
        !key.startsWith('/') &&
        !key.includes('//'),
      'Clave de archivo inválida.',
    );
    return key;
  }
  private failure(error: unknown): never {
    const failure = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    if (
      failure.$metadata?.httpStatusCode === 404 ||
      ['NoSuchKey', 'NotFound'].includes(failure.name ?? '')
    )
      throw new ErrorDominio(
        404,
        'OBJECT_NOT_FOUND',
        'El objeto físico no está disponible.',
      );
    // No expone respuestas del proveedor, firmas ni datos de conexión.
    throw new ErrorDominio(
      503,
      'STORAGE_UNAVAILABLE',
      'El almacenamiento no está disponible. Reintenta en unos momentos.',
    );
  }
  async head(key: string): Promise<{ bytes: number; sha256?: string }> {
    const request = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: this.key(key),
    });
    try {
      const object = await this.client.send(request);
      ensure(
        Number.isSafeInteger(object.ContentLength) && object.ContentLength! > 0,
        'El objeto remoto no tiene un tamaño válido.',
        503,
      );
      return { bytes: object.ContentLength!, sha256: object.Metadata?.sha256 };
    } catch (error) {
      if (error instanceof ErrorDominio) throw error;
      this.failure(error);
    }
  }
  async read(
    key: string,
    range: { start: number; end: number },
  ): Promise<Readable> {
    ensure(
      Number.isSafeInteger(range.start) &&
        Number.isSafeInteger(range.end) &&
        range.start >= 0 &&
        range.end >= range.start,
      'Rango inválido.',
      416,
    );
    const request = new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.key(key),
      Range: `bytes=${range.start}-${range.end}`,
    });
    try {
      const object = await this.client.send(request);
      const stream = object.Body;
      if (
        !(stream instanceof Readable) ||
        object.ContentLength !== range.end - range.start + 1
      ) {
        if (stream instanceof Readable) stream.destroy();
        throw new ErrorDominio(
          503,
          'STORAGE_INVALID_RANGE',
          'El almacenamiento no devolvió el rango esperado.',
        );
      }
      return stream;
    } catch (error) {
      if (error instanceof ErrorDominio) throw error;
      this.failure(error);
    }
  }
  async upload(
    key: string,
    source: string,
    bytes: number,
    sha256: string,
    contentType: string,
  ): Promise<void> {
    this.key(key);
    ensure(
      bytes > 0 && Number.isSafeInteger(bytes) && /^[a-f0-9]{64}$/.test(sha256),
      'Metadatos de archivo inválidos.',
    );
    const body = createReadStream(source);
    try {
      // Como máximo dos bloques de 8 MiB en memoria, incluso para vídeos grandes.
      await new Upload({
        client: this.client,
        partSize: 8 * 1024 * 1024,
        queueSize: 2,
        leavePartsOnError: false,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentLength: bytes,
          ContentType: contentType,
          Metadata: { sha256 },
          CacheControl: 'private, no-store',
        },
      }).done();
      const saved = await this.head(key);
      ensure(
        saved.bytes === bytes && saved.sha256 === sha256,
        'No se pudo verificar el archivo remoto.',
        503,
        'STORAGE_VERIFICATION_FAILED',
      );
    } catch (error) {
      if (error instanceof ErrorDominio) throw error;
      this.failure(error);
    } finally {
      body.destroy();
    }
  }
  async remove(key: string): Promise<void> {
    const request = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: this.key(key),
    });
    try {
      await this.client.send(request);
    } catch (error) {
      this.failure(error);
    }
  }
  close(): void {
    this.client.destroy();
  }
}

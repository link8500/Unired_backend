// Archivo: src/shared/almacenamiento/objetos-s3.spec.ts
// Pruebas automatizadas del componente objetos-s3 y sus condiciones de error.

import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  ObjetosS3,
  ConfiguracionS3,
  s3Settings,
  storageProvider,
} from './objetos-s3';
import { AlmacenamientoLocalAdapter } from './almacenamiento-local.adapter';
import { AlmacenamientoS3Adapter } from './almacenamiento-s3.adapter';

type ObjectData = { body: Buffer; sha: string };

describe('Almacenamiento S3 privado por HTTP real', () => {
  let server: Server;
  let store: ObjetosS3;
  let root: string;
  let settings: ConfiguracionS3;
  let forcedStatus = 0;
  let signedRequests = 0;
  let multipartParts = 0;
  const objects = new Map<string, ObjectData>();
  const multipart = new Map<string, Map<number, Buffer>>();
  const hashes = new Map<string, string>();

  beforeAll(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'unired-s3-test-'));
    server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url!, 'http://localhost');
        const key = decodeURIComponent(url.pathname);
        if (request.headers.authorization?.startsWith('AWS4-HMAC-SHA256'))
          signedRequests++;
        if (forcedStatus) {
          response.writeHead(forcedStatus, {
            'Content-Type': 'application/xml',
          });
          response.end(
            '<Error><Code>AccessDenied</Code><Message>Detalle interno del proveedor.</Message></Error>',
          );
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        if (request.method === 'POST' && url.searchParams.has('uploads')) {
          multipart.set(key, new Map());
          hashes.set(key, String(request.headers['x-amz-meta-sha256']));
          response.setHeader('Content-Type', 'application/xml');
          response.end(
            '<InitiateMultipartUploadResult><UploadId>test-upload</UploadId></InitiateMultipartUploadResult>',
          );
        } else if (
          request.method === 'PUT' &&
          url.searchParams.has('partNumber')
        ) {
          multipart
            .get(key)!
            .set(Number(url.searchParams.get('partNumber')), body);
          multipartParts++;
          response.setHeader('ETag', '"part"');
          response.end();
        } else if (
          request.method === 'POST' &&
          url.searchParams.has('uploadId')
        ) {
          const parts = [...multipart.get(key)!.entries()].sort(
            ([a], [b]) => a - b,
          );
          objects.set(key, {
            body: Buffer.concat(parts.map(([, part]) => part)),
            sha: hashes.get(key)!,
          });
          multipart.delete(key);
          response.setHeader('Content-Type', 'application/xml');
          response.end(
            '<CompleteMultipartUploadResult><ETag>"complete"</ETag></CompleteMultipartUploadResult>',
          );
        } else if (request.method === 'PUT') {
          objects.set(key, {
            body,
            sha: String(request.headers['x-amz-meta-sha256']),
          });
          response.setHeader('ETag', '"file"');
          response.end();
        } else if (request.method === 'DELETE') {
          objects.delete(key);
          response.writeHead(204);
          response.end();
        } else {
          const object = objects.get(key);
          if (!object) {
            response.writeHead(404);
            response.end();
            return;
          }
          response.setHeader('x-amz-meta-sha256', object.sha);
          if (request.method === 'HEAD') {
            response.setHeader('Content-Length', object.body.length);
            response.end();
          } else {
            const range = /^bytes=(\d+)-(\d+)$/.exec(
              String(request.headers.range),
            );
            const start = Number(range?.[1] ?? 0);
            const end = Number(range?.[2] ?? object.body.length - 1);
            const content = object.body.subarray(start, end + 1);
            response.writeHead(206, {
              'Content-Length': content.length,
              'Content-Range': `bytes ${start}-${end}/${object.body.length}`,
            });
            response.end(content);
          }
        }
      } catch {
        response.writeHead(500);
        response.end();
      }
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    settings = {
      endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      region: 'us-east-2',
      bucket: 'private-media',
      accessKeyId: 'test-access',
      secretAccessKey: 'test-secret',
    };
    store = new ObjetosS3(settings);
  });
  afterAll(async () => {
    store.close();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    if (!/^unired-s3-test-[^\\/]+$/.test(relative(tmpdir(), root)))
      throw new Error('Limpieza fuera de alcance.');
    await rm(root, { recursive: true, force: true });
  });
  beforeEach(() => {
    forcedStatus = 0;
  });

  async function fixture(name: string, content: Buffer) {
    const file = resolve(root, name);
    await writeFile(file, content);
    return { file, hash: createHash('sha256').update(content).digest('hex') };
  }

  it('firma las peticiones y recupera solo el rango solicitado', async () => {
    const content = Buffer.from('0123456789abcdefghij');
    const input = await fixture('range.mp4', content);
    await store.upload(
      'tutorias/1/range.mp4',
      input.file,
      content.length,
      input.hash,
      'video/mp4',
    );
    expect(await store.head('tutorias/1/range.mp4')).toEqual({
      bytes: content.length,
      sha256: input.hash,
    });
    const stream = await store.read('tutorias/1/range.mp4', {
      start: 3,
      end: 7,
    });
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('34567');
    expect(signedRequests).toBeGreaterThanOrEqual(3);
  });

  it('sube vídeos por bloques y verifica el objeto completo', async () => {
    const content = Buffer.alloc(9 * 1024 * 1024, 7);
    const input = await fixture('multipart.mp4', content);
    await store.upload(
      'tutorias/1/multipart.mp4',
      input.file,
      content.length,
      input.hash,
      'video/mp4',
    );
    expect(multipartParts).toBe(2);
    expect(
      objects
        .get('/private-media/tutorias/1/multipart.mp4')
        ?.body.equals(content),
    ).toBe(true);
  });

  it('distingue un objeto inexistente de un problema de credenciales', async () => {
    await expect(store.head('market/1/missing.webp')).rejects.toMatchObject({
      status: 404,
      code: 'OBJECT_NOT_FOUND',
    });
    forcedStatus = 403;
    await expect(store.head('market/1/missing.webp')).rejects.toMatchObject({
      status: 503,
      code: 'STORAGE_UNAVAILABLE',
    });
    await expect(store.head('market/1/missing.webp')).rejects.not.toThrow(
      'Detalle interno',
    );
  });

  it('rechaza rutas y rangos inválidos antes de acceder al proveedor', async () => {
    for (const key of [
      '../secret.pdf',
      '/secret.pdf',
      'folder//file.pdf',
      'file\\secret.pdf',
    ])
      await expect(store.head(key)).rejects.toThrow();
    await expect(
      store.read('tutorias/1/range.mp4', { start: -1, end: 1 }),
    ).rejects.toMatchObject({ status: 416 });
  });

  it('retira la caché sin eliminar originales locales y conserva la copia remota', async () => {
    const local = new AlmacenamientoLocalAdapter(resolve(root, 'storage'));
    await mkdir(local.uploadRoot, { recursive: true });
    const input = resolve(local.uploadRoot, 'fixture.upload');
    const content = Buffer.from('original para comprobar caché privada');
    await writeFile(input, content);
    const remote = new AlmacenamientoS3Adapter(local, store);
    const saved = await remote.put(input, 'tutorias/1', 'mp4', 100);
    await mkdir(resolve(local.root, 'tutorias/1'), { recursive: true });
    await writeFile(local.absolute(saved.key), content);
    await remote.release(saved.key);
    expect(await readFile(local.absolute(saved.key))).toEqual(content);
    expect(await remote.size(saved.key)).toBe(content.length);
    const stream = await remote.read(saved.key, { start: 0, end: 7 });
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(content.subarray(0, 8));
    await remote.remove(saved.key);
    await expect(remote.size(saved.key)).rejects.toMatchObject({
      code: 'OBJECT_NOT_FOUND',
    });
  });
  it('recodifica una imagen en S3, conserva su tamaño/hash y puede generar la miniatura tras retirar la caché', async () => {
    const local = new AlmacenamientoLocalAdapter(resolve(root, 'images'));
    await mkdir(local.uploadRoot, { recursive: true });
    const input = resolve(local.uploadRoot, 'imagen.upload');
    const png = await sharp({
      create: { width: 80, height: 50, channels: 3, background: '#ff5566' },
    })
      .png()
      .toBuffer();
    await writeFile(input, png);
    const remote = new AlmacenamientoS3Adapter(local, store);
    const original = await remote.put(input, 'market/1', 'png', 10485760);
    const image = await remote.normalizeImage(
      original.key,
      'imagenes_verificadas/1',
    );
    expect(await remote.size(image.key)).toBe(image.bytes);
    const chunks: Buffer[] = [];
    for await (const part of await remote.read(image.key, {
      start: 0,
      end: image.bytes - 1,
    }))
      chunks.push(Buffer.from(part));
    const bytes = Buffer.concat(chunks);
    expect((await sharp(bytes).metadata()).format).toBe('webp');
    expect(createHash('sha256').update(bytes).digest()).toEqual(image.sha256);
    const thumbnail = await remote.thumbnail(image.key, 'variantes/1/1');
    expect(await remote.size(thumbnail.key)).toBe(thumbnail.bytes);
  });
});

describe('Configuración S3', () => {
  const keys = [
    'STORAGE_PROVIDER',
    'NODE_ENV',
    'S3_BUCKET',
    'AWS_ENDPOINT_URL_S3',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
  ] as const;
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  afterEach(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
  it('mantiene local como valor inicial y rechaza un proveedor desconocido', () => {
    delete process.env.STORAGE_PROVIDER;
    expect(storageProvider()).toBe('local');
    process.env.STORAGE_PROVIDER = 'unknown';
    expect(() => storageProvider()).toThrow();
  });
  it('valida las credenciales sin incluir sus valores en los errores', () => {
    for (const key of keys) delete process.env[key];
    expect(() => s3Settings()).toThrow('Completa S3_BUCKET');
    Object.assign(process.env, {
      NODE_ENV: 'production',
      S3_BUCKET: 'private-media',
      AWS_REGION: 'us-east-2',
      AWS_ACCESS_KEY_ID: 'test-id',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      AWS_ENDPOINT_URL_S3: 'http://localhost',
    });
    expect(() => s3Settings()).toThrow('origen HTTPS');
    process.env.AWS_ENDPOINT_URL_S3 = 'https://user:private@example.com';
    expect(() => s3Settings()).toThrow('origen HTTPS');
    process.env.AWS_ENDPOINT_URL_S3 = 'https://storage.example.com';
    expect(s3Settings().endpoint).toBe('https://storage.example.com');
  });
});

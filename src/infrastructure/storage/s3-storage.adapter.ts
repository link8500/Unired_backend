import { randomUUID, createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BinaryStorage, StoredFile } from '../../domain/common/contracts';
import { ensure } from '../../domain/common/errors';
import { PrivateStorageAdapter } from './private-storage.adapter';
import { S3ObjectStore } from './s3-object-store';

const contentTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  zip: 'application/zip',
};

/** Objetos duraderos en S3; disco local únicamente para inspección y procesamiento. */
export class S3StorageAdapter implements BinaryStorage {
  readonly provider = 's3' as const;
  readonly bucket: string;
  private readonly local: PrivateStorageAdapter;
  constructor(
    original: PrivateStorageAdapter,
    private readonly objects: S3ObjectStore = new S3ObjectStore(),
  ) {
    this.bucket = objects.bucket;
    // La caché de S3 está separada de los originales locales que se migrarán.
    this.local = new PrivateStorageAdapter(
      resolve(original.root, '_s3_staging'),
      original.uploadRoot,
    );
  }

  inspect(path: string) {
    return this.local.inspect(path);
  }
  limited<T>(work: () => Promise<T>, key: string) {
    return this.local.limited(work, key);
  }
  async size(key: string) {
    return (await this.objects.head(key)).bytes;
  }
  read(key: string, range: { start: number; end: number }) {
    return this.objects.read(key, range);
  }

  private async persist(stored: StoredFile, extension: string): Promise<void> {
    const type = contentTypes[extension];
    ensure(type, 'Formato de archivo no permitido.', 415);
    await this.objects.upload(
      stored.key,
      this.local.absolute(stored.key),
      stored.bytes,
      stored.sha256.toString('hex'),
      type,
    );
  }
  async put(path: string, folder: string, extension: string, maxBytes: number) {
    const saved = await this.local.put(path, folder, extension, maxBytes);
    try {
      await this.persist(saved, extension);
      return saved;
    } catch (error) {
      await this.objects.remove(saved.key).catch(() => undefined);
      await this.release(saved.key);
      throw error;
    }
  }
  private async materialize(key: string): Promise<void> {
    const target = this.local.absolute(key);
    try {
      await stat(target);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const info = await this.objects.head(key);
    const max = Number(process.env.UPLOAD_VIDEO_MAX_BYTES ?? 1073741824);
    ensure(
      info.bytes <= max,
      'El archivo supera el límite de procesamiento.',
      413,
    );
    await mkdir(this.local.uploadRoot, { recursive: true });
    const temporary = resolve(this.local.uploadRoot, randomUUID() + '.upload');
    const hash = createHash('sha256');
    let bytes = 0;
    try {
      const stream = await this.objects.read(key, {
        start: 0,
        end: info.bytes - 1,
      });
      await pipeline(
        stream,
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > info.bytes)
              return callback(new Error('Tamaño remoto inesperado.'));
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
      );
      ensure(
        bytes === info.bytes &&
          (!info.sha256 || hash.digest('hex') === info.sha256),
        'El archivo remoto no coincide con sus metadatos.',
        503,
      );
      await mkdir(dirname(target), { recursive: true });
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  async scan(key: string) {
    await this.materialize(key);
    await this.local.scan(key);
  }
  async probeVideo(key: string) {
    await this.materialize(key);
    return this.local.probeVideo(key);
  }
  async thumbnail(key: string, folder: string) {
    await this.materialize(key);
    const thumbnail = await this.local.thumbnail(key, folder);
    try {
      await this.persist(thumbnail, 'webp');
      return thumbnail;
    } catch (error) {
      await this.objects.remove(thumbnail.key).catch(() => undefined);
      throw error;
    } finally {
      await this.release(thumbnail.key);
    }
  }
  async release(key: string) {
    await unlink(this.local.absolute(key)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      },
    );
  }
  async remove(key: string) {
    await this.objects.remove(key);
    await this.release(key);
  }
  onModuleDestroy() {
    this.objects.close();
  }
}

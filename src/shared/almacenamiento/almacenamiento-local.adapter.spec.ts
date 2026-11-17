// Archivo: src/shared/almacenamiento/almacenamiento-local.adapter.spec.ts
// Pruebas automatizadas del componente almacenamiento-local.adapter y sus condiciones de error.

import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, relative } from 'node:path';
import { AlmacenamientoLocalAdapter } from './almacenamiento-local.adapter';
import sharp from 'sharp';

describe('Storage privado', () => {
  let root: string;
  let storage: AlmacenamientoLocalAdapter;
  const original = process.env.STORAGE_ROOT;
  beforeEach(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'unired-storage-test-'));
    process.env.STORAGE_ROOT = root;
    storage = new AlmacenamientoLocalAdapter();
    await mkdir(storage.uploadRoot, { recursive: true });
  });
  afterEach(async () => {
    const rel = relative(resolve(tmpdir()), resolve(root));
    if (!/^unired-storage-test-[^\\/]+$/.test(rel))
      throw new Error('Limpieza de prueba fuera de alcance.');
    await rm(root, { recursive: true, force: true });
    if (original === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = original;
  });
  it('rechaza traversal y claves absolutas', () => {
    for (const key of [
      '../secret.txt',
      '/secret.txt',
      'C:/secret.txt',
      'folder\\secret.txt',
      'folder/../../secret.txt',
    ])
      expect(() => storage.absolute(key)).toThrow();
  });
  it('guarda por flujo con nombre independiente y hash correcto', async () => {
    const bytes = Buffer.from('fixture exclusivo de prueba');
    const input = resolve(storage.uploadRoot, 'fixture.upload');
    await writeFile(input, bytes);
    const saved = await storage.put(input, 'perfiles/1/avatar', 'png', 100);
    expect(saved.key).toMatch(/^perfiles\/1\/avatar\/[0-9a-f-]+\.png$/);
    expect(
      saved.sha256.equals(createHash('sha256').update(bytes).digest()),
    ).toBe(true);
    expect(await readFile(storage.absolute(saved.key))).toEqual(bytes);
  });
  it('retira el objeto nuevo cuando supera el límite', async () => {
    const input = resolve(storage.uploadRoot, 'fixture.upload');
    await writeFile(input, Buffer.alloc(100));
    await expect(storage.put(input, 'market/1', 'png', 10)).rejects.toThrow();
    expect(await readdir(resolve(root, 'market/1'))).toEqual([]);
  });
  it('rechaza el mismo procesamiento concurrente', async () => {
    let release!: () => void;
    const first = storage.limited(
      () =>
        new Promise<void>((resolvePromise) => {
          release = resolvePromise;
        }),
      '1',
    );
    await expect(
      storage.limited(() => Promise.resolve(1), '1'),
    ).rejects.toThrow();
    release();
    await first;
    expect(await storage.limited(() => Promise.resolve(2), '1')).toBe(2);
  });
  it('reconstruye una foto como WebP sin metadatos ni contenido añadido', async () => {
    const input = resolve(storage.uploadRoot, 'imagen.upload');
    const png = await sharp({
      create: { width: 2800, height: 1400, channels: 3, background: '#0075c9' },
    })
      .png()
      .withMetadata()
      .toBuffer();
    await writeFile(
      input,
      Buffer.concat([
        png,
        Buffer.from('contenido que no forma parte de los pixeles'),
      ]),
    );
    const original = await storage.put(
      input,
      'market/1/imagen_anuncio',
      'png',
      10485760,
    );
    const normalized = await storage.normalizeImage(
      original.key,
      'imagenes_verificadas/1/imagen_anuncio',
    );
    const bytes = await readFile(storage.absolute(normalized.key));
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(normalized.width).toBe(2400);
    expect(normalized.height).toBe(1200);
    expect(bytes.includes(Buffer.from('contenido que no forma parte'))).toBe(
      false,
    );
    expect(createHash('sha256').update(bytes).digest()).toEqual(
      normalized.sha256,
    );
    expect(normalized.bytes).toBe(bytes.length);
  });
  it('encola archivos distintos sin perderlos y libera el turno incluso tras un fallo', async () => {
    const previous = process.env.MEDIA_MAX_JOBS;
    process.env.MEDIA_MAX_JOBS = '1';
    try {
      let release!: () => void;
      const order: number[] = [];
      const first = storage.limited(async () => {
        order.push(1);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw new Error('fallo de un archivo');
      }, 'cola-1');
      // Se adjunta el manejador antes de liberar para evitar rechazos sin atender.
      const checked = expect(first).rejects.toThrow('fallo de un archivo');
      const next = [2, 3].map((id) =>
        storage.limited(async () => {
          order.push(id);
          return id;
        }, 'cola-' + id),
      );
      expect(order).toEqual([1]);
      release();
      await checked;
      expect(await Promise.all(next)).toEqual([2, 3]);
      expect(order).toEqual([1, 2, 3]);
      expect(await storage.limited(async () => 4, 'cola-4')).toBe(4);
    } finally {
      if (previous === undefined) delete process.env.MEDIA_MAX_JOBS;
      else process.env.MEDIA_MAX_JOBS = previous;
    }
  });
  it('rechaza imágenes falsas sin dejar objetos publicables', async () => {
    const input = resolve(storage.uploadRoot, 'imagen.upload');
    await writeFile(input, Buffer.from('no es una imagen'));
    const saved = await storage.put(input, 'market/1', 'jpg', 1000);
    await expect(
      storage.normalizeImage(saved.key, 'imagenes_verificadas/1'),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });
});

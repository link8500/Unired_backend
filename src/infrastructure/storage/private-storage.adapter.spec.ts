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
import { PrivateStorageAdapter } from './private-storage.adapter';

describe('Storage privado', () => {
  let root: string;
  let storage: PrivateStorageAdapter;
  const original = process.env.STORAGE_ROOT;
  beforeEach(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'unired-storage-test-'));
    process.env.STORAGE_ROOT = root;
    storage = new PrivateStorageAdapter();
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
});

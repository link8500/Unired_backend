// Archivo: src/shared/almacenamiento/almacenamiento-local.adapter.ts
// Implementa almacenamiento y procesamiento local de archivos, miniaturas, escaneo y análisis de vídeo.

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, open, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp, { OutputInfo } from 'sharp';
import {
  AlmacenamientoBinario,
  ArchivoGuardado,
} from '../../core/dominio/comun/contratos';
import { ErrorDominio, ensure } from '../../core/dominio/comun/errores';

function run(
  executable: string,
  args: string[],
  timeout: number,
): Promise<string> {
  return new Promise((resolvePromise, reject) =>
    execFile(
      executable,
      args,
      { windowsHide: true, timeout, maxBuffer: 1024 * 1024 },
      (error, stdout) =>
        error
          ? reject(
              error instanceof Error
                ? error
                : new Error('No se pudo ejecutar la herramienta multimedia.'),
            )
          : resolvePromise(stdout),
    ),
  );
}
/** Storage privado, lectura por permisos y pipelines locales reales (sin simulación). */
export class AlmacenamientoLocalAdapter implements AlmacenamientoBinario {
  readonly provider = 'local' as const;
  readonly bucket = 'private-media';
  readonly root: string;
  readonly uploadRoot: string;
  constructor(
    root = resolve(process.env.STORAGE_ROOT ?? './storage'),
    uploadRoot = resolve(root, '_uploads'),
  ) {
    this.root = resolve(root);
    this.uploadRoot = resolve(uploadRoot);
  }
  private processing = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly inFlight = new Set<string>();
  async size(key: string): Promise<number> {
    try {
      return (await stat(this.absolute(key))).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      throw new ErrorDominio(
        404,
        'OBJECT_NOT_FOUND',
        'El objeto físico no está disponible.',
      );
    }
  }
  async read(key: string, range: { start: number; end: number }) {
    return createReadStream(this.absolute(key), range);
  }
  async release(_key: string): Promise<void> {
    // En desarrollo el original local es permanente; no se elimina al procesarlo.
  }
  absolute(key: string): string {
    ensure(
      /^[a-z0-9/_-]+\.[a-z0-9]{1,12}$/.test(key) && !key.startsWith('/'),
      'Clave de archivo inválida.',
    );
    const target = resolve(this.root, key);
    const rel = relative(this.root, target);
    ensure(
      !rel.startsWith('..') && !isAbsolute(rel),
      'Ruta de archivo inválida.',
    );
    return target;
  }
  private inputPath(path: string): string {
    const absolute = resolve(path);
    const rel = relative(this.uploadRoot, absolute);
    ensure(
      rel &&
        !rel.startsWith('..') &&
        !isAbsolute(rel) &&
        /^[a-z0-9-]+\.upload$/.test(rel),
      'Carga temporal inválida.',
    );
    return absolute;
  }
  async inspect(
    path: string,
  ): Promise<{ mime: string; width?: number; height?: number }> {
    const source = this.inputPath(path);
    const { fileTypeFromFile } = await import('file-type');
    const type = await fileTypeFromFile(source);
    ensure(
      type &&
        [
          'image/jpeg',
          'image/png',
          'image/webp',
          'video/mp4',
          'video/webm',
          'application/pdf',
          'application/zip',
        ].includes(type.mime),
      'Formato de archivo no permitido.',
      415,
      'UNSUPPORTED_FORMAT',
    );
    if (type.mime.startsWith('image/')) {
      ensure(
        (await stat(source)).size <=
          Number(process.env.UPLOAD_IMAGE_MAX_BYTES ?? 10485760),
        'La imagen supera el tamaño permitido.',
        413,
        'FILE_TOO_LARGE',
      );
      try {
        const image = sharp(await readFile(source), {
          limitInputPixels: 40000000,
          animated: false,
        });
        const metadata = await image.metadata();
        await image.stats(); // Decodifica, no se limita a confiar en la extensión o cabecera.
        return {
          mime: type.mime,
          width: metadata.width,
          height: metadata.height,
        };
      } catch {
        throw new ErrorDominio(
          415,
          'INVALID_IMAGE',
          'La imagen está dañada o supera el límite de píxeles.',
        );
      }
    }
    if (type.mime === 'application/pdf') {
      const file = await open(source, 'r');
      try {
        const size = (await file.stat()).size;
        const tail = Buffer.alloc(Math.min(65536, size));
        await file.read(tail, 0, tail.length, size - tail.length);
        ensure(
          tail.includes(Buffer.from('%%EOF')),
          'PDF incompleto o dañado.',
          415,
        );
      } finally {
        await file.close();
      }
    }
    return { mime: type.mime };
  }
  async put(
    path: string,
    folder: string,
    extension: string,
    maxBytes: number,
  ): Promise<ArchivoGuardado> {
    const source = this.inputPath(path);
    ensure(
      /^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(folder) &&
        /^[a-z0-9]{1,12}$/.test(extension),
      'Destino de carga inválido.',
    );
    const key = folder + '/' + randomUUID() + '.' + extension;
    const target = this.absolute(key);
    await mkdir(resolve(this.root, folder), { recursive: true });
    const handle = await open(target, 'wx', 0o600);
    const hash = createHash('sha256');
    let bytes = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxBytes)
          return callback(
            new ErrorDominio(
              413,
              'FILE_TOO_LARGE',
              'El archivo supera el tamaño permitido.',
            ),
          );
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        createReadStream(source),
        counter,
        handle.createWriteStream(),
      );
      ensure(bytes > 0, 'No se aceptan archivos vacíos.');
      return { key, bytes, sha256: hash.digest() };
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(target).catch(() => undefined);
      throw error;
    }
  }
  private async defenderExecutable(): Promise<string> {
    if (process.env.AV_EXECUTABLE) return process.env.AV_EXECUTABLE;
    const platform = resolve(
      process.env.ProgramData ?? 'C:/ProgramData',
      'Microsoft/Windows Defender/Platform',
    );
    const versions = (await readdir(platform)).sort().reverse();
    for (const version of versions) {
      const path = resolve(platform, version, 'MpCmdRun.exe');
      if (existsSync(path)) return path;
    }
    throw new Error('Defender no disponible.');
  }
  async scan(key: string): Promise<void> {
    const path = this.absolute(key);
    try {
      if (
        (process.env.AV_PROVIDER ??
          (process.platform === 'win32' ? 'defender' : 'clamav')) === 'defender'
      ) {
        await run(
          await this.defenderExecutable(),
          ['-Scan', '-ScanType', '3', '-File', path, '-DisableRemediation'],
          60000,
        );
      } else {
        const executable = process.env.AV_EXECUTABLE ?? 'clamdscan';
        await run(executable, ['--no-summary', '--', path], 60000);
      }
      ensure(
        (await stat(path)).size > 0,
        'El archivo ya no está disponible.',
        409,
      );
    } catch (error) {
      if (
        (error as { code?: unknown }).code === 2 ||
        (error as { code?: unknown }).code === 1
      )
        throw new ErrorDominio(
          422,
          'SCAN_REJECTED',
          'El antivirus rechazó el archivo o no pudo verificarlo.',
        );
      throw new ErrorDominio(
        503,
        'SCANNER_UNAVAILABLE',
        'No se pudo completar el escaneo. Configura un antivirus disponible; el archivo sigue privado.',
      );
    }
  }
  async probeVideo(key: string): Promise<{ duration: number }> {
    const executable =
      process.env.FFPROBE_PATH ??
      (process.platform === 'win32'
        ? resolve('.tools/ffmpeg/bin/ffprobe.exe')
        : 'ffprobe');
    try {
      const version = await run(executable, ['-version'], 10000);
      const match = version.match(/ffprobe version (\d+)\.(\d+)(?:\.(\d+))?/);
      ensure(
        match &&
          (Number(match[1]) > 8 ||
            (Number(match[1]) === 8 &&
              (Number(match[2]) > 1 ||
                (Number(match[2]) === 1 && Number(match[3] ?? 0) >= 3)))),
        'Actualiza FFprobe a 8.1.3 o superior.',
        503,
      );
      const raw = await run(
        executable,
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-show_entries',
          'format=duration:stream=codec_type,codec_name',
          '-of',
          'json',
          this.absolute(key),
        ],
        30000,
      );
      const info = JSON.parse(raw) as {
        format?: { duration?: string };
        streams?: { codec_type: string; codec_name: string }[];
      };
      const duration = Number(info.format?.duration);
      const video = info.streams?.find(
        (stream) => stream.codec_type === 'video',
      );
      ensure(
        video &&
          ['h264', 'vp8', 'vp9', 'av1'].includes(video.codec_name) &&
          Number.isFinite(duration) &&
          duration > 0 &&
          duration <= 86400,
        'Video dañado, codec no admitido o duración mayor de 24 horas.',
        415,
      );
      return { duration: Math.ceil(duration) };
    } catch (error) {
      if (error instanceof ErrorDominio) throw error;
      if ((error as { code?: unknown }).code === 1)
        throw new ErrorDominio(
          415,
          'INVALID_VIDEO',
          'El video está incompleto o no puede decodificarse.',
        );
      throw new ErrorDominio(
        503,
        'VIDEO_PROCESSING_UNAVAILABLE',
        'No se pudo inspeccionar el video. Ejecuta npm run setup:media o configura FFPROBE_PATH.',
      );
    }
  }
  async remove(key: string): Promise<void> {
    await unlink(this.absolute(key));
  }
  /** Las imágenes se reconstruyen desde píxeles; no se publica el archivo recibido.
   * Esto es saneamiento de imágenes, no un resultado de antivirus. PDF, ZIP y
   * vídeo conservan el escaneo obligatorio antes de poder compartirse. */
  async normalizeImage(key: string, folder: string) {
    await mkdir(this.uploadRoot, { recursive: true });
    const temporary = resolve(this.uploadRoot, randomUUID() + '.upload');
    try {
      let info: OutputInfo;
      try {
        info = await sharp(await readFile(this.absolute(key)), {
          limitInputPixels: 40000000,
          animated: false,
          failOn: 'warning',
        })
          .rotate()
          .resize({
            width: 2400,
            height: 2400,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 85, effort: 4 })
          .toFile(temporary);
      } catch {
        throw new ErrorDominio(
          415,
          'INVALID_IMAGE',
          'La imagen está dañada o no puede prepararse. Elige otra imagen JPG, PNG o WebP.',
        );
      }
      return {
        ...(await this.put(temporary, folder, 'webp', 10485760)),
        width: info.width,
        height: info.height,
      };
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  async thumbnail(
    key: string,
    folder: string,
  ): Promise<ArchivoGuardado & { width: number; height: number }> {
    await mkdir(this.uploadRoot, { recursive: true });
    const temporary = resolve(this.uploadRoot, randomUUID() + '.upload');
    try {
      const info = await sharp(await readFile(this.absolute(key)), {
        limitInputPixels: 40000000,
      })
        .rotate()
        .resize({
          width: 640,
          height: 640,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toFile(temporary);
      return {
        ...(await this.put(temporary, folder, 'webp', 10485760)),
        width: info.width,
        height: info.height,
      };
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  async limited<T>(work: () => Promise<T>, key: string): Promise<T> {
    ensure(!this.inFlight.has(key), 'Este archivo ya está procesándose.', 409);
    ensure(
      this.waiting.length < 16,
      'Hay archivos procesándose. Reintenta en unos segundos.',
      429,
      'PROCESSING_BUSY',
    );
    this.inFlight.add(key);
    // Una cola corta evita rechazar fotos válidas cuando coinciden dos cargas.
    // El puesto se transfiere directamente al siguiente trabajo, sin carreras.
    if (this.processing >= Number(process.env.MEDIA_MAX_JOBS ?? 1))
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.processing++;
    try {
      return await work();
    } finally {
      this.inFlight.delete(key);
      const next = this.waiting.shift();
      if (next) next();
      else this.processing--;
    }
  }
}

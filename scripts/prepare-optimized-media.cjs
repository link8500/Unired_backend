// Prepara copias para una migración: no reemplaza archivos ni escribe en PostgreSQL.
// Uso: node --env-file=.env.local scripts/prepare-optimized-media.cjs [--prepare] [--limit=1]
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

const project = path.resolve(__dirname, '..');
const root = path.resolve(project, process.env.STORAGE_ROOT || 'storage');
const output = path.resolve(project, '.cache/optimized-media/audio64');
const manifestPath = path.resolve(
  project,
  '.cache/optimized-media/manifest.json',
);
const argumentsSet = new Set(process.argv.slice(2));
const prepare = argumentsSet.has('--prepare');
const limitArgument = [...argumentsSet].find((value) =>
  value.startsWith('--limit='),
);
const limit = limitArgument ? Number(limitArgument.split('=')[1]) : Infinity;
const executable = (name) =>
  process.env[name.toUpperCase() + '_PATH'] ||
  (process.platform === 'win32'
    ? path.resolve(project, '.tools/ffmpeg/bin/' + name + '.exe')
    : name);

function originalPath(key) {
  if (!/^[a-z0-9/_-]+\.[a-z0-9]{1,12}$/.test(key) || key.startsWith('/'))
    throw new Error('Clave de archivo inválida.');
  const target = path.resolve(root, key);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Archivo fuera del almacenamiento local.');
  return target;
}

async function run(name, args, timeout = 60000) {
  return (
    await execFile(executable(name), args, {
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 1024,
    })
  ).stdout;
}

async function probe(file) {
  return JSON.parse(
    await run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration,size:stream=codec_type,codec_name,width,height,bit_rate,nb_frames',
      '-of',
      'json',
      file,
    ]),
  );
}

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function videoDigest(file) {
  return (
    await run('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-i',
      file,
      '-map',
      '0:v:0',
      '-c:v',
      'copy',
      '-f',
      'hash',
      '-hash',
      'sha256',
      '-',
    ])
  ).trim();
}

async function inventory() {
  const { Client } = require('pg');
  const {
    databaseConnection,
  } = require('../dist/shared/base_datos/conexion.config');
  const { username, ...connection } = databaseConnection();
  const client = new Client({ ...connection, user: username });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`
      SELECT id, storage_key AS key, tamano_bytes::text AS bytes,
             mime_detectado AS mime, encode(sha256, 'hex') AS sha256
      FROM archivos WHERE eliminado_en IS NULL
      ORDER BY tamano_bytes DESC, id
    `);
    await client.query('COMMIT');
    return result.rows;
  } finally {
    await client.end();
  }
}

async function optimize(file, previous) {
  if (!/^\d+$/.test(String(file.id)))
    throw new Error('Identificador inválido.');
  const source = originalPath(file.key);
  const sourceHash = await digest(source);
  if (sourceHash !== file.sha256)
    throw new Error('El original no coincide con su SHA-256.');
  const target = path.resolve(output, file.id + '.mp4');
  if (
    previous?.sourceSha256 === sourceHash &&
    previous.key === file.key &&
    previous.path === path.relative(project, target).replaceAll('\\', '/')
  ) {
    try {
      if ((await digest(target)) === previous.sha256) return previous;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const before = await probe(source);
  const videos = before.streams.filter(
    (stream) => stream.codec_type === 'video',
  );
  const audios = before.streams.filter(
    (stream) => stream.codec_type === 'audio',
  );
  // Conserva archivos con pistas adicionales: no descarta subtítulos ni otros idiomas.
  if (
    videos.length !== 1 ||
    audios.length !== 1 ||
    before.streams.length !== 2 ||
    videos[0].codec_name !== 'h264' ||
    Number(audios[0].bit_rate) < 96000
  )
    return {
      id: file.id,
      key: file.key,
      skipped: 'El original ya es compacto o contiene pistas adicionales.',
    };
  const temporary = path.resolve(output, file.id + '.partial.mp4');
  await fs.rm(temporary, { force: true });
  try {
    // Copia el vídeo H.264 sin recodificarlo; solo comprime la narración a AAC mono.
    await run(
      'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        source,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0',
        '-map_metadata',
        '-1',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        '-ac',
        '1',
        '-movflags',
        '+faststart',
        '-threads',
        '2',
        '-n',
        temporary,
      ],
      600000,
    );
    const after = await probe(temporary);
    const a = after.streams.find((stream) => stream.codec_type === 'video');
    if (
      !a ||
      a.width !== videos[0].width ||
      a.height !== videos[0].height ||
      a.nb_frames !== videos[0].nb_frames ||
      Math.abs(Number(before.format.duration) - Number(after.format.duration)) >
        0.5 ||
      (await videoDigest(source)) !== (await videoDigest(temporary))
    )
      throw new Error(
        'La copia no conserva íntegramente el vídeo y su duración.',
      );
    const bytes = (await fs.stat(temporary)).size;
    const originalBytes = Number(file.bytes);
    if (bytes >= originalBytes * 0.98)
      return {
        id: file.id,
        key: file.key,
        skipped: 'Ahorro inferior al 2%; se conserva el original.',
      };
    const sha256 = await digest(temporary);
    await fs.rename(temporary, target);
    return {
      id: file.id,
      key: file.key,
      sourceSha256: sourceHash,
      originalBytes,
      bytes,
      savedBytes: originalBytes - bytes,
      sha256,
      path: path.relative(project, target).replaceAll('\\', '/'),
      videoUnchanged: true,
      width: a.width,
      height: a.height,
      duration: Number(after.format.duration),
      audio: 'AAC mono 64 kbit/s',
    };
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function main() {
  if (argumentsSet.has('--help')) {
    console.log(
      'node --env-file=.env.local scripts/prepare-optimized-media.cjs [--prepare] [--limit=1]',
    );
    console.log(
      'Sin --prepare solo consulta el inventario. Las copias van a .cache/optimized-media.',
    );
    return;
  }
  if (!(limit === Infinity || (Number.isSafeInteger(limit) && limit > 0)))
    throw new Error('--limit debe ser un entero positivo.');
  for (const argument of argumentsSet)
    if (argument !== '--prepare' && !argument.startsWith('--limit='))
      throw new Error('Argumento desconocido. Usa --help.');
  const files = await inventory();
  const types = {};
  for (const file of files) {
    const type = (types[file.mime] ||= { count: 0, bytes: 0 });
    type.count++;
    type.bytes += Number(file.bytes);
  }
  console.log(
    JSON.stringify({
      mode: prepare ? 'prepare' : 'inspect',
      files: files.length,
      types,
    }),
  );
  if (!prepare) return;
  await fs.mkdir(output, { recursive: true });
  let manifest = { version: 1, items: [] };
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const previous = new Map(manifest.items.map((entry) => [entry.id, entry]));
  const videos = files
    .filter((file) => file.mime === 'video/mp4')
    .slice(0, limit);
  for (const file of videos) {
    const optimized = await optimize(file, previous.get(file.id));
    previous.set(file.id, optimized);
    manifest.items = [...previous.values()];
    manifest.updatedAt = new Date().toISOString();
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(
      JSON.stringify({
        id: file.id,
        savedBytes: optimized.savedBytes || 0,
        skipped: optimized.skipped,
      }),
    );
  }
  const optimized = manifest.items.filter((entry) => entry.videoUnchanged);
  console.log(
    JSON.stringify({
      prepared: optimized.length,
      originalBytes: optimized.reduce(
        (sum, item) => sum + item.originalBytes,
        0,
      ),
      optimizedBytes: optimized.reduce((sum, item) => sum + item.bytes, 0),
      savedBytes: optimized.reduce((sum, item) => sum + item.savedBytes, 0),
      manifest: path.relative(project, manifestPath),
    }),
  );
}

main().catch((error) => {
  // Los errores de proveedores pueden contener datos de conexión; no se imprimen.
  console.error(
    'No se completó la preparación de archivos (' +
      (error.code || error.name) +
      '). Revisa la conexión, el inventario y las herramientas multimedia.',
  );
  process.exitCode = 1;
});

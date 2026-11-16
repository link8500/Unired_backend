// Copia archivos existentes y conserva sus IDs y relaciones. No elimina originales.
// Sin --apply solo prepara y valida el plan; PostgreSQL se consulta en modo lectura.
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
const {
  databaseConnection,
} = require('../dist/infrastructure/database/database.config');
const {
  S3ObjectStore,
} = require('../dist/infrastructure/storage/s3-object-store');

const project = path.resolve(__dirname, '..');
const root = path.resolve(project, process.env.STORAGE_ROOT || 'storage');
const flags = new Set(process.argv.slice(2));
const apply = flags.has('--apply');
const destination = path.resolve(project, '.cache/media-migration');

function inside(folder, key) {
  if (!/^[a-z0-9/_-]+\.[a-z0-9]{1,12}$/.test(key) || key.startsWith('/'))
    throw new Error('Clave de archivo inválida.');
  const target = path.resolve(folder, key);
  const relative = path.relative(folder, target);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Ruta fuera de alcance.');
  return target;
}
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function connection() {
  const { username, ...options } = databaseConnection();
  return new Client({ ...options, user: username });
}
async function inventory(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const { rows: files } = await client.query(`
      SELECT id, storage_key AS key, tamano_bytes::text AS bytes,
             mime_detectado AS mime, encode(sha256, 'hex') AS sha256,
             proveedor AS provider, storage_bucket AS bucket
      FROM archivos WHERE eliminado_en IS NULL ORDER BY id`);
    const { rows: variants } = await client.query(`
      SELECT v.id, v.archivo_id AS file_id, v.storage_key AS key,
             v.tamano_bytes::text AS bytes, v.mime_detectado AS mime
      FROM variantes_archivo v JOIN archivos a ON a.id = v.archivo_id
      WHERE a.eliminado_en IS NULL ORDER BY v.id`);
    await client.query('COMMIT');
    return { files, variants };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function prepare(current) {
  let optimized = [];
  if (!flags.has('--originals-only')) {
    try {
      optimized = JSON.parse(
        await fs.readFile(
          path.resolve(project, '.cache/optimized-media/manifest.json'),
          'utf8',
        ),
      ).items;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const candidates = new Map(
    optimized
      .filter((file) => file.videoUnchanged)
      .map((file) => [file.id, file]),
  );
  const plan = [];
  for (const file of current.files.filter(
    (item) => item.provider === 'local',
  )) {
    const source = inside(root, file.key);
    if (
      (await digest(source)) !== file.sha256 ||
      (await fs.stat(source)).size !== Number(file.bytes)
    )
      throw new Error(
        'Un original no coincide con los metadatos de PostgreSQL.',
      );
    const candidate = candidates.get(file.id);
    let item = {
      entity: 'archivos',
      id: file.id,
      originalKey: file.key,
      originalSha256: file.sha256,
      originalBytes: Number(file.bytes),
      key: file.key,
      source,
      bytes: Number(file.bytes),
      sha256: file.sha256,
      mime: file.mime,
    };
    if (candidate) {
      if (candidate.sourceSha256 !== file.sha256 || candidate.key !== file.key)
        throw new Error(
          'Una optimización pertenece a otra versión del original.',
        );
      // Las rutas del manifiesto solo pueden apuntar a la caché específica.
      const candidatePath = path.resolve(
        project,
        '.cache/optimized-media/audio64',
        file.id + '.mp4',
      );
      if (
        path.resolve(project, candidate.path) !== candidatePath ||
        (await digest(candidatePath)) !== candidate.sha256 ||
        (await fs.stat(candidatePath)).size !== candidate.bytes
      )
        throw new Error('Una copia optimizada no pasó la verificación.');
      item = {
        ...item,
        source: candidatePath,
        bytes: candidate.bytes,
        sha256: candidate.sha256,
        key: 'optimized/audio64/' + file.key,
      };
    }
    if (item.key.length > 500)
      throw new Error('Clave de destino demasiado larga.');
    plan.push(item);
  }
  const localIds = new Set(
    current.files
      .filter((file) => file.provider === 'local')
      .map((file) => file.id),
  );
  for (const variant of current.variants.filter((file) =>
    localIds.has(file.file_id),
  )) {
    const source = inside(root, variant.key);
    if ((await fs.stat(source)).size !== Number(variant.bytes))
      throw new Error('Una miniatura no coincide con sus metadatos.');
    plan.push({
      entity: 'variantes_archivo',
      id: variant.id,
      key: variant.key,
      source,
      bytes: Number(variant.bytes),
      sha256: await digest(source),
      mime: variant.mime,
    });
  }
  const keys = new Set();
  for (const item of plan) {
    if (keys.has(item.key))
      throw new Error('El plan contiene destinos duplicados.');
    keys.add(item.key);
  }
  return plan;
}

async function main() {
  if (flags.has('--help')) {
    console.log('Primero: npm run build');
    console.log(
      'node --env-file=.env.local scripts/migrate-media-to-s3.cjs [--apply] [--originals-only]',
    );
    console.log(
      'S3_BUCKET y AWS_* solo se requieren con --apply. El bucket debe existir y ser privado.',
    );
    return;
  }
  for (const flag of flags)
    if (!['--apply', '--originals-only'].includes(flag))
      throw new Error('Argumento desconocido.');
  const client = connection();
  let store;
  try {
    await client.connect();
    const current = await inventory(client);
    const plan = await prepare(current);
    await fs.mkdir(destination, { recursive: true });
    const summary = {
      mode: apply ? 'apply' : 'plan',
      objects: plan.length,
      files: plan.filter((item) => item.entity === 'archivos').length,
      variants: plan.filter((item) => item.entity === 'variantes_archivo')
        .length,
      bytes: plan.reduce((total, item) => total + item.bytes, 0),
      savedBytes: plan.reduce(
        (total, item) =>
          total + (item.originalBytes ? item.originalBytes - item.bytes : 0),
        0,
      ),
    };
    await fs.writeFile(
      path.resolve(destination, 'plan.json'),
      JSON.stringify({ summary, items: plan }, null, 2),
    );
    console.log(JSON.stringify(summary));
    if (!apply) return;
    // Conserva el estado previo de los campos que cambiará la transacción.
    // Una reanudación conserva el primer respaldo en lugar de reemplazarlo.
    try {
      await fs.writeFile(
        path.resolve(destination, 'before.json'),
        JSON.stringify(
          { createdAt: new Date().toISOString(), ...current },
          null,
          2,
        ),
        { flag: 'wx', mode: 0o600 },
      );
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    store = new S3ObjectStore();
    if (
      current.files.some(
        (file) => file.provider === 's3' && file.bucket !== store.bucket,
      )
    )
      throw new Error(
        'Existen archivos en otro bucket; se requiere una migración específica.',
      );
    for (const item of plan) {
      let existing;
      try {
        existing = await store.head(item.key);
      } catch (error) {
        if (error.code !== 'OBJECT_NOT_FOUND') throw error;
      }
      if (existing) {
        if (existing.bytes !== item.bytes || existing.sha256 !== item.sha256)
          throw new Error(
            'Ya existe un objeto distinto en el destino. No se sobrescribió.',
          );
      } else
        await store.upload(
          item.key,
          item.source,
          item.bytes,
          item.sha256,
          item.mime,
        );
      console.log(
        JSON.stringify({
          uploaded: item.entity,
          id: item.id,
          reused: !!existing,
        }),
      );
    }
    // Publica las nuevas referencias solo cuando todos los objetos están confirmados.
    await client.query('BEGIN');
    try {
      // El bloqueo impide que una publicación cambie el inventario durante el corte.
      await client.query(
        'LOCK TABLE archivos, variantes_archivo IN SHARE ROW EXCLUSIVE MODE',
      );
      const { rows: counts } = await client.query(
        'SELECT count(*)::int AS total FROM archivos WHERE eliminado_en IS NULL',
      );
      if (counts[0].total !== current.files.length)
        throw new Error(
          'Cambió el inventario durante la copia. Repite la migración.',
        );
      const { rows: variantCounts } = await client.query(`
        SELECT count(*)::int AS total FROM variantes_archivo v
        JOIN archivos a ON a.id = v.archivo_id WHERE a.eliminado_en IS NULL`);
      if (variantCounts[0].total !== current.variants.length)
        throw new Error('Cambió el inventario de miniaturas durante la copia.');
      for (const item of plan) {
        if (item.entity === 'archivos') {
          const result = await client.query(
            `UPDATE archivos
            SET proveedor = 's3', storage_bucket = $1, storage_key = $2,
                tamano_bytes = $3, sha256 = decode($4, 'hex')
            WHERE id = $5 AND proveedor = 'local' AND storage_key = $6
              AND sha256 = decode($7, 'hex') AND tamano_bytes = $8 AND eliminado_en IS NULL`,
            [
              store.bucket,
              item.key,
              String(item.bytes),
              item.sha256,
              item.id,
              item.originalKey,
              item.originalSha256,
              String(item.originalBytes),
            ],
          );
          if (result.rowCount !== 1)
            throw new Error(
              'Cambió un original durante la copia. Repite la migración.',
            );
        } else {
          const result = await client.query(
            'SELECT id FROM variantes_archivo WHERE id = $1 AND storage_key = $2 AND tamano_bytes = $3',
            [item.id, item.key, String(item.bytes)],
          );
          if (result.rowCount !== 1)
            throw new Error('Cambió una miniatura durante la copia.');
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    await fs.writeFile(
      path.resolve(destination, 'completed.json'),
      JSON.stringify(
        {
          ...summary,
          bucket: store.bucket,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(
      'Migración confirmada. Los IDs y los archivos locales originales se conservaron.',
    );
  } finally {
    store?.close();
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    'No se completó la migración (' +
      (error.code || error.name) +
      '). No se eliminaron originales. Revisa el plan y la configuración privada.',
  );
  process.exitCode = 1;
});

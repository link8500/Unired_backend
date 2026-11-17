// Aplica únicamente migraciones pendientes antes de arrancar la API.
// Un bloqueo de PostgreSQL evita que dos instancias migren al mismo tiempo.
require('dotenv/config');
async function start() {
  const dataSource = require('../dist/shared/base_datos/origen-datos').default;
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.query('SELECT pg_advisory_lock($1)', [1794873600]);
    try {
      const applied = await dataSource.runMigrations({ transaction: 'all' });
      console.log('Migraciones pendientes aplicadas: ' + applied.length);
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1)', [1794873600]);
    }
  } finally {
    await runner.release();
    await dataSource.destroy();
  }
  require('../dist/main');
}
start().catch(() => {
  console.error(
    'No se pudo preparar la base. Revisa las migraciones y la conexión configurada.',
  );
  process.exitCode = 1;
});

import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { InitialSchema1791504000000 } from './migrations/1791504000000-initial-schema';
import { ApiSupport1791600000000 } from './migrations/1791600000000-api-support';

export function databaseOptions(): DataSourceOptions {
  if (
    !process.env.DB_PASSWORD ||
    process.env.DB_PASSWORD === 'CAMBIAR_CON_SETUP_ENV'
  )
    throw new Error('Ejecuta npm run setup:env y configura PostgreSQL.');
  const port = Number(process.env.DB_PORT ?? 5433);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('DB_PORT inválido.');
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port,
    username: process.env.DB_USER ?? 'unired',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? 'unired',
    entities: [],
    migrations: [InitialSchema1791504000000, ApiSupport1791600000000],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'all',
    logging: false,
    extra: { max: 10, options: '-c timezone=UTC' },
  };
}
export default new DataSource(databaseOptions());

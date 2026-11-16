import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { databaseConnection } from './database.config';
import { InitialSchema1791504000000 } from './migrations/1791504000000-initial-schema';
import { ApiSupport1791600000000 } from './migrations/1791600000000-api-support';
import { UserProfiles1791700000000 } from './migrations/1791700000000-user-profiles';
import { PublicationDetails1793664000000 } from './migrations/1793664000000-publication-details';
import { MarketAttributes1793750400000 } from './migrations/1793750400000-market-attributes';

export function databaseOptions(): DataSourceOptions {
  return {
    ...databaseConnection(),
    entities: [],
    migrations: [
      InitialSchema1791504000000,
      ApiSupport1791600000000,
      UserProfiles1791700000000,
      PublicationDetails1793664000000,
      MarketAttributes1793750400000,
    ],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'all',
    logging: false,
  };
}
export default new DataSource(databaseOptions());

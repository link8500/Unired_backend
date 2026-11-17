// Archivo: src/shared/base_datos/origen-datos.ts
// Construye el DataSource de TypeORM y registra las migraciones sin sincronización destructiva automática.

import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { databaseConnection } from './conexion.config';
import { InitialSchema1791504000000 } from './migraciones/1791504000000-initial-schema';
import { ApiSupport1791600000000 } from './migraciones/1791600000000-api-support';
import { UserProfiles1791700000000 } from './migraciones/1791700000000-user-profiles';
import { PublicationDetails1793664000000 } from './migraciones/1793664000000-publication-details';
import { MarketAttributes1793750400000 } from './migraciones/1793750400000-market-attributes';
import { ComercialDemo1794873600000 } from './migraciones/1794873600000-comercial-demo';
import { InteraccionesComunidad1794873600001 } from './migraciones/1794873600001-interacciones-comunidad';
import { PreciosCursos1794873600002 } from './migraciones/1794873600002-precios-cursos';
import { AccesoSocial1794931200000 } from './migraciones/1794931200000-acceso-social';

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
      ComercialDemo1794873600000,
      InteraccionesComunidad1794873600001,
      PreciosCursos1794873600002,
      AccesoSocial1794931200000,
    ],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'all',
    logging: false,
  };
}
export default new DataSource(databaseOptions());

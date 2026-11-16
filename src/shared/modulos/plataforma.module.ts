// Archivo: src/shared/modulos/plataforma.module.ts
// Crea y exporta los adaptadores compartidos de PostgreSQL, criptografía, correo y almacenamiento.

import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../base_datos/origen-datos';
import { PostgresDatabase } from '../base_datos/postgres.database';
import {
  ContrasenasScrypt,
  TokensJwt,
} from '../seguridad/criptografia.providers';
import { CorreoAdapter } from '../correo/correo.adapter';
import { AlmacenamientoLocalAdapter } from '../almacenamiento/almacenamiento-local.adapter';
import { AlmacenamientoS3Adapter } from '../almacenamiento/almacenamiento-s3.adapter';
import { storageProvider } from '../almacenamiento/objetos-s3';

/** Adaptadores compartidos con una sola instancia y un solo ciclo de vida.
 * Los módulos de negocio consumen contratos, nunca duplican conexiones/outbox. */
@Global()
@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: databaseOptions })],
  providers: [
    ContrasenasScrypt,
    TokensJwt,
    AlmacenamientoLocalAdapter,
    {
      provide: 'BINARY_STORAGE',
      useFactory: (local: AlmacenamientoLocalAdapter) =>
        storageProvider() === 's3' ? new AlmacenamientoS3Adapter(local) : local,
      inject: [AlmacenamientoLocalAdapter],
    },
    {
      provide: 'DATABASE',
      useFactory: (source: DataSource) => new PostgresDatabase(source),
      inject: [DataSource],
    },
    {
      provide: CorreoAdapter,
      useFactory: (source: DataSource) => new CorreoAdapter(source),
      inject: [DataSource],
    },
  ],
  exports: [
    'DATABASE',
    ContrasenasScrypt,
    TokensJwt,
    CorreoAdapter,
    AlmacenamientoLocalAdapter,
    'BINARY_STORAGE',
  ],
})
export class PlataformaModule {}

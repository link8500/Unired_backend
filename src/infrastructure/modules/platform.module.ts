import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../database/data-source';
import { PostgresDatabase } from '../database/postgres.database';
import { ScryptPasswords, JwtTokens } from '../security/crypto.providers';
import { MailAdapter } from '../mail/mail.adapter';
import { PrivateStorageAdapter } from '../storage/private-storage.adapter';

/** Adaptadores compartidos con una sola instancia y un solo ciclo de vida.
 * Los módulos de negocio consumen contratos, nunca duplican conexiones/outbox. */
@Global()
@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: databaseOptions })],
  providers: [
    ScryptPasswords,
    JwtTokens,
    PrivateStorageAdapter,
    {
      provide: 'DATABASE',
      useFactory: (source: DataSource) => new PostgresDatabase(source),
      inject: [DataSource],
    },
    {
      provide: MailAdapter,
      useFactory: (source: DataSource) => new MailAdapter(source),
      inject: [DataSource],
    },
  ],
  exports: [
    'DATABASE',
    ScryptPasswords,
    JwtTokens,
    MailAdapter,
    PrivateStorageAdapter,
  ],
})
export class PlatformModule {}

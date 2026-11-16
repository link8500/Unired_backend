// Archivo: src/models/acreditaciones/acreditaciones.module.ts
// Registra los controladores, proveedores y contratos de acreditaciones en el contenedor de NestJS.

import { Module } from '@nestjs/common';
import { BaseDatos } from '../../core/dominio/comun/contratos';
import { AcreditacionesUseCases } from './aplicacion/acreditaciones.use-cases';
import { AcreditacionesController } from './controllers/acreditaciones.controller';
import { TokensJwt } from '../../shared/seguridad/criptografia.providers';

/** Expedientes, documentos, revisiones y habilitaciones de tutores. */
@Module({
  controllers: [AcreditacionesController],
  providers: [
    {
      provide: AcreditacionesUseCases,
      useFactory: (db: BaseDatos, tokens: TokensJwt) =>
        new AcreditacionesUseCases(db, tokens),
      inject: ['DATABASE', TokensJwt],
    },
  ],
})
export class AcreditacionesModule {}

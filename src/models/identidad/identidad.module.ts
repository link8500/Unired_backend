// Archivo: src/models/identidad/identidad.module.ts
// Registra los controladores, proveedores y contratos de identidad en el contenedor de NestJS.

import { Module } from '@nestjs/common';
import { BaseDatos } from '../../core/dominio/comun/contratos';
import { IdentidadUseCases } from './aplicacion/identidad.use-cases';
import {
  IdentidadController,
  CuentaController,
} from './controllers/identidad.controller';
import { EventosController } from './controllers/eventos.controller';
import {
  ContrasenasScrypt,
  TokensJwt,
} from '../../shared/seguridad/criptografia.providers';
import { CorreoAdapter } from '../../shared/correo/correo.adapter';
import { emailVerificationRequired } from '../../shared/configuracion/entorno';

/** Identidad, cuenta, sesiones y eventos autenticados. */
@Module({
  controllers: [IdentidadController, CuentaController, EventosController],
  providers: [
    {
      provide: IdentidadUseCases,
      useFactory: (
        db: BaseDatos,
        passwords: ContrasenasScrypt,
        tokens: TokensJwt,
        mail: CorreoAdapter,
      ) =>
        new IdentidadUseCases(
          db,
          passwords,
          tokens,
          mail,
          emailVerificationRequired(),
        ),
      inject: ['DATABASE', ContrasenasScrypt, TokensJwt, CorreoAdapter],
    },
  ],
  exports: [IdentidadUseCases],
})
export class IdentidadModule {}

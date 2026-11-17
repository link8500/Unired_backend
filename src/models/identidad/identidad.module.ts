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
import { AccesoSocialController } from './controllers/acceso-social.controller';
import { AccesoSocialUseCases } from './aplicacion/acceso-social.use-cases';
import { ProveedoresSocialesAdapter } from '../../shared/seguridad/proveedores-sociales.adapter';
import { LimpiezaAccesoSocial } from '../../shared/seguridad/limpieza-acceso-social';
import { configuracionSocial } from '../../shared/configuracion/acceso-social';
import {
  ContrasenasScrypt,
  TokensJwt,
} from '../../shared/seguridad/criptografia.providers';
import { CorreoAdapter } from '../../shared/correo/correo.adapter';
import {
  emailVerificationRequired,
  frontendOrigin,
} from '../../shared/configuracion/entorno';

/** Identidad, cuenta, sesiones y eventos autenticados. */
@Module({
  controllers: [
    IdentidadController,
    CuentaController,
    EventosController,
    AccesoSocialController,
  ],
  providers: [
    {
      provide: ProveedoresSocialesAdapter,
      useFactory: () => new ProveedoresSocialesAdapter(),
    },
    {
      provide: LimpiezaAccesoSocial,
      useFactory: (db: BaseDatos) => new LimpiezaAccesoSocial(db),
      inject: ['DATABASE'],
    },
    {
      provide: AccesoSocialUseCases,
      useFactory: (
        db: BaseDatos,
        tokens: TokensJwt,
        providers: ProveedoresSocialesAdapter,
        identity: IdentidadUseCases,
      ) =>
        new AccesoSocialUseCases(
          db,
          tokens,
          providers,
          identity,
          configuracionSocial(),
        ),
      inject: [
        'DATABASE',
        TokensJwt,
        ProveedoresSocialesAdapter,
        IdentidadUseCases,
      ],
    },
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
          frontendOrigin(),
        ),
      inject: ['DATABASE', ContrasenasScrypt, TokensJwt, CorreoAdapter],
    },
  ],
  exports: [IdentidadUseCases],
})
export class IdentidadModule {}

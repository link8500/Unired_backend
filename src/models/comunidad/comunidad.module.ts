// Archivo: src/models/comunidad/comunidad.module.ts
// Registra los controladores, proveedores y contratos de comunidad en el contenedor de NestJS.

import { Module } from '@nestjs/common';
import { BaseDatos } from '../../core/dominio/comun/contratos';
import { AprendizajeUseCases } from '../aprendizaje/aplicacion/aprendizaje.use-cases';
import { MensajeriaUseCases } from '../mensajeria/aplicacion/mensajeria.use-cases';
import { ComunidadUseCases } from './aplicacion/comunidad.use-cases';
import { ComunidadController } from './controllers/comunidad.controller';
import { MensajeriaController } from '../mensajeria/controllers/mensajeria.controller';
import { TokensJwt } from '../../shared/seguridad/criptografia.providers';
import { AprendizajeModule } from '../aprendizaje/aprendizaje.module';
import { IdentidadModule } from '../identidad/identidad.module';

/** Mensajería, perfiles públicos, avisos y denuncias; no otorga acceso global a chats. */
@Module({
  imports: [AprendizajeModule, IdentidadModule],
  controllers: [MensajeriaController, ComunidadController],
  providers: [
    {
      provide: MensajeriaUseCases,
      useFactory: (
        db: BaseDatos,
        learning: AprendizajeUseCases,
        tokens: TokensJwt,
      ) => new MensajeriaUseCases(db, learning, tokens),
      inject: ['DATABASE', AprendizajeUseCases, TokensJwt],
    },
    {
      provide: ComunidadUseCases,
      useFactory: (db: BaseDatos, chat: MensajeriaUseCases) =>
        new ComunidadUseCases(db, chat),
      inject: ['DATABASE', MensajeriaUseCases],
    },
  ],
})
export class ComunidadModule {}

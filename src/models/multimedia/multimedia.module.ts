// Archivo: src/models/multimedia/multimedia.module.ts
// Registra los controladores, proveedores y contratos de multimedia en el contenedor de NestJS.

import { Module } from '@nestjs/common';
import {
  AlmacenamientoBinario,
  BaseDatos,
} from '../../core/dominio/comun/contratos';
import { AprendizajeUseCases } from '../aprendizaje/aplicacion/aprendizaje.use-cases';
import { MultimediaUseCases } from './aplicacion/multimedia.use-cases';
import { MultimediaController } from './controllers/multimedia.controller';
import { TokensJwt } from '../../shared/seguridad/criptografia.providers';
import { AprendizajeModule } from '../aprendizaje/aprendizaje.module';

/** Archivos privados y permisos de acceso a recursos educativos. */
@Module({
  imports: [AprendizajeModule],
  controllers: [MultimediaController],
  providers: [
    {
      provide: MultimediaUseCases,
      useFactory: (
        db: BaseDatos,
        storage: AlmacenamientoBinario,
        tokens: TokensJwt,
        learning: AprendizajeUseCases,
      ) => new MultimediaUseCases(db, storage, tokens, learning),
      inject: ['DATABASE', 'BINARY_STORAGE', TokensJwt, AprendizajeUseCases],
    },
  ],
  exports: [MultimediaUseCases],
})
export class MultimediaModule {}

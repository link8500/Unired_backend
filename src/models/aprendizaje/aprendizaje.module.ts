// Archivo: src/models/aprendizaje/aprendizaje.module.ts
// Registra los controladores, proveedores y contratos de aprendizaje en el contenedor de NestJS.

import { Module } from '@nestjs/common';
import { BaseDatos } from '../../core/dominio/comun/contratos';
import { CursosUseCases } from '../cursos/aplicacion/cursos.use-cases';
import { AprendizajeUseCases } from './aplicacion/aprendizaje.use-cases';
import { SesionesUseCases } from '../sesiones/aplicacion/sesiones.use-cases';
import {
  AprendizajeController,
  SesionesController,
} from './controllers/aprendizaje.controller';

/** Formación y seguimiento. Exporta servicios, no depende de la capa HTTP de archivos. */
@Module({
  controllers: [AprendizajeController, SesionesController],
  providers: [
    {
      provide: CursosUseCases,
      useFactory: (db: BaseDatos) => new CursosUseCases(db),
      inject: ['DATABASE'],
    },
    {
      provide: AprendizajeUseCases,
      useFactory: (db: BaseDatos, courses: CursosUseCases) =>
        new AprendizajeUseCases(db, courses),
      inject: ['DATABASE', CursosUseCases],
    },
    {
      provide: SesionesUseCases,
      useFactory: (
        db: BaseDatos,
        courses: CursosUseCases,
        learning: AprendizajeUseCases,
      ) => new SesionesUseCases(db, courses, learning),
      inject: ['DATABASE', CursosUseCases, AprendizajeUseCases],
    },
  ],
  exports: [CursosUseCases, AprendizajeUseCases, SesionesUseCases],
})
export class AprendizajeModule {}

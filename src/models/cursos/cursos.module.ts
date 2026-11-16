// Archivo: src/models/cursos/cursos.module.ts
// Registra los controladores, proveedores y contratos de cursos en el contenedor de NestJS.

import { Module } from '@nestjs/common';
import { CursosController } from './controllers/cursos.controller';
import { AprendizajeModule } from '../aprendizaje/aprendizaje.module';
import { MultimediaModule } from '../multimedia/multimedia.module';

/** Composición HTTP del catálogo y autoría; las dependencias forman un grafo sin ciclos. */
@Module({
  imports: [AprendizajeModule, MultimediaModule],
  controllers: [CursosController],
})
export class CursosModule {}

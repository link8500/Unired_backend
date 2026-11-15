import { Module } from '@nestjs/common';
import { CoursesController } from '../http/controllers/courses.controller';
import { LearningModule } from './learning.module';
import { MediaModule } from './media.module';

/** Composición HTTP del catálogo y autoría; las dependencias forman un grafo sin ciclos. */
@Module({
  imports: [LearningModule, MediaModule],
  controllers: [CoursesController],
})
export class CoursesModule {}

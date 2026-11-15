import { Module } from '@nestjs/common';
import { Database } from '../../domain/common/contracts';
import { CoursesUseCases } from '../../application/courses/courses.use-cases';
import { LearningUseCases } from '../../application/learning/learning.use-cases';
import { LiveUseCases } from '../../application/live/live.use-cases';
import {
  LearningController,
  LiveController,
} from '../http/controllers/learning.controller';

/** Formación y seguimiento. Exporta servicios, no depende de la capa HTTP de archivos. */
@Module({
  controllers: [LearningController, LiveController],
  providers: [
    {
      provide: CoursesUseCases,
      useFactory: (db: Database) => new CoursesUseCases(db),
      inject: ['DATABASE'],
    },
    {
      provide: LearningUseCases,
      useFactory: (db: Database, courses: CoursesUseCases) =>
        new LearningUseCases(db, courses),
      inject: ['DATABASE', CoursesUseCases],
    },
    {
      provide: LiveUseCases,
      useFactory: (
        db: Database,
        courses: CoursesUseCases,
        learning: LearningUseCases,
      ) => new LiveUseCases(db, courses, learning),
      inject: ['DATABASE', CoursesUseCases, LearningUseCases],
    },
  ],
  exports: [CoursesUseCases, LearningUseCases, LiveUseCases],
})
export class LearningModule {}

import { Module } from '@nestjs/common';
import { BinaryStorage, Database } from '../../domain/common/contracts';
import { LearningUseCases } from '../../application/learning/learning.use-cases';
import { MediaUseCases } from '../../application/media/media.use-cases';
import { MediaController } from '../http/controllers/media.controller';
import { JwtTokens } from '../security/crypto.providers';
import { LearningModule } from './learning.module';

/** Archivos privados y permisos de acceso a recursos educativos. */
@Module({
  imports: [LearningModule],
  controllers: [MediaController],
  providers: [
    {
      provide: MediaUseCases,
      useFactory: (
        db: Database,
        storage: BinaryStorage,
        tokens: JwtTokens,
        learning: LearningUseCases,
      ) => new MediaUseCases(db, storage, tokens, learning),
      inject: ['DATABASE', 'BINARY_STORAGE', JwtTokens, LearningUseCases],
    },
  ],
  exports: [MediaUseCases],
})
export class MediaModule {}

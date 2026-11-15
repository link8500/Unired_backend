import { Module } from '@nestjs/common';
import { Database } from '../../domain/common/contracts';
import { LearningUseCases } from '../../application/learning/learning.use-cases';
import { MessagingUseCases } from '../../application/messaging/messaging.use-cases';
import { CommunityUseCases } from '../../application/community/community.use-cases';
import { CommunityController } from '../http/controllers/community.controller';
import { MessagingController } from '../http/controllers/messaging.controller';
import { JwtTokens } from '../security/crypto.providers';
import { LearningModule } from './learning.module';
import { IdentityModule } from './identity.module';

/** Mensajería, perfiles públicos, avisos y denuncias; no otorga acceso global a chats. */
@Module({
  imports: [LearningModule, IdentityModule],
  controllers: [MessagingController, CommunityController],
  providers: [
    {
      provide: MessagingUseCases,
      useFactory: (
        db: Database,
        learning: LearningUseCases,
        tokens: JwtTokens,
      ) => new MessagingUseCases(db, learning, tokens),
      inject: ['DATABASE', LearningUseCases, JwtTokens],
    },
    {
      provide: CommunityUseCases,
      useFactory: (db: Database, chat: MessagingUseCases) =>
        new CommunityUseCases(db, chat),
      inject: ['DATABASE', MessagingUseCases],
    },
  ],
})
export class CommunityModule {}

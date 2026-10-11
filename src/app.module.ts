import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseOptions } from './infrastructure/database/data-source';
import { PostgresDatabase } from './infrastructure/database/postgres.database';
import {
  ScryptPasswords,
  JwtTokens,
} from './infrastructure/security/crypto.providers';
import { MailAdapter } from './infrastructure/mail/mail.adapter';
import { PrivateStorageAdapter } from './infrastructure/storage/private-storage.adapter';
import { Database } from './domain/common/contracts';
import { IdentityUseCases } from './application/identity/identity.use-cases';
import { AccreditationUseCases } from './application/accreditation/accreditation.use-cases';
import { CoursesUseCases } from './application/courses/courses.use-cases';
import { LearningUseCases } from './application/learning/learning.use-cases';
import { LiveUseCases } from './application/live/live.use-cases';
import { MarketplaceUseCases } from './application/marketplace/marketplace.use-cases';
import { MessagingUseCases } from './application/messaging/messaging.use-cases';
import { CommunityUseCases } from './application/community/community.use-cases';
import { AdministrationUseCases } from './application/administration/administration.use-cases';
import { MediaUseCases } from './application/media/media.use-cases';
import { AuthGuard } from './infrastructure/http/common/auth.guard';
import { RateLimitGuard } from './infrastructure/http/common/rate-limit.guard';
import {
  IdentityController,
  AccountController,
} from './infrastructure/http/controllers/identity.controller';
import { AccreditationController } from './infrastructure/http/controllers/accreditation.controller';
import { CoursesController } from './infrastructure/http/controllers/courses.controller';
import {
  LearningController,
  LiveController,
} from './infrastructure/http/controllers/learning.controller';
import { MarketplaceController } from './infrastructure/http/controllers/marketplace.controller';
import { MessagingController } from './infrastructure/http/controllers/messaging.controller';
import { CommunityController } from './infrastructure/http/controllers/community.controller';
import { AdministrationController } from './infrastructure/http/controllers/administration.controller';
import { MediaController } from './infrastructure/http/controllers/media.controller';
import { EventsController } from './infrastructure/http/controllers/events.controller';
import { HealthController } from './infrastructure/http/controllers/health.controller';

/** Composición exterior: los casos de uso solo reciben contratos del núcleo. */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({ useFactory: databaseOptions }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 600 }]),
  ],
  controllers: [
    AppController,
    HealthController,
    IdentityController,
    AccountController,
    AccreditationController,
    CoursesController,
    LearningController,
    LiveController,
    MarketplaceController,
    MessagingController,
    CommunityController,
    AdministrationController,
    MediaController,
    EventsController,
  ],
  providers: [
    AppService,
    ScryptPasswords,
    JwtTokens,
    PrivateStorageAdapter,
    {
      provide: 'DATABASE',
      useFactory: (source: DataSource) => new PostgresDatabase(source),
      inject: [DataSource],
    },
    {
      provide: MailAdapter,
      useFactory: (source: DataSource) => new MailAdapter(source),
      inject: [DataSource],
    },
    {
      provide: IdentityUseCases,
      useFactory: (
        db: Database,
        passwords: ScryptPasswords,
        tokens: JwtTokens,
        mail: MailAdapter,
      ) => new IdentityUseCases(db, passwords, tokens, mail),
      inject: ['DATABASE', ScryptPasswords, JwtTokens, MailAdapter],
    },
    {
      provide: AccreditationUseCases,
      useFactory: (db: Database, tokens: JwtTokens) =>
        new AccreditationUseCases(db, tokens),
      inject: ['DATABASE', JwtTokens],
    },
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
    {
      provide: MarketplaceUseCases,
      useFactory: (db: Database) => new MarketplaceUseCases(db),
      inject: ['DATABASE'],
    },
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
    {
      provide: AdministrationUseCases,
      useFactory: (db: Database) => new AdministrationUseCases(db),
      inject: ['DATABASE'],
    },
    {
      provide: MediaUseCases,
      useFactory: (
        db: Database,
        storage: PrivateStorageAdapter,
        tokens: JwtTokens,
        learning: LearningUseCases,
      ) => new MediaUseCases(db, storage, tokens, learning),
      inject: ['DATABASE', PrivateStorageAdapter, JwtTokens, LearningUseCases],
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}

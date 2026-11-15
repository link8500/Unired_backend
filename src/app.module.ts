import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './infrastructure/http/controllers/health.controller';
import { AuthGuard } from './infrastructure/http/common/auth.guard';
import { RateLimitGuard } from './infrastructure/http/common/rate-limit.guard';
import { PlatformModule } from './infrastructure/modules/platform.module';
import { IdentityModule } from './infrastructure/modules/identity.module';
import { AccreditationModule } from './infrastructure/modules/accreditation.module';
import { LearningModule } from './infrastructure/modules/learning.module';
import { CoursesModule } from './infrastructure/modules/courses.module';
import { MarketplaceModule } from './infrastructure/modules/marketplace.module';
import { CommunityModule } from './infrastructure/modules/community.module';
import { MediaModule } from './infrastructure/modules/media.module';
import { AdministrationModule } from './infrastructure/modules/administration.module';

/** Punto de composición. Cada módulo declara sus controladores y dependencias.
 * Las capas domain/application siguen sin importar NestJS, HTTP ni PostgreSQL.
 * Son módulos de una API, no microservicios ni procesos separados. */
@Module({
  imports: [
    PlatformModule,
    IdentityModule,
    AccreditationModule,
    LearningModule,
    MediaModule,
    CoursesModule,
    MarketplaceModule,
    CommunityModule,
    AdministrationModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 600 }]),
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}

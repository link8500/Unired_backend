import { Module } from '@nestjs/common';
import { Database } from '../../domain/common/contracts';
import { IdentityUseCases } from '../../application/identity/identity.use-cases';
import {
  IdentityController,
  AccountController,
} from '../http/controllers/identity.controller';
import { EventsController } from '../http/controllers/events.controller';
import { ScryptPasswords, JwtTokens } from '../security/crypto.providers';
import { MailAdapter } from '../mail/mail.adapter';
import { emailVerificationRequired } from '../config/runtime';

/** Identidad, cuenta, sesiones y eventos autenticados. */
@Module({
  controllers: [IdentityController, AccountController, EventsController],
  providers: [
    {
      provide: IdentityUseCases,
      useFactory: (
        db: Database,
        passwords: ScryptPasswords,
        tokens: JwtTokens,
        mail: MailAdapter,
      ) =>
        new IdentityUseCases(
          db,
          passwords,
          tokens,
          mail,
          emailVerificationRequired(),
        ),
      inject: ['DATABASE', ScryptPasswords, JwtTokens, MailAdapter],
    },
  ],
  exports: [IdentityUseCases],
})
export class IdentityModule {}

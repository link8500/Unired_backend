import { Module } from '@nestjs/common';
import { Database } from '../../domain/common/contracts';
import { AccreditationUseCases } from '../../application/accreditation/accreditation.use-cases';
import { AccreditationController } from '../http/controllers/accreditation.controller';
import { JwtTokens } from '../security/crypto.providers';

/** Expedientes, documentos, revisiones y habilitaciones de tutores. */
@Module({
  controllers: [AccreditationController],
  providers: [
    {
      provide: AccreditationUseCases,
      useFactory: (db: Database, tokens: JwtTokens) =>
        new AccreditationUseCases(db, tokens),
      inject: ['DATABASE', JwtTokens],
    },
  ],
})
export class AccreditationModule {}

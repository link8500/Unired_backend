import { Module } from '@nestjs/common';
import { Database } from '../../domain/common/contracts';
import { AdministrationUseCases } from '../../application/administration/administration.use-cases';
import { WorkspaceUseCases } from '../../application/administration/workspace.use-cases';
import { WorkspaceController } from '../http/controllers/workspace.controller';
import { AdministrationController } from '../http/controllers/administration.controller';
import { emailVerificationRequired } from '../config/runtime';

/** Directorio, métricas, catálogos, moderación y auditoría del backoffice. */
@Module({
  controllers: [AdministrationController, WorkspaceController],
  providers: [
    {
      provide: WorkspaceUseCases,
      useFactory: (db: Database) => new WorkspaceUseCases(db),
      inject: ['DATABASE'],
    },
    {
      provide: AdministrationUseCases,
      useFactory: (db: Database) =>
        new AdministrationUseCases(db, emailVerificationRequired()),
      inject: ['DATABASE'],
    },
  ],
})
export class AdministrationModule {}

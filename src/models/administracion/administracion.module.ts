// Archivo: src/models/administracion/administracion.module.ts
// Registra los controladores, proveedores y contratos de administracion en el contenedor de NestJS.

import { Module } from '@nestjs/common';
import { BaseDatos } from '../../core/dominio/comun/contratos';
import { AdministracionUseCases } from './aplicacion/administracion.use-cases';
import { GestionUseCases } from './aplicacion/gestion.use-cases';
import { GestionController } from './controllers/gestion.controller';
import { AdministracionController } from './controllers/administracion.controller';
import { emailVerificationRequired } from '../../shared/configuracion/entorno';

/** Directorio, métricas, catálogos, moderación y auditoría del backoffice. */
@Module({
  controllers: [AdministracionController, GestionController],
  providers: [
    {
      provide: GestionUseCases,
      useFactory: (db: BaseDatos) => new GestionUseCases(db),
      inject: ['DATABASE'],
    },
    {
      provide: AdministracionUseCases,
      useFactory: (db: BaseDatos) =>
        new AdministracionUseCases(db, emailVerificationRequired()),
      inject: ['DATABASE'],
    },
  ],
})
export class AdministracionModule {}

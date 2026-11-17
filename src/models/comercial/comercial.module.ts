// Archivo: src/models/comercial/comercial.module.ts
// Conecta los puertos del negocio comercial con el contenedor de NestJS.
import { Module } from '@nestjs/common';
import { BaseDatos } from '../../core/dominio/comun/contratos';
import { ComercialUseCases } from './aplicacion/comercial.use-cases';
import { ComercialController } from './controllers/comercial.controller';
@Module({
  controllers: [ComercialController],
  providers: [
    {
      provide: ComercialUseCases,
      useFactory: (db: BaseDatos) => new ComercialUseCases(db),
      inject: ['DATABASE'],
    },
  ],
  exports: [ComercialUseCases],
})
export class ComercialModule {}

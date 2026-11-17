// Archivo: src/models/interacciones/interacciones.module.ts
// Registra las negociaciones y solicitudes con los puertos de datos y cotización.
import { Module } from '@nestjs/common';
import { BaseDatos } from '../../core/dominio/comun/contratos';
import { ComercialModule } from '../comercial/comercial.module';
import { ComercialUseCases } from '../comercial/aplicacion/comercial.use-cases';
import { InteraccionesUseCases } from './aplicacion/interacciones.use-cases';
import { InteraccionesController } from './controllers/interacciones.controller';
@Module({
  imports: [ComercialModule],
  controllers: [InteraccionesController],
  providers: [
    {
      provide: InteraccionesUseCases,
      useFactory: (db: BaseDatos, commerce: ComercialUseCases) =>
        new InteraccionesUseCases(db, commerce),
      inject: ['DATABASE', ComercialUseCases],
    },
  ],
})
export class InteraccionesModule {}

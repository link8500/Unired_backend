// Archivo: src/models/market/market.module.ts
// Registra los controladores, proveedores y contratos de market en el contenedor de NestJS.

import { Module } from '@nestjs/common';
import { BaseDatos } from '../../core/dominio/comun/contratos';
import { MarketUseCases } from './aplicacion/market.use-cases';
import { MarketController } from './controllers/market.controller';

/** Marketplace entre usuarios, sin carrito ni pagos ficticios. */
@Module({
  controllers: [MarketController],
  providers: [
    {
      provide: MarketUseCases,
      useFactory: (db: BaseDatos) => new MarketUseCases(db),
      inject: ['DATABASE'],
    },
  ],
})
export class MarketModule {}

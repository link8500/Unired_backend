import { Module } from '@nestjs/common';
import { Database } from '../../domain/common/contracts';
import { MarketplaceUseCases } from '../../application/marketplace/marketplace.use-cases';
import { MarketplaceController } from '../http/controllers/marketplace.controller';

/** Marketplace entre usuarios, sin carrito ni pagos ficticios. */
@Module({
  controllers: [MarketplaceController],
  providers: [
    {
      provide: MarketplaceUseCases,
      useFactory: (db: Database) => new MarketplaceUseCases(db),
      inject: ['DATABASE'],
    },
  ],
})
export class MarketplaceModule {}

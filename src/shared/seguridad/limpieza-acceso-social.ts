// Retira intentos OAuth caducados; los tokens externos nunca se guardan.
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BaseDatos } from '../../core/dominio/comun/contratos';
export class LimpiezaAccesoSocial implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy = false;
  constructor(private readonly db: BaseDatos) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.busy) return;
      this.busy = true;
      void this.db.read.store
        .remove('flujos_acceso_social', {
          expiraEn: { op: 'lt', value: new Date() },
        })
        .catch(() => {})
        .finally(() => (this.busy = false));
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}

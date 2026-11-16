// Archivo: src/shared/http/comun/limite-solicitudes.guard.ts
// Aplica los límites de frecuencia de solicitudes para evitar abuso de la API.

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SolicitudApi } from './solicitud-api';

/** Los usuarios autenticados no comparten el cupo de uploads por vivir en una LAN. */
@Injectable()
export class LimiteSolicitudesGuard extends ThrottlerGuard {
  protected getTracker(request: SolicitudApi): Promise<string> {
    return Promise.resolve(
      request.actor ? 'usuario:' + request.actor.id : (request.ip ?? 'sin-ip'),
    );
  }
}

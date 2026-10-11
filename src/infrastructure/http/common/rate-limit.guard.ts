import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiRequest } from './api-request';

/** Los usuarios autenticados no comparten el cupo de uploads por vivir en una LAN. */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected getTracker(request: ApiRequest): Promise<string> {
    return Promise.resolve(
      request.actor ? 'usuario:' + request.actor.id : (request.ip ?? 'sin-ip'),
    );
  }
}

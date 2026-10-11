import {
  Controller,
  Headers,
  Inject,
  MessageEvent,
  Query,
  Sse,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { interval, Observable, of } from 'rxjs';
import {
  catchError,
  concatMap,
  finalize,
  startWith,
  takeWhile,
} from 'rxjs/operators';
import { IdentityUseCases } from '../../../application/identity/identity.use-cases';
import { Actor, Database, Row } from '../../../domain/common/contracts';
import { ensure } from '../../../domain/common/errors';
import * as v from '../../../domain/common/validation';
import { CurrentActor } from '../common/api.decorators';

@ApiTags('Eventos en vivo')
@ApiBearerAuth()
@Controller('me')
export class EventsController {
  private readonly connections = new Map<number, number>();
  constructor(
    private readonly identity: IdentityUseCases,
    @Inject('DATABASE') private readonly db: Database,
  ) {}
  @Sse('events')
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary:
      'Notificaciones persistidas por SSE; enviar Authorization Bearer y afterId al reconectar',
  })
  events(
    @CurrentActor() actor: Actor,
    @Headers('authorization') header: string,
    @Headers('last-event-id') lastId: string | undefined,
    @Query() query: Row,
  ): Observable<MessageEvent> {
    let cursor =
      query.afterId === undefined && !lastId
        ? '0'
        : v.id(query.afterId ?? lastId);
    ensure(
      (this.connections.get(actor.id) ?? 0) < 2 && this.connections.size < 50,
      'Límite de conexiones de eventos alcanzado.',
      429,
    );
    this.connections.set(actor.id, (this.connections.get(actor.id) ?? 0) + 1);
    return interval(2000).pipe(
      startWith(0),
      concatMap(async () => {
        const current = await this.identity.authenticate(header.slice(7));
        ensure(current.estado === 'activo', 'Sesión no disponible.', 401);
        const notices = await this.db.read.store.find(
          'notificaciones',
          { usuarioId: current.id, id: { op: 'gt', value: cursor } },
          { order: { id: 'ASC' }, limit: 50 },
        );
        if (notices.length) cursor = notices[notices.length - 1].id;
        return {
          type: notices.length ? 'notifications' : 'heartbeat',
          id: cursor,
          data: { items: notices },
        };
      }),
      catchError(() =>
        of({
          type: 'session-ended',
          data: { mensaje: 'Renueva o inicia sesión para reconectar.' },
        }),
      ),
      takeWhile((event) => event.type !== 'session-ended', true),
      finalize(() => {
        const remaining = (this.connections.get(actor.id) ?? 1) - 1;
        if (remaining) this.connections.set(actor.id, remaining);
        else this.connections.delete(actor.id);
      }),
    );
  }
}

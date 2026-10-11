import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityUseCases } from '../../../application/identity/identity.use-cases';
import { ensure } from '../../../domain/common/errors';
import { active } from '../../../domain/policies/access';
import { ACCESS_MODE } from './api.decorators';
import { ApiRequest } from './api-request';

/** Toda ruta es privada por defecto. Los roles se recargan desde PostgreSQL. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: IdentityUseCases,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.reflector.getAllAndOverride<string>(ACCESS_MODE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (mode === 'public') return true;
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const authorization = request.headers.authorization;
    if (!authorization && mode === 'file' && request.query.ticket) {
      ensure(typeof request.query.ticket === 'string', 'Enlace inválido.', 401);
      request.actor = await this.identity.authenticateFile(
        request.query.ticket,
        String(request.params.id),
      );
      active(request.actor);
      return true;
    }
    if (!authorization && ['optional', 'file'].includes(mode ?? ''))
      return true;
    ensure(
      typeof authorization === 'string' &&
        /^Bearer [^\s]+$/i.test(authorization),
      'Inicia sesión para continuar.',
      401,
      'AUTH_REQUIRED',
    );
    request.actor = await this.identity.authenticate(authorization.slice(7));
    if (mode !== 'pending') active(request.actor);
    return true;
  }
}

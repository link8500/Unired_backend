// Archivo: src/shared/http/comun/autenticacion.guard.ts
// Comprueba JWT o ticket de archivo y aplica las reglas de acceso antes de ejecutar el controlador.

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentidadUseCases } from '../../../models/identidad/aplicacion/identidad.use-cases';
import { ensure } from '../../../core/dominio/comun/errores';
import { active } from '../../../core/dominio/politicas/acceso';
import { ACCESS_MODE } from './decoradores-api';
import { SolicitudApi } from './solicitud-api';

/** Toda ruta es privada por defecto. Los roles se recargan desde PostgreSQL. */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: IdentidadUseCases,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.reflector.getAllAndOverride<string>(ACCESS_MODE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (mode === 'public') return true;
    const request = context.switchToHttp().getRequest<SolicitudApi>();
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

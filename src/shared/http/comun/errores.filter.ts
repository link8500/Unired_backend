// Archivo: src/shared/http/comun/errores.filter.ts
// Traduce excepciones y errores del dominio a respuestas HTTP uniformes.

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { ErrorDominio } from '../../../core/dominio/comun/errores';
import { Response } from 'express';
import { SolicitudApi } from './solicitud-api';

/** Respuestas coherentes; nunca devuelve SQL, hashes o configuraciones internas. */
@Catch()
export class ErroresApiFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<SolicitudApi>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'No se pudo completar la operación.';
    let details: Record<string, unknown> | undefined;
    if (error instanceof ErrorDominio) {
      status = error.status;
      code = error.code;
      message = error.message;
      details = error.details;
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      code = status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR';
      const body = error.getResponse();
      const text =
        typeof body === 'string'
          ? body
          : (body as { message?: unknown }).message;
      message = typeof text === 'string' ? text : error.message;
    } else {
      const pg = error as { code?: string };
      if (pg?.code === '23505') {
        status = 409;
        code = 'ALREADY_EXISTS';
        message = 'El correo o recurso ya está registrado.';
      } else if (pg?.code === '23503') {
        status = 409;
        code = 'INVALID_REFERENCE';
        message = 'Un recurso relacionado no existe o no corresponde.';
      } else if (pg?.code === '23514' || pg?.code === '22P02') {
        status = 400;
        code = 'INVALID_DATA';
        message = 'Los datos no cumplen las reglas del recurso.';
      }
    }
    if (status === 500)
      console.error(
        'Error interno de API; requestId=' + String(request.requestId),
      );
    response.status(status).json({
      statusCode: status,
      code,
      message,
      requestId: request.requestId,
      ...(details ? { details } : {}),
    });
  }
}

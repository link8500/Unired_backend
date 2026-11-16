// Archivo: src/core/dominio/comun/errores.ts
// Representa errores del dominio con mensaje, código y estado para su traducción posterior a HTTP.

/** Errores de negocio independientes de NestJS, HTTP y PostgreSQL. */
export class ErrorDominio extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  message: string,
  status = 400,
  code = 'VALIDATION_ERROR',
): asserts condition {
  if (!condition) throw new ErrorDominio(status, code, message);
}
export function missing(message = 'Recurso no encontrado.'): never {
  throw new ErrorDominio(404, 'NOT_FOUND', message);
}
export function forbidden(
  message = 'No tienes permiso para esta acción.',
): never {
  throw new ErrorDominio(403, 'FORBIDDEN', message);
}
export function conflict(message: string): never {
  throw new ErrorDominio(409, 'CONFLICT', message);
}

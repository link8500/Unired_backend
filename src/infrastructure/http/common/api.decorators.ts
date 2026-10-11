import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiBodyOptions,
} from '@nestjs/swagger';
type SchemaObject = Extract<ApiBodyOptions, { schema: unknown }>['schema'];
import { ApiRequest } from './api-request';

export const ACCESS_MODE = 'unired:access';
export const Public = () => SetMetadata(ACCESS_MODE, 'public');
export const OptionalAuth = () => SetMetadata(ACCESS_MODE, 'optional');
export const AllowPending = () => SetMetadata(ACCESS_MODE, 'pending');
export const FileTicket = () => SetMetadata(ACCESS_MODE, 'file');
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<ApiRequest>().actor,
);
export const Paged = () =>
  applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'limit', required: false, type: Number, example: 20 }),
  );
const fieldSchemas: Record<string, SchemaObject> = {
  email: { type: 'string', format: 'email' },
  password: { type: 'string', minLength: 12, maxLength: 128 },
  passwordActual: { type: 'string' },
  passwordNueva: { type: 'string', minLength: 12, maxLength: 128 },
  edad: { type: 'integer', minimum: 0, maximum: 130 },
  versionLock: { type: 'integer', minimum: 1 },
  orden: { type: 'integer', minimum: 1 },
  capacidad: { type: 'integer', minimum: 1, maximum: 1000 },
  puntuacion: { type: 'integer', minimum: 1, maximum: 5 },
  posicionSegundos: { type: 'integer', minimum: 0 },
  precioBase: { type: 'string', example: '120.00', nullable: true },
  descuentoPorcentaje: { type: 'string', example: '10.00' },
  moneda: { type: 'string', example: 'NIO' },
  clienteId: { type: 'string', format: 'uuid' },
  grupoDocumento: { type: 'string', format: 'uuid' },
  requisitosDocumentales: { type: 'array', items: { type: 'string' } },
  roles: {
    type: 'array',
    items: {
      type: 'string',
      enum: ['usuario', 'revisor_tutores', 'moderador', 'administrador'],
    },
  },
};
export function BodyFields(
  summary: string,
  fields: string[],
  required = fields,
) {
  const properties = Object.fromEntries(
    fields.map((field) => [
      field,
      fieldSchemas[field] ??
        ([
          'activo',
          'publicada',
          'vistaPrevia',
          'completada',
          'telefonoPublico',
          'notificacionesActivas',
          'archivada',
          'silenciada',
        ].includes(field)
          ? { type: 'boolean' }
          : field.endsWith('En') || field === 'validaHasta'
            ? { type: 'string', format: 'date-time', nullable: true }
            : field.endsWith('Id')
              ? {
                  type: 'string',
                  pattern: '^[1-9][0-9]*$',
                  example: '1',
                  nullable: true,
                }
              : { type: 'string' }),
    ]),
  );
  return applyDecorators(
    ApiOperation({ summary }),
    ApiBody({
      schema: {
        type: 'object',
        additionalProperties: false,
        properties,
        required,
      },
    }),
  );
}

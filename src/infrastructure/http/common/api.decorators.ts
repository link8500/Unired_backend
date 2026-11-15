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
import {
  basicProfileFields,
  universityProfileFields,
} from '../../../domain/policies/user-profile';

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
  atributos: {
    type: 'object',
    additionalProperties: { type: 'string', maxLength: 200 },
  },
  etiquetas: {
    type: 'array',
    maxItems: 20,
    items: { type: 'string', maxLength: 60 },
  },
  disponibilidad: { type: 'string', enum: ['unico', 'varias_unidades'] },
  referenciaPrivada: { type: 'string', maxLength: 100, nullable: true },
  email: { type: 'string', format: 'email' },
  password: { type: 'string', minLength: 12, maxLength: 128 },
  passwordActual: { type: 'string' },
  passwordNueva: { type: 'string', minLength: 12, maxLength: 128 },
  edad: { type: 'integer', minimum: 0, maximum: 130, nullable: true },
  pais: { type: 'string', maxLength: 80, nullable: true, example: 'Nicaragua' },
  departamento: {
    type: 'string',
    maxLength: 120,
    nullable: true,
    example: 'Managua',
  },
  universidad: {
    type: 'string',
    maxLength: 180,
    nullable: true,
    example: 'UNAN-Managua',
  },
  sede: {
    type: 'string',
    maxLength: 180,
    nullable: true,
    example: 'Recinto central',
  },
  carrera: {
    type: 'string',
    maxLength: 180,
    nullable: true,
    example: 'Ingeniería en Sistemas',
  },
  anioEstudio: { type: 'integer', minimum: 1, maximum: 15, nullable: true },
  trabaja: {
    type: 'boolean',
    nullable: true,
    description: 'null: no indicado; false: no trabaja; true: trabaja.',
  },
  ocupacion: {
    type: 'string',
    maxLength: 160,
    nullable: true,
    description: 'Solo admite texto cuando trabaja=true.',
  },
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
  objetivos: {
    type: 'array',
    maxItems: 20,
    items: { type: 'string', maxLength: 300 },
  },
  requisitos: {
    type: 'array',
    maxItems: 20,
    items: { type: 'string', maxLength: 300 },
  },
  especialidades: {
    type: 'array',
    maxItems: 20,
    items: { type: 'string', maxLength: 300 },
  },
  formasEntrega: {
    type: 'array',
    maxItems: 4,
    items: {
      type: 'string',
      enum: ['retiro', 'punto_acordado', 'envio_local', 'envio_nacional'],
    },
  },
  roles: {
    type: 'array',
    items: {
      type: 'string',
      enum: ['usuario', 'revisor_tutores', 'moderador', 'administrador'],
    },
  },
};
function bodyProperties(fields: readonly string[]) {
  return Object.fromEntries(
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
}
export function BodyFields(
  summary: string,
  fields: string[],
  required = fields,
) {
  const properties = bodyProperties(fields);
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

/** El rol lo obtiene el servidor. No se acepta tipoPerfil ni roles en el JSON. */
export function ProfileBodyFields() {
  return applyDecorators(
    ApiOperation({
      summary:
        'Editar mi perfil; los administradores no admiten datos académicos ni edad',
    }),
    ApiBody({
      schema: {
        // anyOf: un PATCH básico también es válido para un universitario.
        anyOf: [
          {
            title: 'Perfil universitario',
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: bodyProperties([
              ...universityProfileFields,
              'avatarArchivoId',
              'bannerArchivoId',
            ]),
          },
          {
            title: 'Perfil de administrador',
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: bodyProperties([
              ...basicProfileFields,
              'avatarArchivoId',
              'bannerArchivoId',
            ]),
          },
        ],
      },
    }),
  );
}

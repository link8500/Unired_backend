import { Row } from '../common/contracts';
import { ensure } from '../common/errors';
import * as v from '../common/validation';

export const courseDetailFields = [
  'resumen',
  'objetivos',
  'requisitos',
  'dirigidoA',
] as const;
export const listingDetailFields = [
  'marca',
  'modelo',
  'zonaEntrega',
  'detalleEntrega',
  'formasEntrega',
] as const;
export const tutorApplicationFields = [
  'formacionAcademica',
  'experienciaDocente',
  'especialidades',
] as const;
export const deliveryOptions = [
  'retiro',
  'punto_acordado',
  'envio_local',
  'envio_nacional',
] as const;
const optional = (x: unknown, name: string, max: number) =>
  x === null ? null : v.text(x, name, max, 0) || null;
function list(x: unknown, name: string, max = 20): string[] {
  ensure(
    Array.isArray(x) && x.length <= max,
    `${name} debe ser una lista de hasta ${max} elementos.`,
  );
  return [...new Set(x.map((item: unknown) => v.text(item, name, 300)))];
}
/** Listas cerradas y PATCH parcial: omitir no borra, null solo vacía opcionales. */
export function courseDetails(body: Row): Row {
  if (!courseDetailFields.some((field) => body[field] !== undefined)) return {};
  return v.pickDefined(body, {
    resumen: (x) => optional(x, 'resumen', 500),
    objetivos: (x) => list(x, 'objetivos'),
    requisitos: (x) => list(x, 'requisitos'),
    dirigidoA: (x) => optional(x, 'dirigidoA', 1500),
  });
}
export function listingDetails(body: Row): Row {
  if (!listingDetailFields.some((field) => body[field] !== undefined))
    return {};
  return v.pickDefined(body, {
    marca: (x) => optional(x, 'marca', 100),
    modelo: (x) => optional(x, 'modelo', 120),
    zonaEntrega: (x) => optional(x, 'zonaEntrega', 180),
    detalleEntrega: (x) => optional(x, 'detalleEntrega', 1500),
    formasEntrega: (x) =>
      list(x, 'formasEntrega', 4).map((item) =>
        v.choice(item, deliveryOptions, 'forma de entrega'),
      ),
  });
}
export function applicationDetails(body: Row): Row {
  if (!tutorApplicationFields.some((field) => body[field] !== undefined))
    return {};
  return v.pickDefined(body, {
    formacionAcademica: (x) => optional(x, 'formacionAcademica', 3000),
    experienciaDocente: (x) => optional(x, 'experienciaDocente', 3000),
    especialidades: (x) => list(x, 'especialidades'),
  });
}

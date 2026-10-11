import { ensure } from './errors';
import { Pagination, Row } from './contracts';

/** Validación y listas de campos explícitas: no hay asignación masiva de permisos. */
export function object(input: unknown, allowed: string[]): Row {
  ensure(
    input && typeof input === 'object' && !Array.isArray(input),
    'Se espera un objeto JSON.',
  );
  const value = input as Row;
  ensure(
    Object.keys(value).every((key) => allowed.includes(key)),
    'La petición contiene campos no permitidos.',
  );
  return value;
}
export function text(value: unknown, name: string, max = 200, min = 1): string {
  ensure(typeof value === 'string', name + ' debe ser texto.');
  const result = value.trim();
  ensure(
    result.length >= min && result.length <= max,
    name + ' tiene una longitud inválida.',
  );
  return result;
}
export function email(value: unknown): string {
  const result = text(value, 'email', 254).toLowerCase();
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 'Correo inválido.');
  return result;
}
export function password(value: unknown): string {
  ensure(
    typeof value === 'string' && value.length >= 12 && value.length <= 128,
    'La contraseña debe tener entre 12 y 128 caracteres.',
  );
  return value;
}
export function secret(value: unknown, name: string, max = 128): string {
  ensure(
    typeof value === 'string' && value.length >= 1 && value.length <= max,
    name + ' es inválido.',
  );
  return value;
}
export function integer(
  value: unknown,
  name: string,
  min = 0,
  max = 2147483647,
): number {
  ensure(
    typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= min &&
      value <= max,
    name + ' debe ser un entero válido.',
  );
  return value;
}
export function id(value: unknown): string {
  ensure(
    typeof value === 'string' ||
      (typeof value === 'number' && Number.isSafeInteger(value)),
    'El ID debe ser una cadena o entero seguro.',
  );
  const result = String(value ?? '');
  ensure(
    /^[1-9]\d*$/.test(result) && BigInt(result) <= 9223372036854775807n,
    'ID inválido.',
  );
  return result;
}
export function userId(value: unknown): number {
  return integer(Number(id(value)), 'usuarioId', 1);
}
export function uuid(value: unknown): string {
  ensure(
    typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    'UUID inválido.',
  );
  return value;
}
export function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  name: string,
): T {
  ensure(
    typeof value === 'string' && values.includes(value as T),
    name + ' no es válido.',
  );
  return value as T;
}
export function boolean(value: unknown, name: string): boolean {
  ensure(typeof value === 'boolean', name + ' debe ser booleano.');
  return value;
}
export function date(value: unknown, name: string): Date {
  ensure(
    typeof value === 'string' && /T.*(Z|[+-]\d{2}:\d{2})$/.test(value),
    name + ' requiere fecha ISO con zona horaria.',
  );
  const result = new Date(value);
  ensure(Number.isFinite(result.getTime()), name + ' es inválida.');
  return result;
}
export function money(
  value: unknown,
  name: string,
  maxMinor = 999999999999n,
): string {
  ensure(
    typeof value === 'string' ||
      (typeof value === 'number' && Number.isFinite(value)),
    name + ' requiere un importe decimal.',
  );
  const raw = String(value ?? '');
  ensure(
    /^\d{1,10}(\.\d{1,2})?$/.test(raw),
    name + ' requiere un importe positivo o cero con máximo dos decimales.',
  );
  const [whole, decimal = ''] = raw.split('.');
  const minor = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));
  ensure(minor <= maxMinor, name + ' supera el límite.');
  return String(minor / 100n) + '.' + String(minor % 100n).padStart(2, '0');
}
export function pagination(input: Row): Pagination {
  const page =
    input.page === undefined
      ? 1
      : integer(Number(input.page), 'page', 1, 100000);
  const limit =
    input.limit === undefined
      ? 20
      : integer(Number(input.limit), 'limit', 1, 50);
  return {
    page,
    limit,
    ...(input.q === undefined ? {} : { q: text(input.q, 'q', 120) }),
  };
}
export function pickDefined(
  input: Row,
  parsers: Record<string, (value: unknown) => unknown>,
): Row {
  const result: Row = {};
  for (const [key, parser] of Object.entries(parsers)) {
    if (input[key] !== undefined) result[key] = parser(input[key]);
  }
  ensure(Object.keys(result).length, 'No hay campos editables.');
  return result;
}

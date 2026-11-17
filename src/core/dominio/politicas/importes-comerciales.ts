// Archivo: src/core/dominio/politicas/importes-comerciales.ts
// Opera con centavos enteros para cotizaciones, comisiones y saldos de demostración.
import { money } from '../comun/validaciones';
export function centavos(value: unknown): bigint {
  return BigInt(money(value, 'importe').replace('.', ''));
}
export function importe(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return (
    sign +
    String(absolute / 100n) +
    '.' +
    String(absolute % 100n).padStart(2, '0')
  );
}
export function comision(total: unknown, porcentaje: unknown): string {
  return importe((centavos(total) * centavos(porcentaje) + 5000n) / 10000n);
}

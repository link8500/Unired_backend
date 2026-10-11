import { Row } from '../common/contracts';
import { ensure } from '../common/errors';
import { choice, money, text } from '../common/validation';

/** Dinero decimal exacto; nunca se usa un float para calcular el precio final. */
export function price(input: Row, listing: boolean): Row {
  const tipoPrecio = listing
    ? choice(
        input.tipoPrecio ?? 'negociable',
        ['fijo', 'negociable', 'gratis', 'a_consultar'],
        'tipoPrecio',
      )
    : undefined;
  const precioBase =
    tipoPrecio === 'a_consultar'
      ? null
      : money(input.precioBase ?? 0, 'precioBase');
  const descuentoPorcentaje = money(
    input.descuentoPorcentaje ?? 0,
    'descuentoPorcentaje',
    9000n,
  );
  if (tipoPrecio === 'a_consultar')
    ensure(
      input.precioBase === undefined || input.precioBase === null,
      'A consultar requiere precio nulo.',
    );
  if (tipoPrecio === 'gratis')
    ensure(precioBase === '0.00', 'Gratis requiere precio cero.');
  if (tipoPrecio === 'fijo' || tipoPrecio === 'negociable')
    ensure(
      precioBase !== '0.00',
      'Este tipo de precio requiere un importe mayor que cero.',
    );
  if (precioBase === null || precioBase === '0.00')
    ensure(
      descuentoPorcentaje === '0.00',
      'No se aplica descuento a un precio nulo o cero.',
    );
  const moneda = text(input.moneda ?? 'NIO', 'moneda', 3, 3).toUpperCase();
  ensure(/^[A-Z]{3}$/.test(moneda), 'Moneda inválida.');
  return {
    ...(listing ? { tipoPrecio } : {}),
    precioBase,
    descuentoPorcentaje,
    moneda,
  };
}
export function finalPrice(base: string, discount: string): string {
  const minor = BigInt(base.replace('.', ''));
  const percent = BigInt(discount.replace('.', ''));
  const discounted = (minor * (10000n - percent) + 5000n) / 10000n;
  return (
    String(discounted / 100n) + '.' + String(discounted % 100n).padStart(2, '0')
  );
}

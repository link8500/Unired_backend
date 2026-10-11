import * as v from './validation';
import { DomainError } from './errors';
import { price, finalPrice } from '../policies/prices';
import { validGrant, readyFile } from '../policies/access';

describe('Reglas independientes del framework', () => {
  it('rechaza asignación masiva de privilegios', () => {
    expect(() =>
      v.object({ nombre: 'Ana', roles: ['administrador'] }, ['nombre']),
    ).toThrow(DomainError);
  });
  it('normaliza correo sin aceptar cadenas inválidas', () => {
    expect(v.email('  ANA@EXAMPLE.TEST ')).toBe('ana@example.test');
    expect(() => v.email('sin-correo')).toThrow();
  });
  it('conserva la contraseña exacta sin recortar espacios', () => {
    expect(v.secret('  contraseña  ', 'password')).toBe('  contraseña  ');
  });
  it('rechaza IDs fuera de bigint positivo', () => {
    for (const value of ['0', '-1', '1.5', '../1', '9223372036854775808'])
      expect(() => v.id(value)).toThrow();
    expect(v.id('9007199254740993')).toBe('9007199254740993');
  });
  it('limita paginación y edad', () => {
    expect(v.pagination({ page: '2', limit: '10' })).toEqual({
      page: 2,
      limit: 10,
    });
    expect(() => v.pagination({ limit: '99999' })).toThrow();
    expect(() => v.integer(131, 'edad', 0, 130)).toThrow();
  });
  it('requiere zona horaria explícita', () => {
    expect(v.date('2026-10-09T12:00:00Z', 'inicio').toISOString()).toBe(
      '2026-10-09T12:00:00.000Z',
    );
    expect(() => v.date('2026-10-09', 'inicio')).toThrow();
  });
  it('usa dinero decimal exacto', () => {
    expect(v.money('0.1', 'precio')).toBe('0.10');
    expect(finalPrice('100.00', '10.00')).toBe('90.00');
    expect(finalPrice('0.10', '10.00')).toBe('0.09');
    expect(() => v.money('1.123', 'precio')).toThrow();
  });
  it('gratis y a consultar no aceptan ofertas incoherentes', () => {
    expect(
      price({ tipoPrecio: 'gratis', precioBase: '0.00' }, true).precioBase,
    ).toBe('0.00');
    expect(
      price({ tipoPrecio: 'a_consultar', precioBase: null }, true).precioBase,
    ).toBeNull();
    expect(() =>
      price({ tipoPrecio: 'gratis', precioBase: '1.00' }, true),
    ).toThrow();
    expect(() =>
      price({ tipoPrecio: 'a_consultar', descuentoPorcentaje: 1 }, true),
    ).toThrow();
    expect(() =>
      price(
        {
          tipoPrecio: 'fijo',
          precioBase: '20.00',
          descuentoPorcentaje: '90.01',
        },
        true,
      ),
    ).toThrow();
  });
  it('una habilitación no habilita otro tutor, área o fecha', () => {
    const grant = {
      tutorId: 5,
      areaId: 2,
      estado: 'vigente',
      validaDesde: new Date('2025-01-01'),
      validaHasta: new Date('2030-01-01'),
    };
    expect(validGrant(grant, 5, 2)).toBe(true);
    expect(validGrant(grant, 6, 2)).toBe(false);
    expect(validGrant(grant, 5, 3)).toBe(false);
    expect(validGrant({ ...grant, estado: 'suspendida' }, 5, 2)).toBe(false);
    expect(
      validGrant({ ...grant, validaHasta: new Date('2020-01-01') }, 5, 2),
    ).toBe(false);
  });
  it('no autoriza videos pendientes o archivos sin escanear', () => {
    const file = {
      estado: 'listo',
      escaneo: 'limpio',
      mimeDetectado: 'video/mp4',
      procesamiento: 'listo',
    };
    expect(readyFile(file)).toBe(true);
    expect(readyFile({ ...file, procesamiento: 'pendiente' })).toBe(false);
    expect(readyFile({ ...file, escaneo: 'pendiente' })).toBe(false);
    expect(readyFile({ ...file, eliminadoEn: new Date() })).toBe(false);
  });
});

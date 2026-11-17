import { cotizarCurso, cotizarMinutos } from './cotizacion-tutoria';
import { Transaccion } from '../dominio/comun/contratos';

describe('Cotización compartida', () => {
  function fixture(rate: string | null = '0.30', minutes = 3) {
    return {
      store: {
        one: jest.fn(async (table: string) =>
          table === 'configuracion_comercial'
            ? {
                precioMinutoOnline: '3.00',
                precioMinutoPresencial: '4.00',
                comisionPorcentaje: '7.50',
              }
            : { precioMinutoOnline: rate },
        ),
      },
      queries: { courseDuration: jest.fn(async () => minutes) },
    } as unknown as Transaccion;
  }
  it('calcula centavos y redondea una comisión sin errores de coma flotante', async () => {
    const value = await cotizarMinutos(fixture(), 1, 'online', 3);
    expect(value.total).toBe('0.90');
    expect(value.comision).toBe('0.07');
  });
  it('conserva una tarifa gratuita explícita y utiliza la general solo si falta la particular', async () => {
    expect((await cotizarMinutos(fixture('0.00'), 1, 'online', 30)).total).toBe(
      '0.00',
    );
    expect((await cotizarMinutos(fixture(null), 1, 'online', 30)).total).toBe(
      '90.00',
    );
  });
  it('distingue un borrador sin contenido y consulta solo la duración publicada', async () => {
    const tx = fixture(null, 0);
    const value = await cotizarCurso(tx, { id: '9', areaId: 1 });
    expect(value.pendienteContenido).toBe(true);
    expect(tx.queries.courseDuration).toHaveBeenCalledWith('9', true);
    expect(
      (await cotizarCurso(fixture('0.00', 30), { id: '9', areaId: 1 }))
        .pendienteContenido,
    ).toBe(false);
  });
  it('rechaza duraciones negativas o fraccionarias antes de leer tarifas', async () => {
    for (const minutes of [-1, 1.5, Infinity])
      await expect(
        cotizarMinutos(fixture(), 1, 'online', minutes),
      ).rejects.toThrow();
  });
});

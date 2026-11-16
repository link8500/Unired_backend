// Archivo: src/core/dominio/politicas/atributos-market.spec.ts
// Pruebas automatizadas del componente atributos-market y sus condiciones de error.

import { categoryFields, extraMarketDetails } from './atributos-market';
describe('Atributos de categorías del marketplace', () => {
  it('define campos distintos por categoría y valida sus claves', () => {
    expect(categoryFields('libros').map((f) => f.key)).toContain('isbn');
    expect(categoryFields('tecnologia').map((f) => f.key)).toContain('memoria');
    expect(
      extraMarketDetails(
        {
          atributos: { autor: ' Ana ' },
          etiquetas: ['libro', 'libro'],
          referenciaPrivada: '',
        },
        'libros',
      ),
    ).toEqual({
      atributos: { autor: 'Ana' },
      etiquetas: ['libro'],
      referenciaPrivada: null,
    });
    expect(() =>
      extraMarketDetails({ atributos: { memoria: '8 GB' } }, 'libros'),
    ).toThrow();
  });
  it('limita listas y valores y conserva la semántica de PATCH', () => {
    expect(extraMarketDetails({}, 'libros')).toEqual({});
    expect(() =>
      extraMarketDetails({ etiquetas: Array(21).fill('dato') }, 'libros'),
    ).toThrow();
    expect(() =>
      extraMarketDetails({ disponibilidad: 'otra' }, 'libros'),
    ).toThrow();
    expect(() =>
      extraMarketDetails({ atributos: { formato: 'Inválido' } }, 'libros'),
    ).toThrow();
    expect(extraMarketDetails({ atributos: {} }, 'libros')).toEqual({
      atributos: {},
    });
  });
});

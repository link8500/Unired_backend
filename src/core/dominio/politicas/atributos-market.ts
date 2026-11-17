// Archivo: src/core/dominio/politicas/atributos-market.ts
// Define y valida los atributos específicos que corresponden a la categoría de un anuncio.

import { Registro } from '../comun/contratos';
import { ensure } from '../comun/errores';
import * as v from '../comun/validaciones';

type Field = { key: string; label: string; options?: string[] };
/** Definición del servidor; el navegador no decide qué atributos acepta una categoría. */
export function categoryFields(code: unknown): Field[] {
  switch (String(code)) {
    case 'salud-bienestar':
      return [
        { key: 'presentacion', label: 'Presentación' },
        { key: 'familia', label: 'Categoría del artículo' },
        { key: 'unidad', label: 'Unidad de presentación' },
      ];
    case 'libros':
      return [
        { key: 'autor', label: 'Autor' },
        { key: 'editorial', label: 'Editorial' },
        { key: 'edicion', label: 'Edición' },
        { key: 'isbn', label: 'ISBN' },
        { key: 'idioma', label: 'Idioma' },
        {
          key: 'formato',
          label: 'Formato',
          options: ['Tapa blanda', 'Tapa dura', 'Digital'],
        },
      ];
    case 'tecnologia':
      return [
        { key: 'capacidad', label: 'Capacidad o almacenamiento' },
        { key: 'memoria', label: 'Memoria RAM' },
        { key: 'procesador', label: 'Procesador' },
        { key: 'garantia', label: 'Garantía' },
        { key: 'incluye', label: 'Accesorios incluidos' },
      ];
    case 'materiales':
      return [
        { key: 'asignatura', label: 'Asignatura o uso' },
        { key: 'nivel', label: 'Nivel de estudio' },
        { key: 'cantidad', label: 'Cantidad o contenido' },
        { key: 'material', label: 'Material' },
      ];
    case 'accesorios':
      return [
        { key: 'material', label: 'Material' },
        { key: 'color', label: 'Color' },
        { key: 'talla', label: 'Talla o medidas' },
        { key: 'compatibilidad', label: 'Compatibilidad' },
      ];
    default:
      return [
        { key: 'material', label: 'Material' },
        { key: 'medidas', label: 'Medidas' },
        { key: 'incluye', label: 'Contenido incluido' },
      ];
  }
}
export const extraMarketFields = [
  'tipoPublicacion',
  'atributos',
  'etiquetas',
  'disponibilidad',
  'referenciaPrivada',
] as const;
export function extraMarketDetails(
  body: Registro,
  categoryCode: unknown,
): Registro {
  const out: Registro = {};
  if (body.tipoPublicacion !== undefined)
    out.tipoPublicacion = v.choice(
      body.tipoPublicacion,
      ['venta', 'compra', 'intercambio'],
      'tipoPublicacion',
    );
  if (body.atributos !== undefined) {
    const fields = categoryFields(categoryCode);
    const data = v.object(
      body.atributos,
      fields.map((f) => f.key),
    );
    out.atributos = Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => value !== null && value !== '')
        .map(([key, value]) => {
          const field = fields.find((f) => f.key === key)!;
          return [
            key,
            field.options
              ? v.choice(value, field.options, key)
              : v.text(value, key, 200),
          ];
        }),
    );
  }
  if (body.etiquetas !== undefined) {
    ensure(
      Array.isArray(body.etiquetas) && body.etiquetas.length <= 20,
      'Máximo 20 etiquetas.',
    );
    out.etiquetas = [
      ...new Set(body.etiquetas.map((x) => v.text(x, 'etiqueta', 60))),
    ];
  }
  if (body.disponibilidad !== undefined)
    out.disponibilidad = v.choice(
      body.disponibilidad,
      ['unico', 'varias_unidades'],
      'disponibilidad',
    );
  if (body.referenciaPrivada !== undefined)
    out.referenciaPrivada =
      body.referenciaPrivada === null
        ? null
        : v.text(body.referenciaPrivada, 'referenciaPrivada', 100, 0) || null;
  return out;
}

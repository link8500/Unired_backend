// Archivo: src/core/dominio/politicas/filtros-academicos.ts
// Valida los mismos filtros públicos en ambos catálogos y en la búsqueda global.
import { Registro } from '../comun/contratos';
import * as v from '../comun/validaciones';
export function filtrosAcademicos(query: Registro): Registro {
  const fields: Registro = {};
  for (const key of ['universidad', 'carrera', 'materia'])
    if (query[key] !== undefined && query[key] !== '')
      fields[key] = v.text(query[key], key, 180);
  if (query.anioEstudio !== undefined && query.anioEstudio !== '')
    fields.anioEstudio = v.integer(
      Number(query.anioEstudio),
      'anioEstudio',
      1,
      15,
    );
  return fields;
}

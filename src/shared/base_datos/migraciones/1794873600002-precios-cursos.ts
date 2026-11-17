// Archivo: src/shared/base_datos/migraciones/1794873600002-precios-cursos.ts
// Incorpora al catálogo existente la regla de precio automático de los cursos.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';
export class PreciosCursos1794873600002 implements MigrationInterface {
  name = 'PreciosCursos1794873600002';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      readFileSync(
        resolve(process.cwd(), 'database/design/10_precios_cursos.sql'),
        'utf8',
      ),
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'No se restauran precios manuales sin revisar los historiales.',
      ),
    );
  }
}

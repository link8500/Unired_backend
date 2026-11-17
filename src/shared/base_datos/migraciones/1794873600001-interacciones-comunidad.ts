// Archivo: src/shared/base_datos/migraciones/1794873600001-interacciones-comunidad.ts
// Añade aceptación de ofertas, solicitudes abiertas y reputación entre participantes.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';
export class InteraccionesComunidad1794873600001 implements MigrationInterface {
  name = 'InteraccionesComunidad1794873600001';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      readFileSync(
        resolve(
          process.cwd(),
          'database/design/09_interacciones_comunidad.sql',
        ),
        'utf8',
      ),
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'No se destruyen solicitudes, negociaciones ni reseñas automáticamente.',
      ),
    );
  }
}

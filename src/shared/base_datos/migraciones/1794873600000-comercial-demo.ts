// Archivo: src/shared/base_datos/migraciones/1794873600000-comercial-demo.ts
// Añade empresas, campañas y operaciones de demostración sin datos bancarios.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComercialDemo1794873600000 implements MigrationInterface {
  name = 'ComercialDemo1794873600000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      readFileSync(
        resolve(process.cwd(), 'database/design/08_comercial_demo.sql'),
        'utf8',
      ),
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error('No se eliminan empresas ni historiales automáticamente.'),
    );
  }
}

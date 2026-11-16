// Archivo: src/shared/base_datos/migraciones/1793664000000-publication-details.ts
// Migración histórica de PostgreSQL; conserva su identificador y nombre para reconocer las versiones ya aplicadas.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/** Solo añade columnas opcionales y valores iniciales compatibles. */
export class PublicationDetails1793664000000 implements MigrationInterface {
  name = 'PublicationDetails1793664000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      readFileSync(
        resolve(process.cwd(), 'database/design/06_publication_details.sql'),
        'utf8',
      ),
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'No se elimina información publicada automáticamente. Revertir requiere una operación explícita.',
      ),
    );
  }
}

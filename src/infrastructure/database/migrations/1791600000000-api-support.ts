import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/** Migración aditiva: no elimina ni reconstruye tablas o datos existentes. */
export class ApiSupport1791600000000 implements MigrationInterface {
  name = 'ApiSupport1791600000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      readFileSync(
        resolve(process.cwd(), 'database/design/04_api_support.sql'),
        'utf8',
      ),
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error('Esta migración no elimina información automáticamente.'),
    );
  }
}

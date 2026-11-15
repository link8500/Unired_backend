import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/** Ampliación de perfiles sin borrar datos ni modificar migraciones ejecutadas. */
export class UserProfiles1791700000000 implements MigrationInterface {
  name = 'UserProfiles1791700000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      readFileSync(
        resolve(process.cwd(), 'database/design/05_user_profiles.sql'),
        'utf8',
      ),
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Esta migración no elimina datos personales automáticamente. Revertirla requiere una operación explícita.',
      ),
    );
  }
}

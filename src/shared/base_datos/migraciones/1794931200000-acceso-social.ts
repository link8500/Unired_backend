import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';
/** Amplía el acceso sin modificar contraseñas, cuentas ni roles existentes. */
export class AccesoSocial1794931200000 implements MigrationInterface {
  name = 'AccesoSocial1794931200000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      readFileSync(
        resolve(process.cwd(), 'database/design/11_acceso_social.sql'),
        'utf8',
      ),
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'No se eliminan los métodos de acceso de las cuentas automáticamente.',
      ),
    );
  }
}

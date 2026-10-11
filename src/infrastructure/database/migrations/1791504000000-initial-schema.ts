import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791504000000 implements MigrationInterface {
  name = 'InitialSchema1791504000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    const [{ existing }] = (await queryRunner.query(
      "SELECT to_regclass('public.usuarios') AS existing",
    )) as { existing: string | null }[];
    if (existing)
      throw new Error(
        'La base contiene usuarios pero no esta migración. No se sobrescriben datos; revisa una migración de transición.',
      );
    const sql = readFileSync(
      resolve(process.cwd(), 'database/design/01_modelo_postgresql.sql'),
      'utf8',
    );
    await queryRunner.query(sql);
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Esta migración inicial no borra datos automáticamente. Restaurar un respaldo requiere una operación explícita.',
      ),
    );
  }
}

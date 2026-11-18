import { MigrationInterface, QueryRunner } from 'typeorm';

export class TutoriasGratuitas1795017600000 implements MigrationInterface {
  name = 'TutoriasGratuitas1795017600000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE configuracion_comercial ADD COLUMN tutorias_gratuitas boolean NOT NULL DEFAULT true',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE configuracion_comercial DROP COLUMN tutorias_gratuitas',
    );
  }
}

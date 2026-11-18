import { MigrationInterface, QueryRunner } from 'typeorm';

export class SesionesPorNavegador1795104000000 implements MigrationInterface {
  name = 'SesionesPorNavegador1795104000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE sesiones_usuario ADD COLUMN navegador_id uuid, ADD COLUMN dispositivo varchar(60)',
    );
    // No atribuir sesiones anteriores a un dispositivo a partir de su IP.
    await runner.query(`CREATE UNIQUE INDEX uq_sesion_por_navegador
      ON sesiones_usuario (usuario_id, navegador_id)
      WHERE navegador_id IS NOT NULL AND revocada_en IS NULL`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP INDEX uq_sesion_por_navegador');
    await runner.query(
      'ALTER TABLE sesiones_usuario DROP COLUMN navegador_id, DROP COLUMN dispositivo',
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class PagoDemoTutoria1795017600001 implements MigrationInterface {
  name = 'PagoDemoTutoria1795017600001';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE solicitudes_apoyo
      ADD COLUMN requiere_pago_demo boolean NOT NULL DEFAULT false`);
    await runner.query(`UPDATE solicitudes_apoyo SET requiere_pago_demo = true
      WHERE estado = 'publicada' AND precio > 0`);
    await runner.query(`ALTER TABLE pagos_demo
      DROP CONSTRAINT pagos_demo_concepto_check,
      ADD CONSTRAINT pagos_demo_concepto_check CHECK (
        concepto IN ('suscripcion_empresa','recarga_tutor','destacar_anuncio','destacar_curso')
        OR (concepto = 'tutoria_solicitud' AND recurso_id IS NOT NULL)
      )`);
    await runner.query(`CREATE UNIQUE INDEX uq_pago_demo_solicitud
      ON pagos_demo (recurso_id) WHERE concepto = 'tutoria_solicitud'`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "DELETE FROM pagos_demo WHERE concepto = 'tutoria_solicitud'",
    );
    await runner.query('DROP INDEX uq_pago_demo_solicitud');
    await runner.query(
      'ALTER TABLE solicitudes_apoyo DROP COLUMN requiere_pago_demo',
    );
    await runner.query(`ALTER TABLE pagos_demo
      DROP CONSTRAINT pagos_demo_concepto_check,
      ADD CONSTRAINT pagos_demo_concepto_check CHECK (
        concepto IN ('suscripcion_empresa','recarga_tutor','destacar_anuncio','destacar_curso')
      )`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrecioPorTutoria1795017600002 implements MigrationInterface {
  name = 'PrecioPorTutoria1795017600002';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE tutorias ADD COLUMN gratuita boolean NOT NULL DEFAULT false',
    );
    await runner.query(
      'UPDATE tutorias SET gratuita=true WHERE publicada_en IS NOT NULL AND precio_base=0',
    );
    await runner.query(`ALTER TABLE inscripciones_tutoria
      ADD COLUMN importe_demo numeric(12,2) NOT NULL DEFAULT 0 CHECK (importe_demo >= 0),
      ADD COLUMN aprobada_para_pago_en timestamptz`);
    await this.currentConstraint(runner, true);
    await runner.query(`CREATE UNIQUE INDEX uq_pago_demo_inscripcion
      ON pagos_demo (recurso_id) WHERE concepto = 'tutoria_inscripcion'`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "DELETE FROM pagos_demo WHERE concepto = 'tutoria_inscripcion'",
    );
    await runner.query('DROP INDEX uq_pago_demo_inscripcion');
    await this.currentConstraint(runner, false);
    await runner.query(
      'ALTER TABLE inscripciones_tutoria DROP COLUMN aprobada_para_pago_en, DROP COLUMN importe_demo',
    );
    await runner.query('ALTER TABLE tutorias DROP COLUMN gratuita');
  }

  private async currentConstraint(runner: QueryRunner, enrollments: boolean) {
    await runner.query(`ALTER TABLE pagos_demo DROP CONSTRAINT pagos_demo_concepto_check,
      ADD CONSTRAINT pagos_demo_concepto_check CHECK (
        concepto IN ('suscripcion_empresa','recarga_tutor','destacar_anuncio','destacar_curso')
        OR (concepto IN ('tutoria_solicitud'${enrollments ? ",'tutoria_inscripcion'" : ''}) AND recurso_id IS NOT NULL)
      )`);
  }
}

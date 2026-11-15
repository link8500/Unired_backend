import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';
export class MarketAttributes1793750400000 implements MigrationInterface {
  name = 'MarketAttributes1793750400000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      readFileSync(
        resolve(process.cwd(), 'database/design/07_market_attributes.sql'),
        'utf8',
      ),
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error('No se eliminan detalles de publicaciones automáticamente.'),
    );
  }
}

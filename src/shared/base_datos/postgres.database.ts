// Archivo: src/shared/base_datos/postgres.database.ts
// Implementa consultas genéricas de entidades y transacciones con PostgreSQL.

import { DataSource, EntityManager } from 'typeorm';
import {
  BaseDatos,
  OpcionesBusqueda,
  Registro,
  AlmacenDatos,
  Transaccion,
  Filtros,
} from '../../core/dominio/comun/contratos';
import { schema } from './esquema';
import { PostgresQueries } from './postgres.queries';
import {
  MapaEntidades,
  NombreEntidad,
} from '../../core/dominio/comun/entidades';

export function camelRow(row: Registro): Registro {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_match, letter: string) =>
        letter.toUpperCase(),
      ),
      value,
    ]),
  );
}
type Executor = { query(sql: string, values?: unknown[]): Promise<unknown> };
/** Adaptador parametrizado. Identificadores permitidos solo por el mapa interno. */
export class PostgresStore implements AlmacenDatos {
  constructor(private readonly manager: Executor) {}
  /** Único límite de conversión del driver: datos definidos por nuestro SQL/esquema. */
  private async query<T>(sql: string, values: unknown[]): Promise<T> {
    return (await this.manager.query(sql, values)) as T;
  }
  private metadata(entity: string) {
    const definition = schema[entity];
    if (!definition) throw new Error('Entidad interna desconocida.');
    return definition;
  }
  private column(entity: string, key: string): string {
    const column = this.metadata(entity).columns[key];
    if (!column)
      throw new Error('Campo interno desconocido: ' + entity + '.' + key);
    return '"' + column + '"';
  }
  private where(
    entity: string,
    where: Filtros | Filtros[],
    values: unknown[],
  ): string {
    if (Array.isArray(where))
      return where.length
        ? '(' +
            where
              .map((entry) => this.where(entity, entry, values))
              .join(' OR ') +
            ')'
        : 'FALSE';
    const terms = Object.entries(where).map(([key, condition]) => {
      const column = this.column(entity, key);
      if (condition === null) return column + ' IS NULL';
      if (
        condition &&
        typeof condition === 'object' &&
        !(condition instanceof Date) &&
        !Buffer.isBuffer(condition) &&
        'op' in condition
      ) {
        if (condition.op === 'ne' && condition.value === null)
          return column + ' IS NOT NULL';
        if (condition.op === 'in') {
          const array = condition.value as unknown[];
          if (!array.length) return 'FALSE';
          return (
            column +
            ' IN (' +
            array
              .map((value) => {
                values.push(value);
                return '$' + values.length;
              })
              .join(',') +
            ')'
          );
        }
        const operators = {
          gt: '>',
          gte: '>=',
          lt: '<',
          lte: '<=',
          ne: '<>',
          like: 'ILIKE',
        };
        values.push(condition.value);
        return column + ' ' + operators[condition.op] + ' $' + values.length;
      }
      values.push(condition);
      return column + ' = $' + values.length;
    });
    return terms.length ? '(' + terms.join(' AND ') + ')' : 'TRUE';
  }
  async find<K extends NombreEntidad>(
    entity: K,
    where: Filtros | Filtros[] = {},
    options: OpcionesBusqueda = {},
  ): Promise<MapaEntidades[K][]> {
    this.metadata(entity);
    const values: unknown[] = [];
    const fields =
      options.fields?.map((key) => this.column(entity, key)).join(',') ?? '*';
    let sql =
      'SELECT ' +
      fields +
      ' FROM "' +
      entity +
      '" WHERE ' +
      this.where(entity, where, values);
    if (options.order)
      sql +=
        ' ORDER BY ' +
        Object.entries(options.order)
          .map(([key, direction]) => {
            if (!['ASC', 'DESC'].includes(direction))
              throw new Error('Orden interno inválido.');
            return this.column(entity, key) + ' ' + direction;
          })
          .join(',');
    if (options.limit !== undefined) {
      values.push(options.limit);
      sql += ' LIMIT $' + values.length;
    }
    if (options.offset !== undefined) {
      values.push(options.offset);
      sql += ' OFFSET $' + values.length;
    }
    if (options.lock) sql += ' FOR UPDATE';
    return (await this.query<Registro[]>(sql, values)).map(
      camelRow,
    ) as MapaEntidades[K][];
  }
  async one<K extends NombreEntidad>(
    entity: K,
    where: Filtros | Filtros[],
    options: OpcionesBusqueda = {},
  ): Promise<MapaEntidades[K] | undefined> {
    return (await this.find(entity, where, { ...options, limit: 1 }))[0];
  }
  async count(
    entity: NombreEntidad,
    where: Filtros | Filtros[] = {},
  ): Promise<number> {
    this.metadata(entity);
    const values: unknown[] = [];
    const [result] = await this.query<{ total: number }[]>(
      'SELECT COUNT(*)::int AS total FROM "' +
        entity +
        '" WHERE ' +
        this.where(entity, where, values),
      values,
    );
    return result.total;
  }
  private encoded(entity: string, key: string, value: unknown): unknown {
    return this.metadata(entity).json.includes(key) && value !== null
      ? JSON.stringify(value)
      : value;
  }
  async insert<K extends NombreEntidad>(
    entity: K,
    input: Registro,
  ): Promise<MapaEntidades[K]> {
    const pairs = Object.entries(input).filter(
      ([, value]) => value !== undefined,
    );
    const columns = pairs.map(([key]) => this.column(entity, key));
    const values = pairs.map(([key, value]) =>
      this.encoded(entity, key, value),
    );
    const [result] = await this.query<Registro[]>(
      'INSERT INTO "' +
        entity +
        '" (' +
        columns.join(',') +
        ') VALUES (' +
        values.map((_value, index) => '$' + (index + 1)).join(',') +
        ') RETURNING *',
      values,
    );
    return camelRow(result) as MapaEntidades[K];
  }
  async update<K extends NombreEntidad>(
    entity: K,
    where: Filtros,
    input: Registro,
  ): Promise<MapaEntidades[K][]> {
    if (!Object.keys(where).length)
      throw new Error('Actualización sin filtro prohibida.');
    const pairs = Object.entries(input).filter(
      ([, value]) => value !== undefined,
    );
    if (!pairs.length) throw new Error('Actualización vacía.');
    const values: unknown[] = [];
    const assignments = pairs.map(([key, value]) => {
      values.push(this.encoded(entity, key, value));
      return this.column(entity, key) + ' = $' + values.length;
    });
    const raw = await this.query<Registro[] | [Registro[], number]>(
      'UPDATE "' +
        entity +
        '" SET ' +
        assignments.join(',') +
        ' WHERE ' +
        this.where(entity, where, values) +
        ' RETURNING *',
      values,
    );
    // TypeORM/PostgreSQL devuelve [filas, cantidad] para UPDATE/DELETE.
    const rows = Array.isArray(raw[0]) ? raw[0] : raw;
    return (rows as Registro[]).map(camelRow) as MapaEntidades[K][];
  }
  async remove(entity: NombreEntidad, where: Filtros): Promise<void> {
    if (!Object.keys(where).length)
      throw new Error('Borrado sin filtro prohibido.');
    const values: unknown[] = [];
    await this.manager.query(
      'DELETE FROM "' + entity + '" WHERE ' + this.where(entity, where, values),
      values,
    );
  }
}
export class PostgresDatabase implements BaseDatos {
  readonly read: Transaccion;
  constructor(readonly source: DataSource) {
    this.read = this.scope(source.manager);
  }
  private scope(manager: EntityManager): Transaccion {
    return {
      store: new PostgresStore(manager),
      queries: new PostgresQueries(manager),
    };
  }
  async transaction<T>(work: (tx: Transaccion) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.source.transaction((manager) =>
          work(this.scope(manager)),
        );
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (attempt >= 2 || !['40P01', '40001'].includes(code ?? ''))
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
  }
  async close(): Promise<void> {
    if (this.source.isInitialized) await this.source.destroy();
  }
}

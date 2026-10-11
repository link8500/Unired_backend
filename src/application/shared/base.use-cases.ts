import {
  Actor,
  Database,
  Page,
  Pagination,
  Row,
  Store,
  Transaction,
  Where,
} from '../../domain/common/contracts';
import { ensure, missing } from '../../domain/common/errors';
import { id } from '../../domain/common/validation';
import { own, readyFile } from '../../domain/policies/access';
import { EntityMap, EntityName, Archivos } from '../../domain/common/models';

/** Herramientas comunes de casos de uso. Las decisiones permanecen en application. */
export class BaseUseCases {
  constructor(protected readonly db: Database) {}
  protected async resource<K extends EntityName>(
    store: Store,
    entity: K,
    resourceId: unknown,
    lock = false,
  ): Promise<EntityMap[K]> {
    const row = await store.one(entity, { id: id(resourceId) }, { lock });
    if (!row || row.eliminadoEn || row.eliminadaEn || row.archivadaEn)
      missing();
    return row;
  }
  protected async owned<K extends EntityName>(
    store: Store,
    entity: K,
    resourceId: unknown,
    actor: Actor,
    field: string,
    lock = true,
  ): Promise<EntityMap[K]> {
    const row = await this.resource(store, entity, resourceId, lock);
    own(actor, row[field]);
    return row;
  }
  protected async file(
    store: Store,
    fileId: unknown,
    actor: Actor,
    purpose: string,
  ): Promise<Archivos> {
    const file = await this.resource(store, 'archivos', fileId);
    own(actor, file.propietarioId);
    ensure(
      file.proposito === purpose && readyFile(file),
      'Archivo no disponible o de otro propósito.',
      409,
      'FILE_NOT_READY',
    );
    return file;
  }
  protected async page<K extends EntityName>(
    store: Store,
    entity: K,
    where: Where | Where[],
    p: Pagination,
    order: Record<string, 'ASC' | 'DESC'> = { id: 'DESC' },
  ): Promise<Page<EntityMap[K]>> {
    const [items, total] = await Promise.all([
      store.find(entity, where, {
        limit: p.limit,
        offset: (p.page - 1) * p.limit,
        order,
      }),
      store.count(entity, where),
    ]);
    return { items, total, page: p.page, limit: p.limit };
  }
  protected audit(
    tx: Transaction,
    actor: Actor | undefined,
    action: string,
    entity: string,
    entityId: unknown,
    summary: Row = {},
  ): Promise<Row> {
    return tx.store.insert('eventos_auditoria', {
      actorId: actor?.id ?? null,
      accion: action,
      entidad: entity,
      entidadId: String(entityId),
      resumen: summary,
    });
  }
  protected async notify(
    tx: Transaction,
    userId: number,
    type: string,
    title: string,
    data: Row = {},
  ): Promise<Row | undefined> {
    const profile = await tx.store.one('perfiles_usuario', {
      usuarioId: userId,
    });
    if (profile?.notificacionesActivas === false) return undefined;
    return tx.store.insert('notificaciones', {
      usuarioId: userId,
      tipo: type,
      titulo: title,
      datos: data,
    });
  }
}

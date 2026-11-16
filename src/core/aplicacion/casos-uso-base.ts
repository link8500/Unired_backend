// Archivo: src/core/aplicacion/casos-uso-base.ts
// Proporciona operaciones comunes para consultar recursos, verificar propiedad, paginar, auditar y notificar.

import {
  Actor,
  BaseDatos,
  Pagina,
  Paginacion,
  Registro,
  AlmacenDatos,
  Transaccion,
  Filtros,
} from '../dominio/comun/contratos';
import { ensure, missing } from '../dominio/comun/errores';
import { id } from '../dominio/comun/validaciones';
import { own, readyFile } from '../dominio/politicas/acceso';
import {
  MapaEntidades,
  NombreEntidad,
  Archivos,
} from '../dominio/comun/entidades';

/** Herramientas comunes de casos de uso. Las decisiones permanecen en application. */
export class CasosUsoBase {
  constructor(protected readonly db: BaseDatos) {}
  protected async resource<K extends NombreEntidad>(
    store: AlmacenDatos,
    entity: K,
    resourceId: unknown,
    lock = false,
  ): Promise<MapaEntidades[K]> {
    const row = await store.one(entity, { id: id(resourceId) }, { lock });
    if (!row || row.eliminadoEn || row.eliminadaEn || row.archivadaEn)
      missing();
    return row;
  }
  protected async owned<K extends NombreEntidad>(
    store: AlmacenDatos,
    entity: K,
    resourceId: unknown,
    actor: Actor,
    field: string,
    lock = true,
  ): Promise<MapaEntidades[K]> {
    const row = await this.resource(store, entity, resourceId, lock);
    own(actor, row[field]);
    return row;
  }
  protected async file(
    store: AlmacenDatos,
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
  protected async page<K extends NombreEntidad>(
    store: AlmacenDatos,
    entity: K,
    where: Filtros | Filtros[],
    p: Paginacion,
    order: Record<string, 'ASC' | 'DESC'> = { id: 'DESC' },
  ): Promise<Pagina<MapaEntidades[K]>> {
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
    tx: Transaccion,
    actor: Actor | undefined,
    action: string,
    entity: string,
    entityId: unknown,
    summary: Registro = {},
  ): Promise<Registro> {
    return tx.store.insert('eventos_auditoria', {
      actorId: actor?.id ?? null,
      accion: action,
      entidad: entity,
      entidadId: String(entityId),
      resumen: summary,
    });
  }
  protected async notify(
    tx: Transaccion,
    userId: number,
    type: string,
    title: string,
    data: Registro = {},
  ): Promise<Registro | undefined> {
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

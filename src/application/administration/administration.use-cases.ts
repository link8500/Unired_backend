import { Actor, Row, Transaction, Where } from '../../domain/common/contracts';
import { ensure, missing } from '../../domain/common/errors';
import * as v from '../../domain/common/validation';
import { role } from '../../domain/policies/access';
import { BaseUseCases } from '../shared/base.use-cases';
import { preserveAdministrator } from '../shared/admin-safety';

const roles = [
  'usuario',
  'revisor_tutores',
  'moderador',
  'administrador',
] as const;
export class AdministrationUseCases extends BaseUseCases {
  private admin(actor: Actor) {
    role(actor, 'administrador');
  }
  private moderator(actor: Actor) {
    role(actor, 'moderador', 'administrador');
  }
  dashboard(actor: Actor) {
    this.admin(actor);
    return this.db.read.queries.dashboard();
  }
  analytics(actor: Actor, query: Row) {
    this.admin(actor);
    return this.db.read.queries.analytics(
      v.integer(Number(query.days ?? 30), 'days', 1, 90),
    );
  }
  async users(actor: Actor, query: Row) {
    this.admin(actor);
    const p = v.pagination(query);
    const where: Where = { eliminadoEn: null };
    if (p.q) where.nombre = { op: 'like', value: '%' + p.q + '%' };
    if (query.estado !== undefined)
      where.estado = v.choice(
        query.estado,
        ['activo', 'pendiente_email', 'suspendido'],
        'estado',
      );
    const page = await this.page(this.db.read.store, 'usuarios', where, p);
    const assigned = await this.db.read.store.find('usuario_roles', {
      usuarioId: { op: 'in', value: page.items.map((user) => user.id) },
    });
    return {
      ...page,
      items: page.items.map((user) => ({
        ...user,
        roles: assigned
          .filter((entry) => entry.usuarioId === user.id)
          .map((entry) => entry.rolCodigo),
      })),
    };
  }
  async user(actor: Actor, resourceId: unknown): Promise<Row> {
    this.admin(actor);
    const user = await this.resource(
      this.db.read.store,
      'usuarios',
      v.userId(resourceId),
    );
    return {
      ...user,
      roles: (
        await this.db.read.store.find('usuario_roles', { usuarioId: user.id })
      ).map((entry) => entry.rolCodigo),
      perfil: await this.db.read.store.one('perfiles_usuario', {
        usuarioId: user.id,
      }),
    };
  }
  private async protectLastAdmin(tx: Transaction, user: Row): Promise<void> {
    await preserveAdministrator(tx, Number(user.id));
  }
  async userState(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    this.admin(actor);
    const body = v.object(input, ['estado', 'motivo']);
    const state = v.choice(
      body.estado,
      ['activo', 'suspendido', 'desactivado'],
      'estado',
    );
    const reason = v.text(body.motivo, 'motivo', 2000);
    return this.db.transaction(async (tx) => {
      await tx.store.one('roles', { codigo: 'administrador' }, { lock: true });
      const user = await this.resource(
        tx.store,
        'usuarios',
        v.userId(resourceId),
        true,
      );
      ensure(
        user.id !== actor.id,
        'Utiliza tu perfil para gestionar tu propia cuenta.',
      );
      if (state !== 'activo') await this.protectLastAdmin(tx, user);
      else
        ensure(
          user.emailVerificadoEn,
          'No puedes activar una cuenta sin correo verificado.',
        );
      const [result] = await tx.store.update(
        'usuarios',
        { id: user.id },
        {
          estado: state,
          ...(state === 'desactivado' ? { eliminadoEn: new Date() } : {}),
        },
      );
      if (state !== 'activo')
        await tx.store.update(
          'sesiones_usuario',
          { usuarioId: user.id, revocadaEn: null },
          { revocadaEn: new Date() },
        );
      await this.audit(tx, actor, 'usuario.' + state, 'usuario', user.id, {
        motivo: reason,
      });
      return result;
    });
  }
  async userRoles(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    this.admin(actor);
    const body = v.object(input, ['roles', 'motivo']);
    ensure(
      Array.isArray(body.roles) &&
        body.roles.length > 0 &&
        body.roles.length <= 4,
      'Lista de roles inválida.',
    );
    const assigned = Array.from(
      new Set([
        'usuario',
        ...body.roles.map((value: unknown) => v.choice(value, roles, 'rol')),
      ]),
    );
    const reason = v.text(body.motivo, 'motivo', 2000);
    return this.db.transaction(async (tx) => {
      await tx.store.one('roles', { codigo: 'administrador' }, { lock: true });
      const user = await this.resource(
        tx.store,
        'usuarios',
        v.userId(resourceId),
        true,
      );
      if (!assigned.includes('administrador'))
        await this.protectLastAdmin(tx, user);
      await tx.store.remove('usuario_roles', { usuarioId: user.id });
      for (const value of assigned)
        await tx.store.insert('usuario_roles', {
          usuarioId: user.id,
          rolCodigo: value,
          asignadoPor: actor.id,
        });
      await this.audit(
        tx,
        actor,
        'usuario.roles_actualizados',
        'usuario',
        user.id,
        { roles: assigned, motivo: reason },
      );
      return { usuarioId: user.id, roles: assigned };
    });
  }
  async catalogs(
    actor: Actor,
    entity: 'areas_tutoria' | 'categorias_market',
    input: unknown,
    resourceId?: unknown,
  ): Promise<Row> {
    this.admin(actor);
    const body = v.object(
      input,
      entity === 'areas_tutoria'
        ? ['codigo', 'nombre', 'activo', 'requisitosDocumentales']
        : ['codigo', 'nombre', 'activo'],
    );
    const code = v.text(body.codigo, 'codigo', 80);
    ensure(/^[a-z][a-z0-9_-]*$/.test(code), 'Código inválido.');
    const data: Row = {
      codigo: code,
      nombre: v.text(body.nombre, 'nombre', 160),
      activo: v.boolean(body.activo ?? true, 'activo'),
    };
    if (entity === 'areas_tutoria') {
      const required = body.requisitosDocumentales ?? [];
      ensure(
        Array.isArray(required) && required.length <= 20,
        'Requisitos documentales inválidos.',
      );
      data.requisitosDocumentales = Array.from(
        new Set(
          required.map((value: unknown) => v.text(value, 'tipoDocumento', 50)),
        ),
      );
    }
    return this.db.transaction(async (tx) => {
      const result =
        resourceId === undefined
          ? await tx.store.insert(entity, data)
          : (
              await tx.store.update(entity, { id: v.userId(resourceId) }, data)
            )[0];
      if (!result) missing();
      await this.audit(tx, actor, 'catalogo.actualizado', entity, result.id);
      return result;
    });
  }
  catalogsList(actor: Actor, entity: 'areas_tutoria' | 'categorias_market') {
    this.admin(actor);
    return this.db.read.store.find(
      entity,
      {},
      { order: { nombre: 'ASC' }, limit: 200 },
    );
  }
  publications(
    actor: Actor,
    entity: 'tutorias' | 'anuncios_market',
    query: Row,
  ) {
    this.moderator(actor);
    return this.page(
      this.db.read.store,
      entity,
      entity === 'tutorias' ? { eliminadaEn: null } : { eliminadoEn: null },
      v.pagination(query),
    );
  }
  async moderate(
    actor: Actor,
    entity: 'tutorias' | 'anuncios_market',
    resourceId: unknown,
    input: unknown,
    restore = false,
  ): Promise<Row> {
    this.moderator(actor);
    const body = v.object(input, ['motivo']);
    const reason = v.text(body.motivo, 'motivo', 2000);
    return this.db.transaction(async (tx) => {
      const resource = await this.resource(tx.store, entity, resourceId, true);
      if (restore)
        ensure(
          resource.estado ===
            (entity === 'tutorias' ? 'bloqueada' : 'bloqueado'),
          'El recurso no está bloqueado.',
          409,
        );
      const state = restore
        ? entity === 'tutorias'
          ? 'pausada'
          : 'borrador'
        : entity === 'tutorias'
          ? 'bloqueada'
          : 'bloqueado';
      const [result] = await tx.store.update(
        entity,
        { id: resource.id },
        { estado: state, versionLock: resource.versionLock + 1 },
      );
      await this.audit(
        tx,
        actor,
        restore ? 'moderacion.restaurada' : 'moderacion.bloqueada',
        entity,
        resource.id,
        { motivo: reason, estadoAnterior: resource.estado },
      );
      await this.notify(
        tx,
        Number(resource[entity === 'tutorias' ? 'tutorId' : 'vendedorId']),
        'moderacion',
        'Una publicación fue moderada',
        { id: resource.id, estado: state, motivo: reason },
      );
      return result;
    });
  }
  reports(actor: Actor, query: Row) {
    this.moderator(actor);
    const where: Where = {};
    if (query.estado !== undefined)
      where.estado = v.choice(
        query.estado,
        ['pendiente', 'en_revision', 'resuelta', 'descartada'],
        'estado',
      );
    return this.page(
      this.db.read.store,
      'denuncias',
      where,
      v.pagination(query),
      { creadoEn: 'ASC' },
    );
  }
  async claimReport(actor: Actor, resourceId: unknown): Promise<Row> {
    this.moderator(actor);
    return this.db.transaction(async (tx) => {
      const report = await this.resource(
        tx.store,
        'denuncias',
        resourceId,
        true,
      );
      ensure(
        report.estado === 'pendiente',
        'La denuncia ya está asignada.',
        409,
      );
      const [result] = await tx.store.update(
        'denuncias',
        { id: report.id },
        { estado: 'en_revision', asignadaA: actor.id },
      );
      await this.audit(tx, actor, 'denuncia.asumida', 'denuncia', report.id);
      return result;
    });
  }
  async reportDetails(actor: Actor, resourceId: unknown): Promise<Row> {
    this.moderator(actor);
    return this.db.transaction(async (tx) => {
      const report = await this.resource(tx.store, 'denuncias', resourceId);
      ensure(
        report.asignadaA === actor.id || actor.roles.includes('administrador'),
        'La denuncia está asignada a otro moderador.',
        403,
      );
      let message: Row | undefined;
      if (report.mensajeId)
        message = await tx.store.one('mensajes', { id: report.mensajeId });
      await this.audit(tx, actor, 'denuncia.consultada', 'denuncia', report.id);
      return { ...report, ...(message ? { mensajeDenunciado: message } : {}) };
    });
  }
  async resolveReport(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    this.moderator(actor);
    const body = v.object(input, ['estado', 'resolucion', 'accion']);
    const state = v.choice(body.estado, ['resuelta', 'descartada'], 'estado');
    const action = v.choice(
      body.accion ?? 'ninguna',
      ['ninguna', 'bloquear_anuncio', 'bloquear_curso', 'ocultar_mensaje'],
      'accion',
    );
    const resolution = v.text(body.resolucion, 'resolucion', 5000);
    return this.db.transaction(async (tx) => {
      const report = await this.resource(
        tx.store,
        'denuncias',
        resourceId,
        true,
      );
      ensure(
        report.estado === 'en_revision' && report.asignadaA === actor.id,
        'Asume la denuncia antes de resolverla.',
        409,
      );
      ensure(
        state !== 'descartada' || action === 'ninguna',
        'Una denuncia descartada no aplica sanciones.',
      );
      if (action === 'ocultar_mensaje') {
        ensure(report.mensajeId, 'La denuncia no corresponde a un mensaje.');
        await tx.store.update(
          'mensajes',
          { id: report.mensajeId },
          { eliminadoEn: new Date() },
        );
      } else if (action !== 'ninguna') {
        const course = action === 'bloquear_curso';
        const targetId = course ? report.tutoriaId : report.anuncioId;
        ensure(targetId, 'La acción no corresponde al recurso denunciado.');
        const entity = course ? 'tutorias' : 'anuncios_market';
        const target = await this.resource(tx.store, entity, targetId, true);
        await tx.store.update(
          entity,
          { id: target.id },
          {
            estado: course ? 'bloqueada' : 'bloqueado',
            versionLock: target.versionLock + 1,
          },
        );
        await this.notify(
          tx,
          Number(target[course ? 'tutorId' : 'vendedorId']),
          'moderacion',
          'Una publicación fue bloqueada',
          { recursoId: target.id, motivo: resolution },
        );
      }
      const [result] = await tx.store.update(
        'denuncias',
        { id: report.id },
        { estado: state, resolucion: resolution, resueltaEn: new Date() },
      );
      await this.audit(tx, actor, 'denuncia.' + state, 'denuncia', report.id, {
        accion: action,
      });
      return result;
    });
  }
  auditLog(actor: Actor, query: Row) {
    this.admin(actor);
    return this.page(
      this.db.read.store,
      'eventos_auditoria',
      {},
      v.pagination(query),
    );
  }
}

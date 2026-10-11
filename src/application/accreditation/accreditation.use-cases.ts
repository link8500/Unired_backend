import { Actor, Database, Row, Tokens } from '../../domain/common/contracts';
import { ensure, missing } from '../../domain/common/errors';
import * as v from '../../domain/common/validation';
import { role } from '../../domain/policies/access';
import { BaseUseCases } from '../shared/base.use-cases';

/** Expediente versionado: un envío conserva las evidencias aunque luego se corrija. */
export class AccreditationUseCases extends BaseUseCases {
  constructor(
    db: Database,
    private readonly tokens: Tokens,
  ) {
    super(db);
  }
  areas(): Promise<Row[]> {
    return this.db.read.store.find(
      'areas_tutoria',
      { activo: true },
      { order: { nombre: 'ASC' }, limit: 200 },
    );
  }
  mine(actor: Actor, query: Row) {
    return this.page(
      this.db.read.store,
      'solicitudes_tutor',
      { tutorId: actor.id },
      v.pagination(query),
    );
  }
  async create(actor: Actor, input: unknown): Promise<Row> {
    const body = v.object(input, ['areaId']);
    const areaId = v.userId(body.areaId);
    return this.db.transaction(async (tx) => {
      const area = await tx.store.one('areas_tutoria', {
        id: areaId,
        activo: true,
      });
      if (!area) missing('Área no disponible.');
      const request = await tx.store.insert('solicitudes_tutor', {
        tutorId: actor.id,
        areaId,
      });
      await this.audit(tx, actor, 'expediente.creado', 'solicitud', request.id);
      return request;
    });
  }
  async details(
    actor: Actor,
    resourceId: unknown,
    reviewing = false,
  ): Promise<Row> {
    const store = this.db.read.store;
    const request = await this.resource(store, 'solicitudes_tutor', resourceId);
    if (reviewing) {
      role(actor, 'revisor_tutores', 'administrador');
      ensure(
        request.asignadaA === actor.id || actor.roles.includes('administrador'),
        'Debes asumir la revisión antes de leer evidencias.',
        403,
      );
    } else ensure(request.tutorId === actor.id, 'Expediente privado.', 403);
    const [documents, submissions, decisions] = await Promise.all([
      store.find(
        'documentos_solicitud',
        { solicitudId: request.id },
        { order: { id: 'DESC' }, limit: 200 },
      ),
      store.find(
        'envios_solicitud',
        { solicitudId: request.id },
        { order: { numero: 'DESC' }, limit: 100 },
      ),
      store.find(
        'revisiones_tutor',
        { solicitudId: request.id },
        { order: { id: 'DESC' }, limit: 100 },
      ),
    ]);
    return {
      ...request,
      documentos: documents,
      envios: submissions,
      revisiones: decisions,
    };
  }
  async addDocument(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, [
      'archivoId',
      'tipo',
      'descripcion',
      'grupoDocumento',
      'versionLock',
    ]);
    const type = v.text(body.tipo, 'tipo', 50);
    const group =
      body.grupoDocumento === undefined
        ? this.tokens.uuid()
        : v.uuid(body.grupoDocumento);
    return this.db.transaction(async (tx) => {
      const request = await this.owned(
        tx.store,
        'solicitudes_tutor',
        resourceId,
        actor,
        'tutorId',
      );
      ensure(
        ['borrador', 'correcciones'].includes(request.estado),
        'No puedes cambiar evidencias de un envío en revisión.',
        409,
      );
      ensure(
        request.versionLock === v.integer(body.versionLock, 'versionLock', 1),
        'El expediente cambió. Vuelve a consultarlo.',
        409,
      );
      await this.file(tx.store, body.archivoId, actor, 'evidencia_tutor');
      const previous = await tx.store.one(
        'documentos_solicitud',
        { solicitudId: request.id, grupoDocumento: group },
        { order: { version: 'DESC' } },
      );
      const document = await tx.store.insert('documentos_solicitud', {
        solicitudId: request.id,
        tutorId: actor.id,
        archivoId: v.id(body.archivoId),
        grupoDocumento: group,
        version: (previous?.version ?? 0) + 1,
        tipo: type,
        descripcion:
          body.descripcion === undefined
            ? null
            : v.text(body.descripcion, 'descripcion', 500, 0),
      });
      await tx.store.update(
        'solicitudes_tutor',
        { id: request.id },
        { versionLock: request.versionLock + 1 },
      );
      await this.audit(
        tx,
        actor,
        'expediente.documento_agregado',
        'solicitud',
        request.id,
        { documentoId: document.id },
      );
      return document;
    });
  }
  async submit(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['versionLock']);
    return this.db.transaction(async (tx) => {
      const request = await this.owned(
        tx.store,
        'solicitudes_tutor',
        resourceId,
        actor,
        'tutorId',
      );
      ensure(
        ['borrador', 'correcciones'].includes(request.estado),
        'Estado de expediente incompatible.',
        409,
      );
      ensure(
        request.versionLock === v.integer(body.versionLock, 'versionLock', 1),
        'El expediente cambió.',
        409,
      );
      const area = await tx.store.one('areas_tutoria', {
        id: request.areaId,
        activo: true,
      });
      ensure(area, 'Área no disponible.');
      const docs = await tx.store.find(
        'documentos_solicitud',
        { solicitudId: request.id },
        { order: { version: 'DESC' }, limit: 1000 },
      );
      const latest = Array.from(
        new Map(
          docs
            .slice()
            .reverse()
            .map((doc) => [doc.grupoDocumento, doc]),
        ).values(),
      );
      ensure(latest.length > 0, 'Adjunta al menos una evidencia.');
      ensure(
        area.requisitosDocumentales.every((type) =>
          latest.some((doc) => doc.tipo === type),
        ),
        'Faltan documentos requeridos para esta área.',
      );
      for (const doc of latest)
        await this.file(tx.store, doc.archivoId, actor, 'evidencia_tutor');
      const last = await tx.store.one(
        'envios_solicitud',
        { solicitudId: request.id },
        { order: { numero: 'DESC' } },
      );
      const submission = await tx.store.insert('envios_solicitud', {
        solicitudId: request.id,
        numero: (last?.numero ?? 0) + 1,
      });
      for (const doc of latest)
        await tx.store.insert('envio_documentos', {
          envioId: submission.id,
          documentoId: doc.id,
          solicitudId: request.id,
        });
      const [updated] = await tx.store.update(
        'solicitudes_tutor',
        { id: request.id },
        {
          estado: 'enviada',
          asignadaA: null,
          versionLock: request.versionLock + 1,
        },
      );
      await this.audit(
        tx,
        actor,
        'expediente.enviado',
        'solicitud',
        request.id,
        { envioId: submission.id },
      );
      return { ...updated, envioId: submission.id };
    });
  }
  async withdraw(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['versionLock']);
    return this.db.transaction(async (tx) => {
      const request = await this.owned(
        tx.store,
        'solicitudes_tutor',
        resourceId,
        actor,
        'tutorId',
      );
      ensure(
        ['borrador', 'enviada', 'correcciones'].includes(request.estado),
        'No puedes retirar este expediente.',
        409,
      );
      ensure(
        request.versionLock === v.integer(body.versionLock, 'versionLock', 1),
        'El expediente cambió.',
        409,
      );
      const [updated] = await tx.store.update(
        'solicitudes_tutor',
        { id: request.id },
        { estado: 'retirada', versionLock: request.versionLock + 1 },
      );
      await this.audit(
        tx,
        actor,
        'expediente.retirado',
        'solicitud',
        request.id,
      );
      return updated;
    });
  }
  queue(actor: Actor, query: Row) {
    role(actor, 'revisor_tutores', 'administrador');
    const state =
      query.estado === undefined
        ? { op: 'in' as const, value: ['enviada', 'en_revision'] }
        : v.choice(
            query.estado,
            ['enviada', 'en_revision', 'correcciones', 'aprobada', 'rechazada'],
            'estado',
          );
    return this.page(
      this.db.read.store,
      'solicitudes_tutor',
      { estado: state },
      v.pagination(query),
      { creadoEn: 'ASC' },
    );
  }
  async claim(actor: Actor, resourceId: unknown, input: unknown): Promise<Row> {
    role(actor, 'revisor_tutores', 'administrador');
    const body = v.object(input, ['versionLock']);
    return this.db.transaction(async (tx) => {
      const request = await this.resource(
        tx.store,
        'solicitudes_tutor',
        resourceId,
        true,
      );
      ensure(
        request.tutorId !== actor.id,
        'No puedes revisar tu propio expediente.',
        403,
      );
      ensure(
        request.estado === 'enviada',
        'El expediente ya está asignado o no está enviado.',
        409,
      );
      ensure(
        request.versionLock === v.integer(body.versionLock, 'versionLock', 1),
        'El expediente cambió.',
        409,
      );
      const [result] = await tx.store.update(
        'solicitudes_tutor',
        { id: request.id },
        {
          estado: 'en_revision',
          asignadaA: actor.id,
          versionLock: request.versionLock + 1,
        },
      );
      await this.audit(
        tx,
        actor,
        'expediente.revision_asumida',
        'solicitud',
        request.id,
      );
      return result;
    });
  }
  async decide(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    role(actor, 'revisor_tutores', 'administrador');
    const body = v.object(input, [
      'versionLock',
      'envioId',
      'decision',
      'motivo',
      'validaHasta',
    ]);
    const decision = v.choice(
      body.decision,
      ['aprobada', 'rechazada', 'correcciones'],
      'decision',
    );
    const reason = v.text(body.motivo, 'motivo', 2000);
    const validUntil =
      body.validaHasta === undefined || body.validaHasta === null
        ? null
        : v.date(body.validaHasta, 'validaHasta');
    ensure(
      !validUntil || validUntil > new Date(),
      'La habilitación debe vencer en el futuro.',
    );
    return this.db.transaction(async (tx) => {
      const request = await this.resource(
        tx.store,
        'solicitudes_tutor',
        resourceId,
        true,
      );
      ensure(
        request.tutorId !== actor.id,
        'No puedes aprobar tu propio expediente.',
        403,
      );
      ensure(
        request.asignadaA === actor.id,
        'La revisión está asignada a otro usuario.',
        403,
      );
      ensure(
        request.estado === 'en_revision' &&
          request.versionLock === v.integer(body.versionLock, 'versionLock', 1),
        'La revisión cambió.',
        409,
      );
      const latest = await tx.store.one(
        'envios_solicitud',
        { solicitudId: request.id },
        { order: { numero: 'DESC' } },
      );
      ensure(
        latest && latest.id === v.id(body.envioId),
        'Solo se decide el último envío.',
        409,
      );
      const revision = await tx.store.insert('revisiones_tutor', {
        envioId: latest.id,
        solicitudId: request.id,
        revisorId: actor.id,
        decision,
        motivo: reason,
      });
      if (decision === 'aprobada') {
        const old = await tx.store.one(
          'habilitaciones_tutor',
          { tutorId: request.tutorId, areaId: request.areaId },
          { lock: true },
        );
        const data = {
          tutorId: request.tutorId,
          areaId: request.areaId,
          solicitudId: request.id,
          revisionId: revision.id,
          estado: 'vigente',
          validaDesde: new Date(),
          validaHasta: validUntil,
        };
        if (old)
          await tx.store.update('habilitaciones_tutor', { id: old.id }, data);
        else await tx.store.insert('habilitaciones_tutor', data);
      }
      const [result] = await tx.store.update(
        'solicitudes_tutor',
        { id: request.id },
        { estado: decision, versionLock: request.versionLock + 1 },
      );
      await this.audit(
        tx,
        actor,
        'expediente.' + decision,
        'solicitud',
        request.id,
        { envioId: latest.id },
      );
      await this.notify(
        tx,
        request.tutorId,
        'acreditacion',
        'Resultado de tu acreditación',
        { solicitudId: request.id, decision, motivo: reason },
      );
      return result;
    });
  }
  grants(actor: Actor) {
    return this.db.read.store.find(
      'habilitaciones_tutor',
      { tutorId: actor.id },
      { limit: 200 },
    );
  }
  async changeGrant(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    role(actor, 'revisor_tutores', 'administrador');
    const body = v.object(input, ['estado', 'motivo']);
    const state = v.choice(body.estado, ['suspendida', 'revocada'], 'estado');
    const reason = v.text(body.motivo, 'motivo', 2000);
    return this.db.transaction(async (tx) => {
      const grant = await this.resource(
        tx.store,
        'habilitaciones_tutor',
        resourceId,
        true,
      );
      ensure(
        grant.tutorId !== actor.id,
        'No puedes moderar tu propia habilitación.',
        403,
      );
      const [result] = await tx.store.update(
        'habilitaciones_tutor',
        { id: grant.id },
        { estado: state },
      );
      await this.audit(
        tx,
        actor,
        'habilitacion.' + state,
        'habilitacion',
        grant.id,
        { motivo: reason },
      );
      await this.notify(
        tx,
        grant.tutorId,
        'habilitacion',
        'Tu habilitación cambió',
        { estado: state, motivo: reason },
      );
      return result;
    });
  }
}

// Archivo: src/models/comunidad/aplicacion/comunidad.use-cases.ts
// Consulta perfiles públicos y administra notificaciones, lectura de avisos y denuncias de la comunidad.

import {
  Actor,
  BaseDatos,
  Registro,
  Filtros,
} from '../../../core/dominio/comun/contratos';
import { ensure, missing } from '../../../core/dominio/comun/errores';
import * as v from '../../../core/dominio/comun/validaciones';
import { CasosUsoBase } from '../../../core/aplicacion/casos-uso-base';
import { MensajeriaUseCases } from '../../mensajeria/aplicacion/mensajeria.use-cases';

export class ComunidadUseCases extends CasosUsoBase {
  constructor(
    db: BaseDatos,
    private readonly messaging: MensajeriaUseCases,
  ) {
    super(db);
  }
  async profile(resourceId: unknown): Promise<Registro> {
    const user = await this.db.read.store.one('usuarios', {
      id: v.userId(resourceId),
      estado: 'activo',
      eliminadoEn: null,
    });
    if (!user) missing('Perfil no disponible.');
    const profile = await this.db.read.store.one('perfiles_usuario', {
      usuarioId: user.id,
    });
    return {
      id: user.id,
      nombre: user.nombre,
      presentacion: profile?.presentacion,
      areaProfesional: profile?.areaProfesional,
      ciudad: profile?.ciudad,
      avatarArchivoId: profile?.avatarArchivoId,
      bannerArchivoId: profile?.bannerArchivoId,
      ...(profile?.telefonoPublico ? { telefono: profile.telefono } : {}),
    };
  }
  notifications(actor: Actor, query: Registro) {
    const where: Filtros = { usuarioId: actor.id };
    if (query.sinLeer !== undefined) {
      ensure(
        typeof query.sinLeer === 'string' &&
          ['true', 'false'].includes(query.sinLeer),
        'sinLeer debe ser true o false.',
      );
      if (query.sinLeer === 'true') where.leidaEn = null;
    }
    return this.page(
      this.db.read.store,
      'notificaciones',
      where,
      v.pagination(query),
    );
  }
  async readNotification(
    actor: Actor,
    resourceId?: unknown,
  ): Promise<Registro> {
    const where: Filtros = { usuarioId: actor.id, leidaEn: null };
    if (resourceId !== undefined) {
      const notice = await this.owned(
        this.db.read.store,
        'notificaciones',
        resourceId,
        actor,
        'usuarioId',
        false,
      );
      where.id = notice.id;
    }
    await this.db.read.store.update('notificaciones', where, {
      leidaEn: new Date(),
    });
    return { mensaje: 'Notificaciones marcadas como leídas.' };
  }
  async report(actor: Actor, input: unknown): Promise<Registro> {
    const body = v.object(input, ['tipo', 'recursoId', 'motivo', 'detalle']);
    const type = v.choice(
      body.tipo,
      ['anuncio', 'curso', 'mensaje', 'usuario'],
      'tipo',
    );
    const resourceId = v.id(body.recursoId);
    return this.db.transaction(async (tx) => {
      let target: Registro;
      if (type === 'anuncio') {
        ensure(
          await tx.queries.publicListing(resourceId),
          'Anuncio no disponible.',
          404,
        );
        target = { anuncioId: resourceId };
      } else if (type === 'curso') {
        ensure(
          await tx.queries.publicCourse(resourceId),
          'Curso no disponible.',
          404,
        );
        target = { tutoriaId: resourceId };
      } else if (type === 'mensaje') {
        const message = await this.resource(tx.store, 'mensajes', resourceId);
        await this.messaging.participant(
          tx.store,
          actor,
          message.conversacionId,
        );
        ensure(
          message.autorId !== actor.id && !message.eliminadoEn,
          'Mensaje no denunciable.',
        );
        target = { mensajeId: resourceId };
      } else {
        ensure(
          Number(resourceId) !== actor.id &&
            (await tx.store.one('usuarios', {
              id: v.userId(resourceId),
              eliminadoEn: null,
            })),
          'Usuario no disponible.',
          404,
        );
        target = { usuarioReportadoId: v.userId(resourceId) };
      }
      const report = await tx.store.insert('denuncias', {
        ...target,
        denuncianteId: actor.id,
        motivo: v.text(body.motivo, 'motivo', 100),
        detalle:
          body.detalle === undefined
            ? null
            : v.text(body.detalle, 'detalle', 10000),
      });
      await this.audit(tx, actor, 'denuncia.creada', 'denuncia', report.id);
      return report;
    });
  }
  myReports(actor: Actor, query: Registro) {
    return this.page(
      this.db.read.store,
      'denuncias',
      { denuncianteId: actor.id },
      v.pagination(query),
    );
  }
}

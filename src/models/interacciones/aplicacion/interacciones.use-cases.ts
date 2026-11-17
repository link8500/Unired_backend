// Archivo: src/models/interacciones/aplicacion/interacciones.use-cases.ts
// Negociaciones y solicitudes de tutoría con aceptación, cierre y valoración mutua.
import {
  Actor,
  BaseDatos,
  Registro,
  Transaccion,
} from '../../../core/dominio/comun/contratos';
import {
  Conversaciones,
  SolicitudApoyo,
} from '../../../core/dominio/comun/entidades';
import { CasosUsoBase } from '../../../core/aplicacion/casos-uso-base';
import { ensure } from '../../../core/dominio/comun/errores';
import * as v from '../../../core/dominio/comun/validaciones';
import { validGrant } from '../../../core/dominio/politicas/acceso';
import {
  centavos,
  importe,
} from '../../../core/dominio/politicas/importes-comerciales';
import { ComercialUseCases } from '../../comercial/aplicacion/comercial.use-cases';

export class InteraccionesUseCases extends CasosUsoBase {
  constructor(
    db: BaseDatos,
    private readonly commerce: ComercialUseCases,
  ) {
    super(db);
  }
  offers(actor: Actor, query: Registro) {
    return this.db.read.queries.offers(actor.id, {
      ...v.pagination(query),
      ...(query.bandeja
        ? {
            bandeja: v.choice(
              query.bandeja,
              ['recibidas', 'enviadas'],
              'bandeja',
            ),
          }
        : {}),
      ...(query.estado
        ? {
            estado: v.choice(
              query.estado,
              ['pendiente', 'aceptada', 'rechazada', 'cancelada', 'finalizada'],
              'estado',
            ),
          }
        : {}),
    });
  }
  async offer(actor: Actor, listingId: unknown, input: unknown) {
    const body = v.object(input, ['clienteId', 'importe', 'mensaje', 'tipo']);
    const nonce = v.uuid(body.clienteId),
      type = v.choice(body.tipo ?? 'compra', ['compra', 'intercambio'], 'tipo');
    const amount = v.money(body.importe ?? '0.00', 'importe');
    const message = v.text(body.mensaje, 'mensaje', 2000, 3);
    return this.db.transaction(async (tx) => {
      const listing = await this.resource(
        tx.store,
        'anuncios_market',
        listingId,
        true,
      );
      ensure(
        listing.vendedorId !== actor.id,
        'No puedes hacer una oferta sobre tu propia publicación.',
      );
      ensure(
        (await tx.queries.publicListing(listing.id)) &&
          ['publicado', 'reservado'].includes(listing.estado),
        'Anuncio no disponible.',
        409,
      );
      ensure(
        !(await tx.store.one('bloqueos_usuario', [
          { bloqueadorId: actor.id, bloqueadoId: listing.vendedorId },
          { bloqueadorId: listing.vendedorId, bloqueadoId: actor.id },
        ])),
        'No puedes contactar a esta persona.',
        403,
      );
      const existing = await tx.store.one('ofertas_market', {
        compradorId: actor.id,
        clienteId: nonce,
      });
      if (existing) {
        ensure(
          existing.anuncioId === listing.id &&
            existing.importe === amount &&
            existing.mensaje === message &&
            existing.tipo === type,
          'La operación ya corresponde a otra oferta.',
          409,
        );
        return existing;
      }
      ensure(
        !(await tx.store.one('ofertas_market', {
          anuncioId: listing.id,
          compradorId: actor.id,
          estado: { op: 'in', value: ['pendiente', 'aceptada'] },
        })),
        'Ya tienes una oferta abierta para esta publicación.',
        409,
      );
      const result = await tx.store.insert('ofertas_market', {
        anuncioId: listing.id,
        compradorId: actor.id,
        vendedorId: listing.vendedorId,
        clienteId: nonce,
        tipo: type,
        importe: amount,
        moneda: listing.moneda,
        mensaje: message,
      });
      await this.notify(
        tx,
        listing.vendedorId,
        'oferta',
        'Recibiste una oferta para ' + listing.titulo,
        { ofertaId: result.id, anuncioId: listing.id },
      );
      await this.audit(tx, actor, 'oferta.enviada', 'oferta', result.id);
      return result;
    });
  }
  private async conversation(
    tx: Transaccion,
    where: Record<string, string | number>,
    buyer: number,
    owner: number,
    type: 'market' | 'tutoria',
  ): Promise<Conversaciones> {
    let conversation = await tx.store.one('conversaciones', where);
    if (!conversation) {
      conversation = await tx.store.insert('conversaciones', {
        ...where,
        consultanteId: buyer,
        propietarioId: owner,
        tipo: type,
      });
      for (const id of [buyer, owner])
        await tx.store.insert('participantes_conversacion', {
          conversacionId: conversation.id,
          usuarioId: id,
        });
    } else {
      [conversation] = await tx.store.update(
        'conversaciones',
        { id: conversation.id },
        { estado: 'abierta' },
      );
      await tx.store.update(
        'participantes_conversacion',
        { conversacionId: conversation.id },
        { salioEn: null, archivadaEn: null },
      );
    }
    return conversation;
  }
  async decideOffer(actor: Actor, id: unknown, input: unknown) {
    const body = v.object(input, ['estado']);
    const state = v.choice(
      body.estado,
      ['aceptada', 'rechazada', 'cancelada', 'finalizada'],
      'estado',
    );
    return this.db.transaction(async (tx) => {
      const peek = await this.resource(tx.store, 'ofertas_market', id);
      const listing = await this.resource(
        tx.store,
        'anuncios_market',
        peek.anuncioId,
        true,
      );
      const offer = await this.resource(tx.store, 'ofertas_market', id, true);
      ensure(
        actor.id === offer.compradorId || actor.id === offer.vendedorId,
        'Oferta privada.',
        403,
      );
      if (offer.estado === state) return offer;
      if (state === 'aceptada' || state === 'rechazada')
        ensure(
          actor.id === offer.vendedorId && offer.estado === 'pendiente',
          'Solo el autor puede responder una oferta pendiente.',
          403,
        );
      else
        ensure(
          offer.estado === 'aceptada' ||
            (state === 'cancelada' &&
              offer.estado === 'pendiente' &&
              actor.id === offer.compradorId),
          'La oferta no admite este cambio.',
          409,
        );
      let conversationId = offer.conversacionId;
      if (state === 'aceptada') {
        ensure(
          !(await tx.store.one('bloqueos_usuario', [
            { bloqueadorId: offer.compradorId, bloqueadoId: offer.vendedorId },
            { bloqueadorId: offer.vendedorId, bloqueadoId: offer.compradorId },
          ])),
          'No puedes contactar a esta persona.',
          403,
        );
        ensure(
          (await tx.queries.publicListing(listing.id)) &&
            ['publicado', 'reservado'].includes(listing.estado),
          'Anuncio no disponible.',
          409,
        );
        ensure(
          await tx.store.one('usuarios', {
            id: offer.compradorId,
            estado: 'activo',
            eliminadoEn: null,
          }),
          'La otra persona no está disponible.',
          409,
        );
        const unique = listing.disponibilidad !== 'varias_unidades';
        if (unique)
          ensure(
            !(await tx.store.one('ofertas_market', {
              anuncioId: listing.id,
              estado: 'aceptada',
            })),
            'Este artículo ya tiene otra oferta aceptada.',
            409,
          );
        const conversation = await this.conversation(
          tx,
          { anuncioId: listing.id, consultanteId: offer.compradorId },
          offer.compradorId,
          offer.vendedorId,
          'market',
        );
        conversationId = conversation.id;
        if (unique)
          await tx.store.update(
            'anuncios_market',
            { id: listing.id },
            { estado: 'reservado', versionLock: listing.versionLock + 1 },
          );
      } else if (conversationId) {
        await tx.store.update(
          'conversaciones',
          { id: conversationId },
          { estado: 'cerrada' },
        );
        if (
          listing.disponibilidad !== 'varias_unidades' &&
          ['publicado', 'reservado'].includes(listing.estado)
        )
          await tx.store.update(
            'anuncios_market',
            { id: listing.id },
            {
              estado: state === 'finalizada' ? 'vendido' : 'publicado',
              versionLock: listing.versionLock + 1,
              ...(state === 'finalizada' ? { vendidoEn: new Date() } : {}),
            },
          );
      }
      const [result] = await tx.store.update(
        'ofertas_market',
        { id: offer.id },
        {
          estado: state,
          conversacionId: conversationId,
          resueltaEn: new Date(),
        },
      );
      await this.notify(
        tx,
        actor.id === offer.vendedorId ? offer.compradorId : offer.vendedorId,
        'oferta',
        'Tu oferta fue ' + state,
        { ofertaId: offer.id, anuncioId: offer.anuncioId, estado: state },
      );
      await this.audit(tx, actor, 'oferta.' + state, 'oferta', offer.id);
      return result;
    });
  }
  requests(actor: Actor, query: Registro) {
    const fields: Registro = {
      ...v.pagination(query),
      vista: v.choice(
        query.vista ?? 'mias',
        ['mias', 'disponibles', 'impartidas'],
        'vista',
      ),
    };
    if (query.estado)
      fields.estado = v.choice(
        query.estado,
        ['publicada', 'aceptada', 'cancelada', 'finalizada'],
        'estado',
      );
    for (const key of ['universidad', 'carrera'])
      if (query[key]) fields[key] = v.text(query[key], key, 180);
    if (query.areaId) fields.areaId = v.userId(query.areaId);
    if (query.anioEstudio)
      fields.anioEstudio = v.integer(
        Number(query.anioEstudio),
        'anioEstudio',
        1,
        15,
      );
    return this.db.read.queries.tutoringRequests(
      actor.id,
      fields as ReturnType<typeof v.pagination> & Registro,
    );
  }
  async request(actor: Actor, input: unknown) {
    const body = v.object(input, [
      'areaId',
      'materia',
      'tema',
      'descripcion',
      'modalidad',
      'duracionMinutos',
      'precioConfirmado',
    ]);
    const quote = await this.commerce.quote({
      areaId: body.areaId,
      modalidad: body.modalidad,
      duracionMinutos: body.duracionMinutos,
    });
    if (body.precioConfirmado !== undefined)
      ensure(
        v.money(body.precioConfirmado, 'precioConfirmado') === quote.total,
        'La tarifa cambió. Revisa la cotización antes de publicar.',
        409,
      );
    return this.db.transaction(async (tx) => {
      await tx.store.one('usuarios', { id: actor.id }, { lock: true });
      ensure(
        (await tx.store.count('solicitudes_apoyo', {
          alumnoId: actor.id,
          estado: { op: 'in', value: ['publicada', 'aceptada'] },
        })) < 10,
        'Puedes mantener hasta diez solicitudes abiertas.',
        409,
      );
      const profile = await tx.store.one('perfiles_usuario', {
        usuarioId: actor.id,
      });
      const result = await tx.store.insert('solicitudes_apoyo', {
        alumnoId: actor.id,
        areaId: v.userId(body.areaId),
        materia: v.text(body.materia, 'materia', 180, 2),
        tema: v.text(body.tema, 'tema', 180, 3),
        descripcion: v.text(body.descripcion, 'descripcion', 5000, 10),
        universidad: profile?.universidad ?? null,
        carrera: profile?.carrera ?? null,
        anioEstudio: profile?.anioEstudio ?? null,
        modalidad: quote.modalidad,
        duracionMinutos: quote.duracionMinutos,
        precio: quote.total,
        comision: quote.comision,
      });
      await tx.queries.notifyTutors(
        result.areaId,
        actor.id,
        'Nueva solicitud: ' + result.tema,
        { solicitudId: result.id, areaId: result.areaId, vista: 'disponibles' },
      );
      await this.audit(
        tx,
        actor,
        'solicitud_apoyo.publicada',
        'solicitud_apoyo',
        result.id,
      );
      return result;
    });
  }
  private async qualified(
    tx: Transaccion,
    actor: Actor,
    request: SolicitudApoyo,
  ) {
    const grant = await tx.store.one('habilitaciones_tutor', {
      tutorId: actor.id,
      areaId: request.areaId,
    });
    ensure(
      request.alumnoId !== actor.id &&
        validGrant(grant, actor.id, request.areaId),
      'Debes estar acreditado en esta materia para responder.',
      403,
    );
  }
  async ignore(actor: Actor, id: unknown) {
    return this.db.transaction(async (tx) => {
      const request = await this.resource(
        tx.store,
        'solicitudes_apoyo',
        id,
        true,
      );
      ensure(
        request.estado === 'publicada',
        'La solicitud ya fue respondida.',
        409,
      );
      await this.qualified(tx, actor, request);
      if (
        !(await tx.store.one('solicitudes_ignoradas', {
          solicitudId: request.id,
          tutorId: actor.id,
        }))
      )
        await tx.store.insert('solicitudes_ignoradas', {
          solicitudId: request.id,
          tutorId: actor.id,
        });
      return {
        mensaje: 'Solicitud omitida. Otros tutores podrán responderla.',
      };
    });
  }
  async accept(actor: Actor, id: unknown) {
    return this.db.transaction(async (tx) => {
      const request = await this.resource(
        tx.store,
        'solicitudes_apoyo',
        id,
        true,
      );
      if (request.estado === 'aceptada' && request.tutorId === actor.id)
        return request;
      ensure(
        request.estado === 'publicada',
        'Otro tutor ya respondió o la solicitud fue cerrada.',
        409,
      );
      await this.qualified(tx, actor, request);
      ensure(
        await tx.store.one('usuarios', {
          id: request.alumnoId,
          estado: 'activo',
          eliminadoEn: null,
        }),
        'El estudiante no está disponible.',
        409,
      );
      ensure(
        !(await tx.store.one('bloqueos_usuario', [
          { bloqueadorId: actor.id, bloqueadoId: request.alumnoId },
          { bloqueadorId: request.alumnoId, bloqueadoId: actor.id },
        ])),
        'No puedes interactuar con esta persona.',
        403,
      );
      await tx.store.one('usuarios', { id: actor.id }, { lock: true });
      const wallet = await tx.store.one(
        'carteras_tutor',
        { usuarioId: actor.id },
        { lock: true },
      );
      const fee = centavos(request.comision);
      ensure(
        fee === 0n || (wallet && centavos(wallet.saldoDemo) >= fee),
        'Recarga tu cartera de demostración para cubrir la comisión indicada.',
        409,
        'DEMO_BALANCE_REQUIRED',
      );
      if (fee > 0n && wallet) {
        await tx.store.update(
          'carteras_tutor',
          { usuarioId: actor.id },
          {
            saldoDemo: importe(centavos(wallet.saldoDemo) - fee),
            actualizadoEn: new Date(),
          },
        );
        await tx.store.insert('movimientos_cartera', {
          usuarioId: actor.id,
          tipo: 'comision_demo',
          importe: importe(-fee),
          descripcion: 'Comisión simulada por solicitud ' + request.id,
        });
      }
      await tx.store.update(
        'solicitudes_apoyo',
        { id: request.id },
        { tutorId: actor.id, estado: 'aceptada', aceptadaEn: new Date() },
      );
      const chat = await this.conversation(
        tx,
        { solicitudApoyoId: request.id },
        request.alumnoId,
        actor.id,
        'tutoria',
      );
      const [result] = await tx.store.update(
        'solicitudes_apoyo',
        { id: request.id },
        { conversacionId: chat.id },
      );
      await this.notify(
        tx,
        request.alumnoId,
        'solicitud_tutoria',
        'Un tutor aceptó tu solicitud',
        { solicitudId: request.id, conversacionId: chat.id },
      );
      await this.audit(
        tx,
        actor,
        'solicitud_apoyo.aceptada',
        'solicitud_apoyo',
        request.id,
        { comisionDemo: request.comision },
      );
      return result;
    });
  }
  async material(actor: Actor, id: unknown, input: unknown) {
    const body = v.object(input, ['cursoId']);
    return this.db.transaction(async (tx) => {
      const request = await this.resource(
        tx.store,
        'solicitudes_apoyo',
        id,
        true,
      );
      ensure(
        request.estado === 'aceptada' && request.tutorId === actor.id,
        'Solo el tutor asignado puede compartir material durante la tutoría.',
        403,
      );
      ensure(
        !request.cursoId,
        'Esta solicitud ya tiene un curso de material asociado.',
        409,
      );
      const course = await tx.queries.publicCourse(v.id(body.cursoId));
      ensure(
        course &&
          course.tutorId === actor.id &&
          course.areaId === request.areaId,
        'Elige un curso publicado propio de la misma materia.',
        403,
      );
      let enrollment = await tx.store.one(
        'inscripciones_tutoria',
        { tutoriaId: course.id, alumnoId: request.alumnoId },
        { lock: true },
      );
      let granted: string | null = null;
      if (!enrollment) {
        enrollment = await tx.store.insert('inscripciones_tutoria', {
          tutoriaId: course.id,
          alumnoId: request.alumnoId,
          estado: 'activa',
          activadaEn: new Date(),
        });
        granted = enrollment.id;
      } else if (!['activa', 'completada'].includes(enrollment.estado)) {
        [enrollment] = await tx.store.update(
          'inscripciones_tutoria',
          { id: enrollment.id },
          { estado: 'activa', activadaEn: new Date(), completadaEn: null },
        );
        granted = enrollment.id;
      }
      const [result] = await tx.store.update(
        'solicitudes_apoyo',
        { id: request.id },
        { cursoId: course.id, inscripcionOtorgadaId: granted },
      );
      await this.notify(
        tx,
        request.alumnoId,
        'solicitud_tutoria',
        'Tu tutor compartió material de aprendizaje',
        { solicitudId: request.id, cursoId: course.id },
      );
      await this.audit(
        tx,
        actor,
        'solicitud_apoyo.material_compartido',
        'solicitud_apoyo',
        request.id,
      );
      return result;
    });
  }
  async closeRequest(actor: Actor, id: unknown, input: unknown) {
    const body = v.object(input, ['estado']),
      state = v.choice(body.estado, ['cancelada', 'finalizada'], 'estado');
    return this.db.transaction(async (tx) => {
      const request = await this.resource(
        tx.store,
        'solicitudes_apoyo',
        id,
        true,
      );
      ensure(
        actor.id === request.alumnoId || actor.id === request.tutorId,
        'Solicitud privada.',
        403,
      );
      if (request.estado === state) return request;
      ensure(
        request.estado === 'aceptada' ||
          (state === 'cancelada' &&
            request.estado === 'publicada' &&
            actor.id === request.alumnoId),
        'Esta solicitud no admite el cambio.',
        409,
      );
      const [result] = await tx.store.update(
        'solicitudes_apoyo',
        { id: request.id },
        { estado: state, cerradaEn: new Date() },
      );
      if (request.conversacionId)
        await tx.store.update(
          'conversaciones',
          { id: request.conversacionId },
          { estado: 'cerrada' },
        );
      if (request.inscripcionOtorgadaId)
        await tx.store.update(
          'inscripciones_tutoria',
          { id: request.inscripcionOtorgadaId, estado: 'activa' },
          {
            estado: state === 'finalizada' ? 'completada' : 'cancelada',
            ...(state === 'finalizada' ? { completadaEn: new Date() } : {}),
          },
        );
      const other =
        actor.id === request.alumnoId ? request.tutorId : request.alumnoId;
      if (other)
        await this.notify(
          tx,
          other,
          'solicitud_tutoria',
          'La tutoría fue ' + state,
          { solicitudId: request.id },
        );
      await this.audit(
        tx,
        actor,
        'solicitud_apoyo.' + state,
        'solicitud_apoyo',
        request.id,
      );
      return result;
    });
  }
  async review(
    actor: Actor,
    type: 'oferta' | 'solicitud' | 'inscripcion',
    id: unknown,
    input: unknown,
  ) {
    const body = v.object(input, ['puntuacion', 'comentario']);
    return this.db.transaction(async (tx) => {
      let other: number;
      const key: Registro = {};
      if (type === 'oferta') {
        const row = await this.resource(tx.store, 'ofertas_market', id, true);
        ensure(
          row.estado === 'finalizada',
          'Solo puedes valorar una interacción finalizada.',
          409,
        );
        ensure(
          actor.id === row.compradorId || actor.id === row.vendedorId,
          'Interacción privada.',
          403,
        );
        other = actor.id === row.compradorId ? row.vendedorId : row.compradorId;
        key.ofertaId = row.id;
      } else if (type === 'solicitud') {
        const row = await this.resource(
          tx.store,
          'solicitudes_apoyo',
          id,
          true,
        );
        ensure(
          row.estado === 'finalizada' && row.tutorId,
          'Solo puedes valorar una tutoría finalizada.',
          409,
        );
        ensure(
          actor.id === row.alumnoId || actor.id === row.tutorId,
          'Interacción privada.',
          403,
        );
        other = actor.id === row.alumnoId ? row.tutorId : row.alumnoId;
        key.solicitudId = row.id;
      } else {
        const row = await this.resource(
          tx.store,
          'inscripciones_tutoria',
          id,
          true,
        );
        const course = await this.resource(tx.store, 'tutorias', row.tutoriaId);
        ensure(
          row.estado === 'completada',
          'La inscripción debe estar completada.',
          409,
        );
        ensure(
          actor.id === row.alumnoId || actor.id === course.tutorId,
          'Interacción privada.',
          403,
        );
        other = actor.id === row.alumnoId ? course.tutorId : row.alumnoId;
        key.inscripcionId = row.id;
      }
      ensure(
        !(await tx.store.one('resenas_interaccion', {
          ...key,
          autorId: actor.id,
        } as { autorId: number })),
        'Ya valoraste esta interacción.',
        409,
      );
      const result = await tx.store.insert('resenas_interaccion', {
        ...key,
        autorId: actor.id,
        receptorId: other,
        puntuacion: v.integer(body.puntuacion, 'puntuacion', 1, 5),
        comentario: v.text(body.comentario, 'comentario', 2000, 3),
      });
      await this.audit(
        tx,
        actor,
        'interaccion.valoracion',
        'resena_interaccion',
        result.id,
      );
      return result;
    });
  }
}

import {
  Actor,
  Database,
  Row,
  Store,
  Tokens,
  Where,
} from '../../domain/common/contracts';
import { ensure, missing } from '../../domain/common/errors';
import * as v from '../../domain/common/validation';
import { BaseUseCases } from '../shared/base.use-cases';
import { LearningUseCases } from '../learning/learning.use-cases';

function publicMessage(message: Row): Row {
  if (!message.eliminadoEn) return message;
  return {
    id: message.id,
    conversacionId: message.conversacionId,
    autorId: message.autorId,
    tipo: message.tipo,
    contenido: null,
    archivoId: null,
    eliminadoEn: message.eliminadoEn,
    creadoEn: message.creadoEn,
  };
}
export class MessagingUseCases extends BaseUseCases {
  constructor(
    db: Database,
    private readonly learning: LearningUseCases,
    private readonly tokens: Tokens,
  ) {
    super(db);
  }
  async participant(
    store: Store,
    actor: Actor,
    conversationId: unknown,
    lock = false,
  ) {
    const conversation = await this.resource(
      store,
      'conversaciones',
      conversationId,
      lock,
    );
    ensure(
      conversation.consultanteId === actor.id ||
        conversation.propietarioId === actor.id,
      'Conversación privada.',
      403,
    );
    ensure(
      await store.one('participantes_conversacion', {
        conversacionId: conversation.id,
        usuarioId: actor.id,
        salioEn: null,
      }),
      'No participas en esta conversación.',
      403,
    );
    return conversation;
  }
  private async blocked(store: Store, a: number, b: number): Promise<boolean> {
    return !!(await store.one('bloqueos_usuario', [
      { bloqueadorId: a, bloqueadoId: b },
      { bloqueadorId: b, bloqueadoId: a },
    ]));
  }
  async open(
    actor: Actor,
    context: 'market' | 'tutoria',
    resourceId: unknown,
  ): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const resource = await this.resource(
        tx.store,
        context === 'market' ? 'anuncios_market' : 'tutorias',
        resourceId,
        true,
      );
      const ownerId = Number(
        resource[context === 'market' ? 'vendedorId' : 'tutorId'],
      );
      ensure(ownerId !== actor.id, 'No puedes conversar contigo mismo.');
      const owner = await tx.store.one('usuarios', {
        id: ownerId,
        estado: 'activo',
        eliminadoEn: null,
      });
      ensure(owner, 'El destinatario no está disponible.', 409);
      ensure(
        !(await this.blocked(tx.store, actor.id, ownerId)),
        'No puedes contactar a este usuario.',
        403,
      );
      if (context === 'market')
        ensure(
          (await tx.queries.publicListing(resource.id)) &&
            ['publicado', 'reservado'].includes(resource.estado),
          'Anuncio no disponible para nuevos contactos.',
          409,
        );
      else await this.learning.access(tx, actor, resource.id);
      const key: Where =
        context === 'market'
          ? { anuncioId: resource.id, consultanteId: actor.id }
          : { tutoriaId: resource.id, consultanteId: actor.id };
      let conversation = await tx.store.one('conversaciones', key);
      if (!conversation) {
        conversation = await tx.store.insert('conversaciones', {
          ...key,
          tipo: context,
          propietarioId: ownerId,
        });
        await tx.store.insert('participantes_conversacion', {
          conversacionId: conversation.id,
          usuarioId: actor.id,
        });
        await tx.store.insert('participantes_conversacion', {
          conversacionId: conversation.id,
          usuarioId: ownerId,
        });
      }
      await tx.store.update(
        'participantes_conversacion',
        { conversacionId: conversation.id, usuarioId: actor.id },
        { archivadaEn: null },
      );
      return conversation;
    });
  }
  list(actor: Actor, query: Row) {
    return this.db.read.queries.conversations(actor.id, v.pagination(query));
  }
  async messages(actor: Actor, conversationId: unknown, query: Row) {
    const conversation = await this.participant(
      this.db.read.store,
      actor,
      conversationId,
    );
    const where: Where = { conversacionId: conversation.id };
    if (query.afterId !== undefined)
      where.id = { op: 'gt', value: v.id(query.afterId) };
    const page = await this.page(
      this.db.read.store,
      'mensajes',
      where,
      v.pagination(query),
      { id: 'ASC' },
    );
    return { ...page, items: page.items.map(publicMessage) };
  }
  async send(
    actor: Actor,
    conversationId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['clienteId', 'contenido', 'archivoId']);
    const nonce = v.uuid(body.clienteId);
    const content =
      body.contenido === undefined || body.contenido === null
        ? null
        : v.text(body.contenido, 'contenido', 10000);
    const fileId =
      body.archivoId === undefined || body.archivoId === null
        ? null
        : v.id(body.archivoId);
    ensure(content || fileId, 'Escribe un mensaje o adjunta un archivo.');
    return this.db.transaction(async (tx) => {
      const conversation = await this.participant(
        tx.store,
        actor,
        conversationId,
        true,
      );
      const other =
        conversation.propietarioId === actor.id
          ? conversation.consultanteId
          : conversation.propietarioId;
      const recipient = await tx.store.one('usuarios', {
        id: other,
        estado: 'activo',
        eliminadoEn: null,
      });
      ensure(
        conversation.estado === 'abierta' &&
          recipient &&
          !(await this.blocked(tx.store, actor.id, other)),
        'La conversación no admite mensajes.',
        403,
      );
      if (conversation.tipo === 'tutoria') {
        // Incluso el tutor debe comprobar que el alumno conserva acceso al curso.
        const student = await tx.store.one('usuarios', {
          id: conversation.consultanteId,
          estado: 'activo',
          eliminadoEn: null,
        });
        ensure(student, 'El alumno no está disponible.', 403);
        await this.learning.access(
          tx,
          { ...actor, id: conversation.consultanteId },
          conversation.tutoriaId,
        );
      }
      const key = {
        conversacionId: conversation.id,
        autorId: actor.id,
        clienteId: nonce,
      };
      const existing = await tx.store.one('mensajes', key);
      if (existing) {
        ensure(
          existing.contenido === content && existing.archivoId === fileId,
          'Este clienteId ya se usó con otro contenido.',
          409,
        );
        return publicMessage(existing);
      }
      if (fileId) await this.file(tx.store, fileId, actor, 'adjunto_chat');
      const message = await tx.store.insert('mensajes', {
        ...key,
        tipo: fileId ? 'archivo' : 'texto',
        contenido: content,
        archivoId: fileId,
      });
      await tx.store.update(
        'conversaciones',
        { id: conversation.id },
        { ultimoMensajeEn: new Date() },
      );
      await tx.store.update(
        'participantes_conversacion',
        { conversacionId: conversation.id, usuarioId: other },
        { archivadaEn: null },
      );
      await this.notify(tx, other, 'mensaje', 'Tienes un nuevo mensaje', {
        conversacionId: conversation.id,
        mensajeId: message.id,
      });
      return message;
    });
  }
  async read(
    actor: Actor,
    conversationId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['ultimoMensajeId']);
    const messageId = v.id(body.ultimoMensajeId);
    return this.db.transaction(async (tx) => {
      const conversation = await this.participant(
        tx.store,
        actor,
        conversationId,
        true,
      );
      ensure(
        await tx.store.one('mensajes', {
          id: messageId,
          conversacionId: conversation.id,
        }),
        'El mensaje pertenece a otra conversación.',
      );
      const key = { conversacionId: conversation.id, usuarioId: actor.id };
      const previous = await tx.store.one('lecturas_conversacion', key);
      if (previous && BigInt(previous.ultimoMensajeId) >= BigInt(messageId))
        return previous;
      const data = { ultimoMensajeId: messageId, leidoEn: new Date() };
      return previous
        ? (await tx.store.update('lecturas_conversacion', key, data))[0]
        : tx.store.insert('lecturas_conversacion', { ...key, ...data });
    });
  }
  async removeMessage(
    actor: Actor,
    conversationId: unknown,
    messageId: unknown,
  ): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const conversation = await this.participant(
        tx.store,
        actor,
        conversationId,
        true,
      );
      const message = await this.owned(
        tx.store,
        'mensajes',
        messageId,
        actor,
        'autorId',
      );
      ensure(
        message.conversacionId === conversation.id,
        'Mensaje de otra conversación.',
        403,
      );
      await tx.store.update(
        'mensajes',
        { id: message.id },
        { eliminadoEn: new Date() },
      );
      return { mensaje: 'Mensaje eliminado lógicamente.' };
    });
  }
  async archive(
    actor: Actor,
    conversationId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['archivada', 'silenciada']);
    const fields = v.pickDefined(body, {
      archivada: (x) => v.boolean(x, 'archivada'),
      silenciada: (x) => v.boolean(x, 'silenciada'),
    });
    const conversation = await this.participant(
      this.db.read.store,
      actor,
      conversationId,
    );
    return (
      await this.db.read.store.update(
        'participantes_conversacion',
        { conversacionId: conversation.id, usuarioId: actor.id },
        {
          ...(fields.archivada === undefined
            ? {}
            : { archivadaEn: fields.archivada ? new Date() : null }),
          ...(fields.silenciada === undefined
            ? {}
            : { silenciada: fields.silenciada }),
        },
      )
    )[0];
  }
  async block(actor: Actor, targetId: unknown, blocked: boolean): Promise<Row> {
    const userId = v.userId(targetId);
    ensure(userId !== actor.id, 'No puedes bloquearte a ti mismo.');
    return this.db.transaction(async (tx) => {
      const target = await tx.store.one(
        'usuarios',
        { id: userId, eliminadoEn: null },
        { lock: true },
      );
      if (!target) missing();
      const key = { bloqueadorId: actor.id, bloqueadoId: userId };
      if (blocked) {
        if (!(await tx.store.one('bloqueos_usuario', key)))
          await tx.store.insert('bloqueos_usuario', key);
      } else await tx.store.remove('bloqueos_usuario', key);
      await this.audit(
        tx,
        actor,
        blocked ? 'usuario.bloqueado' : 'usuario.desbloqueado',
        'usuario',
        userId,
      );
      return { bloqueado: blocked };
    });
  }
  blocks(actor: Actor, query: Row) {
    return this.page(
      this.db.read.store,
      'bloqueos_usuario',
      { bloqueadorId: actor.id },
      v.pagination(query),
      { creadoEn: 'DESC' },
    );
  }
}

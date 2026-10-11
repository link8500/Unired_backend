import {
  Actor,
  BinaryStorage,
  Database,
  Row,
  Tokens,
  Where,
} from '../../domain/common/contracts';
import {
  DomainError,
  ensure,
  forbidden,
  missing,
} from '../../domain/common/errors';
import * as v from '../../domain/common/validation';
import { readyFile } from '../../domain/policies/access';
import { BaseUseCases } from '../shared/base.use-cases';
import { LearningUseCases } from '../learning/learning.use-cases';
import { Archivos, EntityName } from '../../domain/common/models';

export const purposes = [
  'avatar',
  'banner_perfil',
  'evidencia_tutor',
  'portada_curso',
  'galeria_curso',
  'video_leccion',
  'recurso_curso',
  'imagen_anuncio',
  'adjunto_chat',
] as const;
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};
export function fileMetadata(file: Archivos) {
  return {
    id: file.id,
    proposito: file.proposito,
    nombreOriginal: file.nombreOriginal,
    mimeDetectado: file.mimeDetectado,
    tamanoBytes: file.tamanoBytes,
    anchoPx: file.anchoPx,
    altoPx: file.altoPx,
    duracionSegundos: file.duracionSegundos,
    estado: file.estado,
    escaneo: file.escaneo,
    procesamiento: file.procesamiento,
    creadoEn: file.creadoEn,
  };
}
export class MediaUseCases extends BaseUseCases {
  constructor(
    db: Database,
    private readonly storage: BinaryStorage,
    private readonly tokens: Tokens,
    private readonly learning: LearningUseCases,
  ) {
    super(db);
  }
  async upload(
    actor: Actor,
    input: unknown,
    path: string,
    originalName: string,
  ): Promise<Row> {
    const body = v.object(input, ['proposito']);
    const purpose = v.choice(body.proposito, purposes, 'proposito');
    const detected = await this.storage.limited(
      () => this.storage.inspect(path),
      path,
    );
    const image = detected.mime.startsWith('image/');
    const video = detected.mime.startsWith('video/');
    if (
      ['avatar', 'banner_perfil', 'portada_curso', 'imagen_anuncio'].includes(
        purpose,
      )
    )
      ensure(image, 'Este propósito requiere una imagen.');
    if (purpose === 'video_leccion')
      ensure(video, 'Este propósito requiere un video.');
    if (purpose === 'galeria_curso')
      ensure(image || video, 'La galería requiere imagen o video.');
    if (purpose === 'evidencia_tutor')
      ensure(
        image || detected.mime === 'application/pdf',
        'La acreditación admite imágenes y PDF.',
      );
    const max = Number(
      process.env[
        video
          ? 'UPLOAD_VIDEO_MAX_BYTES'
          : detected.mime === 'application/pdf'
            ? 'UPLOAD_DOCUMENT_MAX_BYTES'
            : 'UPLOAD_IMAGE_MAX_BYTES'
      ] ??
        (video
          ? 1073741824
          : detected.mime === 'application/pdf'
            ? 20971520
            : 10485760),
    );
    const folder = ['avatar', 'banner_perfil'].includes(purpose)
      ? 'perfiles'
      : purpose === 'imagen_anuncio'
        ? 'market'
        : purpose === 'evidencia_tutor'
          ? 'documentos'
          : purpose === 'adjunto_chat'
            ? 'chat'
            : 'tutorias';
    const stored = await this.storage.put(
      path,
      folder + '/' + actor.id + '/' + purpose,
      extensions[detected.mime],
      max,
    );
    let file: Archivos;
    try {
      file = await this.db.transaction(async (tx) => {
        await tx.store.one('usuarios', { id: actor.id }, { lock: true });
        const existing = await tx.store.find(
          'archivos',
          { propietarioId: actor.id },
          { fields: ['tamanoBytes'], limit: 1001 },
        );
        ensure(existing.length < 1000, 'Límite de archivos alcanzado.', 409);
        const used = existing.reduce(
          (sum, entry) => sum + BigInt(entry.tamanoBytes),
          0n,
        );
        const quota = BigInt(
          process.env.UPLOAD_OWNER_MAX_BYTES ?? '5368709120',
        );
        ensure(
          used + BigInt(stored.bytes) <= quota,
          'Cuota de almacenamiento alcanzada.',
          413,
        );
        return tx.store.insert('archivos', {
          propietarioId: actor.id,
          proposito: purpose,
          proveedor: 'local',
          storageBucket: 'private-media',
          storageKey: stored.key,
          extension: extensions[detected.mime],
          nombreOriginal: v.text(originalName, 'nombreArchivo', 255),
          mimeDetectado: detected.mime,
          tamanoBytes: String(stored.bytes),
          sha256: stored.sha256,
          anchoPx: detected.width ?? null,
          altoPx: detected.height ?? null,
          estado: 'cuarentena',
          escaneo: 'pendiente',
          procesamiento: video ? 'pendiente' : 'no_aplica',
        });
      });
    } catch (error) {
      await this.storage.remove(stored.key);
      throw error;
    }
    return this.process(actor, file.id);
  }
  async process(actor: Actor, resourceId: unknown): Promise<Row> {
    const file = await this.owned(
      this.db.read.store,
      'archivos',
      resourceId,
      actor,
      'propietarioId',
      false,
    );
    if (readyFile(file)) return fileMetadata(file);
    return this.storage.limited(async () => {
      let scanned = false;
      try {
        await this.storage.scan(file.storageKey);
        scanned = true;
        await this.db.read.store.update(
          'archivos',
          { id: file.id },
          { escaneo: 'limpio' },
        );
        let duration: number | null = null;
        if (file.mimeDetectado.startsWith('video/')) {
          await this.db.read.store.update(
            'archivos',
            { id: file.id },
            { procesamiento: 'procesando' },
          );
          duration = (await this.storage.probeVideo(file.storageKey)).duration;
        } else if (file.mimeDetectado.startsWith('image/')) {
          const old = await this.db.read.store.one('variantes_archivo', {
            archivoId: file.id,
            nombre: 'thumbnail',
          });
          if (!old) {
            const thumbnail = await this.storage.thumbnail(
              file.storageKey,
              'variantes/' + actor.id + '/' + file.id,
            );
            try {
              await this.db.read.store.insert('variantes_archivo', {
                archivoId: file.id,
                nombre: 'thumbnail',
                tipo: 'imagen',
                storageKey: thumbnail.key,
                mimeDetectado: 'image/webp',
                tamanoBytes: String(thumbnail.bytes),
                anchoPx: thumbnail.width,
                altoPx: thumbnail.height,
                estado: 'listo',
              });
            } catch (error) {
              await this.storage.remove(thumbnail.key);
              throw error;
            }
          }
        }
        const [ready] = await this.db.read.store.update(
          'archivos',
          { id: file.id },
          {
            estado: 'listo',
            escaneo: 'limpio',
            procesamiento: file.mimeDetectado.startsWith('video/')
              ? 'listo'
              : 'no_aplica',
            duracionSegundos: duration,
          },
        );
        return fileMetadata(ready);
      } catch (error) {
        const problem =
          error instanceof DomainError
            ? error
            : new DomainError(
                503,
                'PROCESSING_FAILED',
                'No se pudo verificar o procesar el archivo.',
              );
        await this.db.read.store.update(
          'archivos',
          { id: file.id },
          {
            estado: [415, 422].includes(problem.status)
              ? 'bloqueado'
              : 'cuarentena',
            escaneo: scanned ? 'limpio' : 'error',
            ...(file.mimeDetectado.startsWith('video/')
              ? { procesamiento: 'error' }
              : {}),
          },
        );
        throw new DomainError(problem.status, problem.code, problem.message, {
          archivoId: file.id,
        });
      }
    }, file.id);
  }
  async mine(actor: Actor, query: Row) {
    const page = await this.page(
      this.db.read.store,
      'archivos',
      { propietarioId: actor.id, eliminadoEn: null },
      v.pagination(query),
    );
    return { ...page, items: page.items.map(fileMetadata) };
  }
  async metadata(actor: Actor, resourceId: unknown): Promise<Row> {
    return fileMetadata(
      await this.owned(
        this.db.read.store,
        'archivos',
        resourceId,
        actor,
        'propietarioId',
        false,
      ),
    );
  }
  async profileImage(
    actor: Actor,
    type: 'avatar' | 'banner_perfil',
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['archivoId']);
    return this.db.transaction(async (tx) => {
      if (body.archivoId !== null)
        await this.file(tx.store, body.archivoId, actor, type);
      const key = type === 'avatar' ? 'avatarArchivoId' : 'bannerArchivoId';
      const [result] = await tx.store.update(
        'perfiles_usuario',
        { usuarioId: actor.id },
        { [key]: body.archivoId === null ? null : v.id(body.archivoId) },
      );
      if (!result) missing();
      return result;
    });
  }
  async gallery(actor: Actor, courseId: unknown, input: unknown): Promise<Row> {
    const body = v.object(input, ['archivoId', 'orden']);
    return this.db.transaction(async (tx) => {
      const course = await this.owned(
        tx.store,
        'tutorias',
        courseId,
        actor,
        'tutorId',
      );
      ensure(
        !['bloqueada', 'archivada'].includes(course.estado),
        'Curso no editable.',
        409,
      );
      ensure(
        (await tx.store.count('galeria_tutoria', { tutoriaId: course.id })) <
          20,
        'Máximo 20 archivos en la galería.',
      );
      const file = await this.file(
        tx.store,
        body.archivoId,
        actor,
        'galeria_curso',
      );
      return tx.store.insert('galeria_tutoria', {
        tutoriaId: course.id,
        tutorId: actor.id,
        archivoId: file.id,
        tipo: file.mimeDetectado.startsWith('video/') ? 'video' : 'imagen',
        orden: v.integer(body.orden, 'orden', 1, 20),
      });
    });
  }
  async removeGallery(
    actor: Actor,
    courseId: unknown,
    fileId: unknown,
  ): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const course = await this.owned(
        tx.store,
        'tutorias',
        courseId,
        actor,
        'tutorId',
      );
      ensure(
        !['bloqueada', 'archivada'].includes(course.estado),
        'Curso no editable.',
        409,
      );
      await tx.store.remove('galeria_tutoria', {
        tutoriaId: course.id,
        archivoId: v.id(fileId),
      });
      return { mensaje: 'Archivo desvinculado de la galería.' };
    });
  }
  async download(
    actor: Actor | undefined,
    resourceId: unknown,
    thumbnail = false,
  ) {
    const store = this.db.read.store;
    const file = await this.resource(store, 'archivos', resourceId);
    let allowed = actor?.id === file.propietarioId;
    if (!allowed && ['avatar', 'banner_perfil'].includes(file.proposito)) {
      const profile = await store.one('perfiles_usuario', {
        [file.proposito === 'avatar' ? 'avatarArchivoId' : 'bannerArchivoId']:
          file.id,
      });
      allowed =
        !!profile &&
        !!(await store.one('usuarios', {
          id: profile.usuarioId,
          estado: 'activo',
          eliminadoEn: null,
        }));
    }
    if (!allowed && file.proposito === 'imagen_anuncio') {
      const links = await store.find(
        'imagenes_anuncio',
        { archivoId: file.id },
        { limit: 1000 },
      );
      for (const link of links)
        if (await this.db.read.queries.publicListing(link.anuncioId)) {
          allowed = true;
          break;
        }
    }
    if (
      !allowed &&
      ['portada_curso', 'galeria_curso'].includes(file.proposito)
    ) {
      const links =
        file.proposito === 'portada_curso'
          ? (
              await store.find(
                'tutorias',
                { portadaArchivoId: file.id },
                { limit: 1000 },
              )
            ).map((course) => course.id)
          : (
              await store.find(
                'galeria_tutoria',
                { archivoId: file.id },
                { limit: 1000 },
              )
            ).map((entry) => entry.tutoriaId);
      for (const link of links)
        if (await this.db.read.queries.publicCourse(link)) {
          allowed = true;
          break;
        }
    }
    if (
      !allowed &&
      ['video_leccion', 'recurso_curso'].includes(file.proposito)
    ) {
      const links =
        file.proposito === 'video_leccion'
          ? (
              await store.find(
                'lecciones_tutoria',
                { videoArchivoId: file.id, publicada: true, archivadaEn: null },
                { limit: 1000 },
              )
            ).map((lesson) => lesson.id)
          : (
              await store.find(
                'recursos_leccion',
                { archivoId: file.id },
                { limit: 1000 },
              )
            ).map((resource) => resource.leccionId);
      const lessons = await store.find(
        'lecciones_tutoria',
        {
          id: { op: 'in', value: links },
          publicada: true,
          archivadaEn: null,
        },
        { limit: 1000 },
      );
      for (const lesson of lessons) {
        if (
          !lesson ||
          !(await this.db.read.queries.publicCourse(lesson.tutoriaId))
        )
          continue;
        if (lesson.vistaPrevia) {
          allowed = true;
          break;
        }
        if (actor) {
          try {
            await this.learning.access(this.db.read, actor, lesson.tutoriaId);
            allowed = true;
            break;
          } catch (error) {
            if (!(error instanceof DomainError)) throw error;
          }
        }
      }
    }
    if (!allowed && actor && file.proposito === 'adjunto_chat') {
      const messages = await store.find(
        'mensajes',
        { archivoId: file.id, eliminadoEn: null },
        { limit: 1000 },
      );
      for (const message of messages)
        if (
          await store.one('participantes_conversacion', {
            conversacionId: message.conversacionId,
            usuarioId: actor.id,
            salioEn: null,
          })
        ) {
          allowed = true;
          break;
        }
      if (
        !allowed &&
        actor.roles.some((r) => ['administrador', 'moderador'].includes(r))
      ) {
        const allMessages = await store.find(
          'mensajes',
          { archivoId: file.id },
          { limit: 1000 },
        );
        for (const message of allMessages) {
          const report = await store.one('denuncias', {
            mensajeId: message.id,
          });
          if (
            report &&
            (report.asignadaA === actor.id ||
              actor.roles.includes('administrador'))
          ) {
            await this.db.transaction((tx) =>
              this.audit(
                tx,
                actor,
                'archivo.denuncia_consultada',
                'archivo',
                file.id,
                { denunciaId: report.id },
              ),
            );
            allowed = true;
            break;
          }
        }
      }
    }
    if (
      !allowed &&
      actor &&
      file.proposito === 'evidencia_tutor' &&
      actor.roles.some((r) => ['administrador', 'revisor_tutores'].includes(r))
    ) {
      const documents = await store.find(
        'documentos_solicitud',
        { archivoId: file.id },
        { limit: 1000 },
      );
      for (const document of documents) {
        const request = await store.one('solicitudes_tutor', {
          id: document.solicitudId,
        });
        if (
          request &&
          (request.asignadaA === actor.id ||
            actor.roles.includes('administrador'))
        ) {
          await this.db.transaction((tx) =>
            this.audit(
              tx,
              actor,
              'archivo.acreditacion_consultada',
              'archivo',
              file.id,
              { solicitudId: request.id },
            ),
          );
          allowed = true;
          break;
        }
      }
    }
    if (!allowed)
      forbidden('Archivo privado. No tienes acceso al recurso asociado.');
    ensure(readyFile(file), 'Archivo no disponible.', 409, 'FILE_NOT_READY');
    if (thumbnail) {
      const variant = await store.one('variantes_archivo', {
        archivoId: file.id,
        nombre: 'thumbnail',
        estado: 'listo',
      });
      if (!variant) missing('Miniatura no disponible.');
      return {
        ...variant,
        nombreOriginal: 'thumbnail.webp',
        path: this.storage.absolute(variant.storageKey),
      };
    }
    return { ...file, path: this.storage.absolute(file.storageKey) };
  }
  async ticket(actor: Actor, resourceId: unknown) {
    const file = await this.download(actor, resourceId);
    const token = await this.tokens.fileAccess(
      actor.id,
      actor.sessionId,
      file.id,
    );
    return {
      fileId: file.id,
      ticket: token,
      expiresIn: 120,
    };
  }
  async remove(actor: Actor, resourceId: unknown): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const file = await this.owned(
        tx.store,
        'archivos',
        resourceId,
        actor,
        'propietarioId',
      );
      const references: [EntityName, Where][] = [
        ['perfiles_usuario', { avatarArchivoId: file.id }],
        ['perfiles_usuario', { bannerArchivoId: file.id }],
        ['documentos_solicitud', { archivoId: file.id }],
        ['tutorias', { portadaArchivoId: file.id }],
        ['galeria_tutoria', { archivoId: file.id }],
        ['lecciones_tutoria', { videoArchivoId: file.id }],
        ['recursos_leccion', { archivoId: file.id }],
        ['imagenes_anuncio', { archivoId: file.id }],
        ['mensajes', { archivoId: file.id }],
      ];
      for (const [entity, where] of references)
        ensure(
          !(await tx.store.count(entity, where)),
          'El archivo está vinculado a un recurso o historial. Desvincúlalo cuando corresponda.',
          409,
        );
      await tx.store.update(
        'archivos',
        { id: file.id },
        { estado: 'eliminado', eliminadoEn: new Date() },
      );
      await this.audit(
        tx,
        actor,
        'archivo.eliminado_logicamente',
        'archivo',
        file.id,
      );
      return {
        mensaje:
          'Archivo marcado como eliminado. No se destruyen objetos históricos automáticamente.',
      };
    });
  }
}

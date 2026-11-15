import { Actor, Row, Store } from '../../domain/common/contracts';
import { ensure, missing } from '../../domain/common/errors';
import * as v from '../../domain/common/validation';
import { validGrant } from '../../domain/policies/access';
import { price } from '../../domain/policies/prices';
import { BaseUseCases } from '../shared/base.use-cases';
import {
  courseDetailFields,
  courseDetails,
} from '../../domain/policies/publication-details';

// Los clientes anteriores pueden enviar metadatos que ahora controla la API.
const acceptedCourseDetails = [
  ...courseDetailFields,
  'idioma',
  'duracionEstimadaMinutos',
] as const;

export class CoursesUseCases extends BaseUseCases {
  catalog(query: Row) {
    return this.db.read.queries.catalog('courses', {
      ...v.pagination(query),
      ...(query.areaId === undefined ? {} : { areaId: v.userId(query.areaId) }),
      ...(query.tutorId === undefined
        ? {}
        : { tutorId: v.userId(query.tutorId) }),
      sort:
        query.sort === undefined
          ? 'recent'
          : v.choice(query.sort, ['recent', 'popular'], 'sort'),
    });
  }
  async publicDetails(resourceId: unknown): Promise<Row> {
    const course = await this.db.read.queries.publicCourse(v.id(resourceId));
    if (!course) missing('Curso no disponible.');
    const [sections, lessons, gallery] = await Promise.all([
      this.db.read.store.find(
        'secciones_tutoria',
        { tutoriaId: course.id, archivadaEn: null },
        { order: { orden: 'ASC' }, limit: 200 },
      ),
      this.db.read.store.find(
        'lecciones_tutoria',
        { tutoriaId: course.id, archivadaEn: null, publicada: true },
        {
          fields: [
            'id',
            'seccionId',
            'titulo',
            'tipo',
            'orden',
            'vistaPrevia',
            'videoArchivoId',
          ],
          order: { orden: 'ASC' },
          limit: 2000,
        },
      ),
      this.db.read.store.find(
        'galeria_tutoria',
        { tutoriaId: course.id },
        { order: { orden: 'ASC' }, limit: 100 },
      ),
    ]);
    const videoIds = lessons
      .filter((l) => l.videoArchivoId)
      .map((l) => String(l.videoArchivoId));
    const videos = videoIds.length
      ? await this.db.read.store.find(
          'archivos',
          { id: { op: 'in', value: videoIds } },
          { fields: ['id', 'duracionSegundos'], limit: 2000 },
        )
      : [];
    const durations = new Map(
      videos.map((video) => [video.id, video.duracionSegundos]),
    );
    const outline = lessons.map((lesson) => {
      const result: Row = {
        ...lesson,
        duracionSegundos: lesson.videoArchivoId
          ? (durations.get(lesson.videoArchivoId) ?? 0)
          : 0,
      };
      delete result.videoArchivoId;
      return result;
    });
    return {
      ...course,
      secciones: sections.map((section) => ({
        ...section,
        lecciones: outline.filter((lesson) => lesson.seccionId === section.id),
      })),
      galeria: gallery,
    };
  }
  mine(actor: Actor, query: Row) {
    return this.db.read.queries.ownedCourses(actor.id, v.pagination(query));
  }
  async owner(store: Store, actor: Actor, resourceId: unknown, lock = true) {
    const course = await this.owned(
      store,
      'tutorias',
      resourceId,
      actor,
      'tutorId',
      lock,
    );
    ensure(
      !['bloqueada', 'archivada'].includes(course.estado),
      'Este curso no admite cambios.',
      409,
    );
    if (course.estado === 'publicada') {
      const grant = await store.one(
        'habilitaciones_tutor',
        { id: course.habilitacionId },
        { lock },
      );
      ensure(
        validGrant(grant, actor.id, course.areaId),
        'La habilitación del curso no está vigente.',
        403,
      );
    }
    return course;
  }
  async ownDetails(actor: Actor, resourceId: unknown): Promise<Row> {
    const store = this.db.read.store;
    const course = await this.owned(
      store,
      'tutorias',
      resourceId,
      actor,
      'tutorId',
      false,
    );
    const now = new Date();
    const [sections, lessons, gallery, grant, session, duration, resources] =
      await Promise.all([
        store.find(
          'secciones_tutoria',
          { tutoriaId: course.id, archivadaEn: null },
          { order: { orden: 'ASC' }, limit: 200 },
        ),
        store.find(
          'lecciones_tutoria',
          { tutoriaId: course.id, archivadaEn: null },
          { order: { orden: 'ASC' }, limit: 2000 },
        ),
        store.find(
          'galeria_tutoria',
          { tutoriaId: course.id },
          { order: { orden: 'ASC' }, limit: 100 },
        ),
        store.one('habilitaciones_tutor', {
          tutorId: actor.id,
          areaId: course.areaId,
        }),
        ['en_vivo', 'mixta'].includes(course.modalidad)
          ? store.one('sesiones_tutoria', {
              tutoriaId: course.id,
              estado: 'programada',
              inicioEn: { op: 'gt', value: now },
            })
          : undefined,
        this.db.read.queries.courseDuration(course.id),
        store.find(
          'recursos_leccion',
          { tutoriaId: course.id },
          { limit: 10000 },
        ),
      ]);
    // Una lectura por lote permite presentar nombres y duraciones al autor sin
    // exponer rutas de almacenamiento ni hacer una consulta por cada lección.
    const fileIds = [
      ...new Set(
        [
          ...lessons.map((lesson) => lesson.videoArchivoId),
          ...resources.map((resource) => resource.archivoId),
        ].filter(Boolean),
      ),
    ];
    const files = fileIds.length
      ? await store.find(
          'archivos',
          { id: { op: 'in', value: fileIds } },
          {
            fields: [
              'id',
              'nombreOriginal',
              'duracionSegundos',
              'tamanoBytes',
              'extension',
            ],
            limit: 12000,
          },
        )
      : [];
    const media = new Map(files.map((file) => [String(file.id), file]));
    const lessonResources = new Map<string, Row[]>();
    for (const resource of resources) {
      const key = String(resource.leccionId);
      const items = lessonResources.get(key) ?? [];
      const file = media.get(String(resource.archivoId));
      items.push({
        ...resource,
        nombreOriginal: file?.nombreOriginal ?? resource.titulo,
        tamanoBytes: file?.tamanoBytes ?? null,
        extension: file?.extension ?? null,
      });
      lessonResources.set(key, items);
    }
    return {
      ...course,
      duracionEstimadaMinutos: duration,
      secciones: sections,
      lecciones: lessons.map((lesson) => ({
        ...lesson,
        videoNombre:
          media.get(String(lesson.videoArchivoId))?.nombreOriginal ?? null,
        duracionSegundos:
          media.get(String(lesson.videoArchivoId))?.duracionSegundos ?? 0,
        recursos: lessonResources.get(String(lesson.id)) ?? [],
      })),
      galeria: gallery,
      preparacion: {
        acreditacionVigente: validGrant(grant, actor.id, course.areaId, now),
        leccionesPublicadas: lessons.filter((lesson) => lesson.publicada)
          .length,
        tieneSesionFutura: Boolean(session),
      },
    };
  }
  async create(actor: Actor, input: unknown): Promise<Row> {
    const body = v.object(input, [
      'areaId',
      ...acceptedCourseDetails,
      'titulo',
      'descripcion',
      'nivel',
      'modalidad',
      'precioBase',
      'descuentoPorcentaje',
      'moneda',
      'portadaArchivoId',
    ]);
    const areaId = v.userId(body.areaId);
    const data = {
      areaId,
      tutorId: actor.id,
      titulo: v.text(body.titulo, 'titulo', 220),
      descripcion: v.text(body.descripcion, 'descripcion', 20000),
      nivel: v.choice(
        body.nivel ?? 'todos',
        ['inicial', 'intermedio', 'avanzado', 'todos'],
        'nivel',
      ),
      modalidad: v.choice(
        body.modalidad ?? 'grabada',
        ['grabada', 'en_vivo', 'mixta'],
        'modalidad',
      ),
      ...price(body, false),
      ...courseDetails(body),
    };
    return this.db.transaction(async (tx) => {
      ensure(
        await tx.store.one('areas_tutoria', { id: areaId, activo: true }),
        'Área no disponible.',
      );
      if (body.portadaArchivoId != null)
        await this.file(
          tx.store,
          body.portadaArchivoId,
          actor,
          'portada_curso',
        );
      const course = await tx.store.insert('tutorias', {
        ...data,
        portadaArchivoId:
          body.portadaArchivoId == null ? null : v.id(body.portadaArchivoId),
      });
      await this.audit(tx, actor, 'curso.creado', 'curso', course.id);
      return course;
    });
  }
  async update(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, [
      'versionLock',
      ...acceptedCourseDetails,
      'titulo',
      'descripcion',
      'nivel',
      'modalidad',
      'precioBase',
      'descuentoPorcentaje',
      'moneda',
      'portadaArchivoId',
    ]);
    return this.db.transaction(async (tx) => {
      const course = await this.owner(tx.store, actor, resourceId);
      ensure(
        course.versionLock === v.integer(body.versionLock, 'versionLock', 1),
        'El curso cambió.',
        409,
      );
      const editable = { ...body };
      delete editable.versionLock;
      const fields = v.pickDefined(
        editable,
        {
          titulo: (x) => v.text(x, 'titulo', 220),
          descripcion: (x) => v.text(x, 'descripcion', 20000),
          nivel: (x) =>
            v.choice(
              x,
              ['inicial', 'intermedio', 'avanzado', 'todos'],
              'nivel',
            ),
          modalidad: (x) =>
            v.choice(x, ['grabada', 'en_vivo', 'mixta'], 'modalidad'),
          precioBase: (x) => v.money(x, 'precioBase'),
          descuentoPorcentaje: (x) => v.money(x, 'descuentoPorcentaje', 9000n),
          moneda: (x) => v.text(x, 'moneda', 3, 3),
          portadaArchivoId: (x) => (x === null ? null : v.id(x)),
        },
        { allowEmpty: true },
      );
      const details = courseDetails(body);
      ensure(
        Object.keys(fields).length || Object.keys(details).length,
        'No hay campos editables.',
      );
      const pricing = price({ ...course, ...fields }, false);
      if (fields.portadaArchivoId)
        await this.file(
          tx.store,
          fields.portadaArchivoId,
          actor,
          'portada_curso',
        );
      // Cambiar modalidad de un curso publicado obliga a volver a validar su currículo.
      if (course.estado === 'publicada')
        ensure(
          fields.modalidad === undefined ||
            fields.modalidad === course.modalidad,
          'Pausa el curso antes de cambiar su modalidad.',
          409,
        );
      const [result] = await tx.store.update(
        'tutorias',
        { id: course.id },
        {
          ...fields,
          ...details,
          ...pricing,
          versionLock: course.versionLock + 1,
        },
      );
      await this.audit(tx, actor, 'curso.actualizado', 'curso', course.id);
      return result;
    });
  }
  async publish(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['versionLock']);
    return this.db.transaction(async (tx) => {
      const course = await this.owner(tx.store, actor, resourceId);
      ensure(
        course.versionLock === v.integer(body.versionLock, 'versionLock', 1),
        'El curso cambió.',
        409,
      );
      const grant = await tx.store.one(
        'habilitaciones_tutor',
        { tutorId: actor.id, areaId: course.areaId },
        { lock: true },
      );
      ensure(
        validGrant(grant, actor.id, course.areaId),
        'Necesitas acreditación vigente en el área del curso.',
        403,
      );
      if (course.portadaArchivoId)
        await this.file(
          tx.store,
          course.portadaArchivoId,
          actor,
          'portada_curso',
        );
      const lessons = await tx.store.find(
        'lecciones_tutoria',
        { tutoriaId: course.id, publicada: true, archivadaEn: null },
        { limit: 2000 },
      );
      if (['grabada', 'mixta'].includes(course.modalidad)) {
        ensure(lessons.length, 'Publica al menos una lección antes del curso.');
        for (const lesson of lessons)
          if (lesson.tipo === 'video')
            await this.file(
              tx.store,
              lesson.videoArchivoId,
              actor,
              'video_leccion',
            );
      }
      if (['en_vivo', 'mixta'].includes(course.modalidad))
        ensure(
          await tx.store.one('sesiones_tutoria', {
            tutoriaId: course.id,
            estado: 'programada',
            inicioEn: { op: 'gt', value: new Date() },
          }),
          'Programa al menos una sesión futura.',
        );
      const [result] = await tx.store.update(
        'tutorias',
        { id: course.id },
        {
          estado: 'publicada',
          habilitacionId: grant!.id,
          publicadaEn: course.publicadaEn ?? new Date(),
          versionLock: course.versionLock + 1,
        },
      );
      await this.audit(tx, actor, 'curso.publicado', 'curso', course.id);
      return result;
    });
  }
  async changeState(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['estado', 'versionLock']);
    const state = v.choice(body.estado, ['pausada', 'archivada'], 'estado');
    return this.db.transaction(async (tx) => {
      const course = await this.owner(tx.store, actor, resourceId);
      ensure(
        course.versionLock === v.integer(body.versionLock, 'versionLock', 1),
        'El curso cambió.',
        409,
      );
      ensure(
        state === 'archivada' || course.estado === 'publicada',
        'Solo puedes pausar un curso publicado.',
        409,
      );
      const [result] = await tx.store.update(
        'tutorias',
        { id: course.id },
        { estado: state, versionLock: course.versionLock + 1 },
      );
      await this.audit(tx, actor, 'curso.' + state, 'curso', course.id);
      return result;
    });
  }
  async section(
    actor: Actor,
    courseId: unknown,
    input: unknown,
    sectionId?: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['titulo', 'orden']);
    return this.db.transaction(async (tx) => {
      const course = await this.owner(tx.store, actor, courseId);
      const data = {
        titulo: v.text(body.titulo, 'titulo', 200),
        orden: v.integer(body.orden, 'orden', 1, 1000),
      };
      if (!sectionId) {
        ensure(
          (await tx.store.count('secciones_tutoria', {
            tutoriaId: course.id,
            archivadaEn: null,
          })) < 200,
          'Máximo 200 secciones.',
        );
        return tx.store.insert('secciones_tutoria', {
          ...data,
          tutoriaId: course.id,
        });
      }
      const section = await this.resource(
        tx.store,
        'secciones_tutoria',
        sectionId,
        true,
      );
      ensure(section.tutoriaId === course.id, 'Sección de otro curso.', 403);
      return (
        await tx.store.update('secciones_tutoria', { id: section.id }, data)
      )[0];
    });
  }
  async removeSection(
    actor: Actor,
    courseId: unknown,
    sectionId: unknown,
  ): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const course = await this.owner(tx.store, actor, courseId);
      const section = await this.resource(
        tx.store,
        'secciones_tutoria',
        sectionId,
        true,
      );
      ensure(section.tutoriaId === course.id, 'Sección de otro curso.', 403);
      ensure(
        !(await tx.store.count('lecciones_tutoria', {
          seccionId: section.id,
          archivadaEn: null,
        })),
        'Archiva las lecciones de la sección primero.',
        409,
      );
      await tx.store.update(
        'secciones_tutoria',
        { id: section.id },
        { archivadaEn: new Date() },
      );
      return { mensaje: 'Sección archivada.' };
    });
  }
  async lesson(
    actor: Actor,
    courseId: unknown,
    input: unknown,
    lessonId?: unknown,
  ): Promise<Row> {
    const body = v.object(input, [
      'seccionId',
      'titulo',
      'tipo',
      'contenidoTexto',
      'videoArchivoId',
      'orden',
      'vistaPrevia',
      'publicada',
    ]);
    return this.db.transaction(async (tx) => {
      const course = await this.owner(tx.store, actor, courseId);
      const section = await this.resource(
        tx.store,
        'secciones_tutoria',
        body.seccionId,
      );
      ensure(section.tutoriaId === course.id, 'Sección de otro curso.', 403);
      const type = v.choice(body.tipo, ['video', 'texto'], 'tipo');
      if (type === 'video')
        await this.file(tx.store, body.videoArchivoId, actor, 'video_leccion');
      const data = {
        seccionId: section.id,
        titulo: v.text(body.titulo, 'titulo', 220),
        tipo: type,
        contenidoTexto:
          type === 'texto'
            ? v.text(body.contenidoTexto, 'contenidoTexto', 100000)
            : null,
        videoArchivoId: type === 'video' ? v.id(body.videoArchivoId) : null,
        orden: v.integer(body.orden, 'orden', 1, 1000),
        vistaPrevia: v.boolean(body.vistaPrevia ?? false, 'vistaPrevia'),
        publicada: v.boolean(body.publicada ?? false, 'publicada'),
      };
      if (!lessonId) {
        ensure(
          (await tx.store.count('lecciones_tutoria', {
            tutoriaId: course.id,
            archivadaEn: null,
          })) < 2000,
          'Máximo 2000 lecciones.',
        );
        return tx.store.insert('lecciones_tutoria', {
          ...data,
          tutoriaId: course.id,
          tutorId: actor.id,
        });
      }
      const lesson = await this.resource(
        tx.store,
        'lecciones_tutoria',
        lessonId,
        true,
      );
      ensure(lesson.tutoriaId === course.id, 'Lección de otro curso.', 403);
      // No dejar sin currículo grabado un curso ya publicado.
      if (
        course.estado === 'publicada' &&
        lesson.publicada &&
        !data.publicada &&
        ['grabada', 'mixta'].includes(course.modalidad)
      )
        ensure(
          (await tx.store.count('lecciones_tutoria', {
            tutoriaId: course.id,
            publicada: true,
            archivadaEn: null,
          })) > 1,
          'Pausa el curso antes de retirar su última lección.',
          409,
        );
      return (
        await tx.store.update('lecciones_tutoria', { id: lesson.id }, data)
      )[0];
    });
  }
  async removeLesson(
    actor: Actor,
    courseId: unknown,
    lessonId: unknown,
  ): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const course = await this.owner(tx.store, actor, courseId);
      const lesson = await this.resource(
        tx.store,
        'lecciones_tutoria',
        lessonId,
        true,
      );
      ensure(lesson.tutoriaId === course.id, 'Lección de otro curso.', 403);
      if (
        course.estado === 'publicada' &&
        lesson.publicada &&
        ['grabada', 'mixta'].includes(course.modalidad)
      )
        ensure(
          (await tx.store.count('lecciones_tutoria', {
            tutoriaId: course.id,
            publicada: true,
            archivadaEn: null,
          })) > 1,
          'Pausa el curso antes de archivar su última lección.',
          409,
        );
      await tx.store.update(
        'lecciones_tutoria',
        { id: lesson.id },
        { archivadaEn: new Date(), publicada: false },
      );
      return { mensaje: 'Lección archivada; progreso conservado.' };
    });
  }
  async resourceLink(
    actor: Actor,
    courseId: unknown,
    lessonId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['archivoId', 'titulo']);
    return this.db.transaction(async (tx) => {
      const course = await this.owner(tx.store, actor, courseId);
      const lesson = await this.resource(
        tx.store,
        'lecciones_tutoria',
        lessonId,
      );
      ensure(lesson.tutoriaId === course.id, 'Lección de otro curso.', 403);
      const file = await this.file(
        tx.store,
        body.archivoId,
        actor,
        'recurso_curso',
      );
      return tx.store.insert('recursos_leccion', {
        tutoriaId: course.id,
        tutorId: actor.id,
        leccionId: lesson.id,
        archivoId: file.id,
        titulo: v.text(body.titulo ?? file.nombreOriginal, 'titulo', 180),
      });
    });
  }
  async removeResource(
    actor: Actor,
    courseId: unknown,
    resourceId: unknown,
  ): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const course = await this.owner(tx.store, actor, courseId);
      const resource = await this.resource(
        tx.store,
        'recursos_leccion',
        resourceId,
        true,
      );
      ensure(resource.tutoriaId === course.id, 'Recurso de otro curso.', 403);
      await tx.store.remove('recursos_leccion', { id: resource.id });
      return { mensaje: 'Recurso desvinculado.' };
    });
  }
}

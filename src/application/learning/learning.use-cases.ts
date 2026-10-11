import {
  Actor,
  Database,
  Row,
  Transaction,
} from '../../domain/common/contracts';
import { ensure } from '../../domain/common/errors';
import { Tutorias, InscripcionesTutoria } from '../../domain/common/models';
import * as v from '../../domain/common/validation';
import { readyFile, validGrant } from '../../domain/policies/access';
import { BaseUseCases } from '../shared/base.use-cases';
import { CoursesUseCases } from '../courses/courses.use-cases';

export class LearningUseCases extends BaseUseCases {
  constructor(
    db: Database,
    private readonly courses: CoursesUseCases,
  ) {
    super(db);
  }
  async access(
    tx: Transaction,
    actor: Actor,
    courseId: unknown,
    lock = false,
  ): Promise<{ course: Tutorias; enrollment?: InscripcionesTutoria }> {
    const course = await this.resource(tx.store, 'tutorias', courseId, lock);
    if (course.tutorId === actor.id) return { course };
    const grant =
      course.habilitacionId &&
      (await tx.store.one(
        'habilitaciones_tutor',
        { id: course.habilitacionId },
        { lock },
      ));
    ensure(
      course.estado === 'publicada' &&
        validGrant(grant, course.tutorId, course.areaId) &&
        (await tx.queries.publicCourse(course.id)),
      'Curso no disponible.',
      403,
    );
    const enrollment = await tx.store.one(
      'inscripciones_tutoria',
      { tutoriaId: course.id, alumnoId: actor.id },
      { lock },
    );
    ensure(
      enrollment && ['activa', 'completada'].includes(enrollment.estado),
      'Necesitas una inscripción activa.',
      403,
    );
    return { course, enrollment };
  }
  async lesson(
    actor: Actor | undefined,
    courseId: unknown,
    lessonId: unknown,
  ): Promise<Row> {
    const store = this.db.read.store;
    const lesson = await this.resource(store, 'lecciones_tutoria', lessonId);
    ensure(lesson.tutoriaId === v.id(courseId), 'Lección de otro curso.', 404);
    const owner = actor?.id === lesson.tutorId;
    if (!owner) {
      ensure(
        lesson.publicada &&
          (await this.db.read.queries.publicCourse(lesson.tutoriaId)),
        'Lección no disponible.',
        404,
      );
      if (!lesson.vistaPrevia) {
        ensure(actor, 'Inicia sesión para acceder.', 401);
        await this.access(this.db.read, actor, lesson.tutoriaId);
      }
    }
    const resources = await store.find(
      'recursos_leccion',
      { leccionId: lesson.id },
      { limit: 100 },
    );
    return { ...lesson, recursos: resources };
  }
  enrollments(actor: Actor, query: Row) {
    return this.page(
      this.db.read.store,
      'inscripciones_tutoria',
      { alumnoId: actor.id },
      v.pagination(query),
    );
  }
  async enroll(actor: Actor, courseId: unknown): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const course = await this.resource(tx.store, 'tutorias', courseId, true);
      ensure(
        course.tutorId !== actor.id,
        'No puedes inscribirte en tu propio curso.',
      );
      const grant =
        course.habilitacionId &&
        (await tx.store.one(
          'habilitaciones_tutor',
          { id: course.habilitacionId },
          { lock: true },
        ));
      ensure(
        (await tx.queries.publicCourse(course.id)) &&
          validGrant(grant, course.tutorId, course.areaId),
        'Curso no disponible.',
        409,
      );
      const existing = await tx.store.one(
        'inscripciones_tutoria',
        { tutoriaId: course.id, alumnoId: actor.id },
        { lock: true },
      );
      if (
        existing &&
        ['solicitada', 'activa', 'completada'].includes(existing.estado)
      )
        return existing;
      ensure(
        existing?.estado !== 'revocada',
        'La inscripción fue revocada por el tutor.',
        403,
      );
      const data = {
        estado: course.precioBase === '0.00' ? 'activa' : 'solicitada',
        activadaEn: course.precioBase === '0.00' ? new Date() : null,
        completadaEn: null,
      };
      const enrollment = existing
        ? (
            await tx.store.update(
              'inscripciones_tutoria',
              { id: existing.id },
              data,
            )
          )[0]
        : await tx.store.insert('inscripciones_tutoria', {
            ...data,
            tutoriaId: course.id,
            alumnoId: actor.id,
          });
      await this.audit(
        tx,
        actor,
        'inscripcion.' + data.estado,
        'inscripcion',
        enrollment.id,
      );
      await this.notify(
        tx,
        course.tutorId,
        'inscripcion',
        'Nueva inscripción',
        { cursoId: course.id, inscripcionId: enrollment.id },
      );
      return enrollment;
    });
  }
  async cancelEnrollment(actor: Actor, enrollmentId: unknown): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const enrollment = await this.owned(
        tx.store,
        'inscripciones_tutoria',
        enrollmentId,
        actor,
        'alumnoId',
      );
      ensure(
        enrollment.estado !== 'revocada',
        'La inscripción está revocada.',
        409,
      );
      const [result] = await tx.store.update(
        'inscripciones_tutoria',
        { id: enrollment.id },
        { estado: 'cancelada' },
      );
      await tx.store.update(
        'reservas_sesion',
        { inscripcionId: enrollment.id, estado: 'confirmada' },
        { estado: 'cancelada' },
      );
      await this.audit(
        tx,
        actor,
        'inscripcion.cancelada',
        'inscripcion',
        enrollment.id,
      );
      return result;
    });
  }
  async decideEnrollment(
    actor: Actor,
    courseId: unknown,
    enrollmentId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['estado', 'motivo']);
    const state = v.choice(
      body.estado,
      ['activa', 'revocada', 'completada'],
      'estado',
    );
    const reason = v.text(body.motivo, 'motivo', 2000);
    return this.db.transaction(async (tx) => {
      const course = await this.courses.owner(tx.store, actor, courseId);
      const enrollment = await this.resource(
        tx.store,
        'inscripciones_tutoria',
        enrollmentId,
        true,
      );
      ensure(
        enrollment.tutoriaId === course.id,
        'Inscripción de otro curso.',
        403,
      );
      if (state === 'activa') {
        ensure(
          course.estado === 'publicada' &&
            (await tx.queries.publicCourse(course.id)),
          'El curso no admite nuevas altas.',
          409,
        );
        ensure(
          ['solicitada', 'revocada', 'cancelada'].includes(enrollment.estado),
          'La inscripción ya está activa.',
          409,
        );
      }
      if (state === 'completada')
        ensure(
          enrollment.estado === 'activa',
          'Solo se completa una inscripción activa.',
          409,
        );
      const [result] = await tx.store.update(
        'inscripciones_tutoria',
        { id: enrollment.id },
        {
          estado: state,
          ...(state === 'activa'
            ? { activadaEn: new Date(), completadaEn: null }
            : {}),
          ...(state === 'completada' ? { completadaEn: new Date() } : {}),
        },
      );
      if (state === 'revocada')
        await tx.store.update(
          'reservas_sesion',
          { inscripcionId: enrollment.id, estado: 'confirmada' },
          { estado: 'cancelada' },
        );
      await this.audit(
        tx,
        actor,
        'inscripcion.' + state,
        'inscripcion',
        enrollment.id,
        { motivo: reason },
      );
      await this.notify(
        tx,
        enrollment.alumnoId,
        'inscripcion',
        'Tu inscripción cambió',
        { estado: state, motivo: reason, cursoId: course.id },
      );
      return result;
    });
  }
  async progress(actor: Actor, enrollmentId: unknown): Promise<Row> {
    const enrollment = await this.owned(
      this.db.read.store,
      'inscripciones_tutoria',
      enrollmentId,
      actor,
      'alumnoId',
      false,
    );
    const course = await this.resource(
      this.db.read.store,
      'tutorias',
      enrollment.tutoriaId,
    );
    const lessons = await this.db.read.store.find(
      'lecciones_tutoria',
      { tutoriaId: course.id, publicada: true, archivadaEn: null },
      { fields: ['id'], limit: 2000 },
    );
    const progress = await this.db.read.store.find(
      'progreso_lecciones',
      { inscripcionId: enrollment.id },
      { limit: 2000 },
    );
    const published = new Set(lessons.map((lesson) => lesson.id));
    const completed = progress.filter(
      (entry) => entry.completadaEn && published.has(entry.leccionId),
    ).length;
    const notes = await this.db.read.store.find(
      'seguimiento_alumnos',
      { inscripcionId: enrollment.id, visibilidad: 'alumno_y_tutor' },
      { order: { id: 'DESC' }, limit: 100 },
    );
    return {
      inscripcion: enrollment,
      curso: { id: course.id, titulo: course.titulo, estado: course.estado },
      totalLecciones: lessons.length,
      completadas: completed,
      porcentaje: lessons.length
        ? Math.round((completed * 100) / lessons.length)
        : 0,
      progreso: progress,
      seguimiento: notes,
    };
  }
  async updateProgress(
    actor: Actor,
    enrollmentId: unknown,
    lessonId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['posicionSegundos', 'completada']);
    const position = v.integer(body.posicionSegundos ?? 0, 'posicionSegundos');
    const complete = v.boolean(body.completada ?? false, 'completada');
    return this.db.transaction(async (tx) => {
      const enrollment = await this.owned(
        tx.store,
        'inscripciones_tutoria',
        enrollmentId,
        actor,
        'alumnoId',
      );
      await this.access(tx, actor, enrollment.tutoriaId, true);
      const lesson = await this.resource(
        tx.store,
        'lecciones_tutoria',
        lessonId,
      );
      ensure(
        lesson.tutoriaId === enrollment.tutoriaId && lesson.publicada,
        'Lección no disponible.',
      );
      if (lesson.tipo === 'video') {
        const file = await tx.store.one('archivos', {
          id: lesson.videoArchivoId,
        });
        ensure(
          file && readyFile(file) && Number(file.duracionSegundos) > 0,
          'Video no disponible.',
          409,
        );
        ensure(
          position <= Number(file.duracionSegundos),
          'La posición supera la duración del video.',
        );
        if (complete)
          ensure(
            position >= Math.floor(Number(file.duracionSegundos) * 0.9),
            'Avanza al menos al 90% antes de completar.',
          );
      } else
        ensure(
          position === 0,
          'Las lecciones de texto no tienen posición de video.',
        );
      const key = { inscripcionId: enrollment.id, leccionId: lesson.id };
      const existing = await tx.store.one('progreso_lecciones', key);
      const data = {
        tutoriaId: enrollment.tutoriaId,
        posicionSegundos: position,
        completadaEn: existing?.completadaEn ?? (complete ? new Date() : null),
        actualizadoEn: new Date(),
      };
      const result = existing
        ? (await tx.store.update('progreso_lecciones', key, data))[0]
        : await tx.store.insert('progreso_lecciones', { ...key, ...data });
      const curriculum = await tx.store.find(
        'lecciones_tutoria',
        { tutoriaId: enrollment.tutoriaId, publicada: true, archivadaEn: null },
        { fields: ['id'], limit: 2000 },
      );
      const finished = await tx.store.count('progreso_lecciones', {
        inscripcionId: enrollment.id,
        leccionId: { op: 'in', value: curriculum.map((entry) => entry.id) },
        completadaEn: { op: 'ne', value: null },
      });
      const course = await tx.store.one('tutorias', {
        id: enrollment.tutoriaId,
      });
      if (
        course?.modalidad === 'grabada' &&
        finished === curriculum.length &&
        curriculum.length
      )
        await tx.store.update(
          'inscripciones_tutoria',
          { id: enrollment.id },
          {
            estado: 'completada',
            completadaEn: enrollment.completadaEn ?? new Date(),
          },
        );
      await tx.store.update(
        'inscripciones_tutoria',
        { id: enrollment.id },
        { ultimoAccesoEn: new Date() },
      );
      return result;
    });
  }
  async students(actor: Actor, courseId: unknown, query: Row) {
    await this.owned(
      this.db.read.store,
      'tutorias',
      courseId,
      actor,
      'tutorId',
      false,
    );
    return this.db.read.queries.students(v.id(courseId), v.pagination(query));
  }
  async notes(
    actor: Actor,
    courseId: unknown,
    enrollmentId: unknown,
    query: Row,
  ) {
    const course = await this.owned(
      this.db.read.store,
      'tutorias',
      courseId,
      actor,
      'tutorId',
      false,
    );
    const enrollment = await this.resource(
      this.db.read.store,
      'inscripciones_tutoria',
      enrollmentId,
    );
    ensure(enrollment.tutoriaId === course.id, 'Alumno de otro curso.', 403);
    return this.page(
      this.db.read.store,
      'seguimiento_alumnos',
      { inscripcionId: enrollment.id, tutorId: actor.id },
      v.pagination(query),
    );
  }
  async addNote(
    actor: Actor,
    courseId: unknown,
    enrollmentId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['comentario', 'visibilidad']);
    return this.db.transaction(async (tx) => {
      const course = await this.owned(
        tx.store,
        'tutorias',
        courseId,
        actor,
        'tutorId',
      );
      const enrollment = await this.resource(
        tx.store,
        'inscripciones_tutoria',
        enrollmentId,
      );
      ensure(enrollment.tutoriaId === course.id, 'Alumno de otro curso.', 403);
      const visibility = v.choice(
        body.visibilidad ?? 'alumno_y_tutor',
        ['alumno_y_tutor', 'solo_tutor'],
        'visibilidad',
      );
      const note = await tx.store.insert('seguimiento_alumnos', {
        inscripcionId: enrollment.id,
        tutoriaId: course.id,
        tutorId: actor.id,
        comentario: v.text(body.comentario, 'comentario', 10000),
        visibilidad: visibility,
      });
      if (visibility === 'alumno_y_tutor')
        await this.notify(
          tx,
          enrollment.alumnoId,
          'seguimiento',
          'Tienes un nuevo comentario del tutor',
          { cursoId: course.id },
        );
      return note;
    });
  }
  async reviews(courseId: unknown, query: Row) {
    ensure(
      await this.db.read.queries.publicCourse(v.id(courseId)),
      'Curso no disponible.',
      404,
    );
    return this.page(
      this.db.read.store,
      'resenas_tutoria',
      { tutoriaId: v.id(courseId), estado: 'visible' },
      v.pagination(query),
      { creadoEn: 'DESC' },
    );
  }
  async review(
    actor: Actor,
    enrollmentId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['puntuacion', 'comentario']);
    return this.db.transaction(async (tx) => {
      const enrollment = await this.owned(
        tx.store,
        'inscripciones_tutoria',
        enrollmentId,
        actor,
        'alumnoId',
      );
      await this.access(tx, actor, enrollment.tutoriaId);
      const data = {
        tutoriaId: enrollment.tutoriaId,
        puntuacion: v.integer(body.puntuacion, 'puntuacion', 1, 5),
        comentario:
          body.comentario === undefined
            ? null
            : v.text(body.comentario, 'comentario', 5000, 0),
      };
      const existing = await tx.store.one(
        'resenas_tutoria',
        { inscripcionId: enrollment.id },
        { lock: true },
      );
      ensure(existing?.estado !== 'oculta', 'La reseña fue moderada.', 409);
      return existing
        ? (
            await tx.store.update(
              'resenas_tutoria',
              { inscripcionId: enrollment.id },
              data,
            )
          )[0]
        : tx.store.insert('resenas_tutoria', {
            ...data,
            inscripcionId: enrollment.id,
          });
    });
  }
  async questions(
    actor: Actor,
    courseId: unknown,
    lessonId: unknown,
    query: Row,
  ) {
    await this.access(this.db.read, actor, courseId);
    const lesson = await this.resource(
      this.db.read.store,
      'lecciones_tutoria',
      lessonId,
    );
    ensure(
      lesson.tutoriaId === v.id(courseId) && lesson.publicada,
      'Lección no disponible.',
    );
    return this.page(
      this.db.read.store,
      'preguntas_leccion',
      { leccionId: lesson.id, estado: { op: 'ne', value: 'oculta' } },
      v.pagination(query),
    );
  }
  async ask(
    actor: Actor,
    courseId: unknown,
    lessonId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['titulo', 'contenido']);
    return this.db.transaction(async (tx) => {
      const { course, enrollment } = await this.access(tx, actor, courseId);
      ensure(
        enrollment,
        'El tutor responde preguntas; no se crea una inscripción propia.',
      );
      const lesson = await this.resource(
        tx.store,
        'lecciones_tutoria',
        lessonId,
      );
      ensure(
        lesson.tutoriaId === course.id && lesson.publicada,
        'Lección no disponible.',
      );
      const question = await tx.store.insert('preguntas_leccion', {
        tutoriaId: course.id,
        leccionId: lesson.id,
        inscripcionId: enrollment.id,
        alumnoId: actor.id,
        titulo: v.text(body.titulo, 'titulo', 200),
        contenido: v.text(body.contenido, 'contenido', 10000),
      });
      await this.notify(
        tx,
        course.tutorId,
        'pregunta',
        'Nueva pregunta en tu curso',
        { cursoId: course.id, preguntaId: question.id },
      );
      return question;
    });
  }
  async replies(actor: Actor, questionId: unknown, query: Row) {
    const question = await this.resource(
      this.db.read.store,
      'preguntas_leccion',
      questionId,
    );
    await this.access(this.db.read, actor, question.tutoriaId);
    ensure(question.estado !== 'oculta', 'Pregunta no disponible.', 404);
    return this.page(
      this.db.read.store,
      'respuestas_pregunta',
      { preguntaId: question.id, ocultaEn: null },
      v.pagination(query),
      { id: 'ASC' },
    );
  }
  async reply(actor: Actor, questionId: unknown, input: unknown): Promise<Row> {
    const body = v.object(input, ['contenido']);
    return this.db.transaction(async (tx) => {
      const question = await this.resource(
        tx.store,
        'preguntas_leccion',
        questionId,
        true,
      );
      await this.access(tx, actor, question.tutoriaId);
      ensure(question.estado !== 'oculta', 'Pregunta no disponible.', 404);
      const answer = await tx.store.insert('respuestas_pregunta', {
        preguntaId: question.id,
        autorId: actor.id,
        contenido: v.text(body.contenido, 'contenido', 10000),
      });
      if (question.alumnoId !== actor.id)
        await this.notify(
          tx,
          question.alumnoId,
          'respuesta',
          'Respondieron tu pregunta',
          { preguntaId: question.id },
        );
      return answer;
    });
  }
  async resolveQuestion(
    actor: Actor,
    questionId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['estado']);
    const state = v.choice(
      body.estado,
      ['abierta', 'resuelta', 'oculta'],
      'estado',
    );
    return this.db.transaction(async (tx) => {
      const question = await this.resource(
        tx.store,
        'preguntas_leccion',
        questionId,
        true,
      );
      const { course } = await this.access(tx, actor, question.tutoriaId);
      ensure(
        course.tutorId === actor.id ||
          (question.alumnoId === actor.id && state !== 'oculta'),
        'No puedes moderar esta pregunta.',
        403,
      );
      return (
        await tx.store.update(
          'preguntas_leccion',
          { id: question.id },
          { estado: state },
        )
      )[0];
    });
  }
}

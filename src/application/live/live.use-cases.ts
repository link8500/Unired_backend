import { Actor, Database, Row } from '../../domain/common/contracts';
import { ensure } from '../../domain/common/errors';
import * as v from '../../domain/common/validation';
import { BaseUseCases } from '../shared/base.use-cases';
import { CoursesUseCases } from '../courses/courses.use-cases';
import { LearningUseCases } from '../learning/learning.use-cases';
import { InscripcionesTutoria } from '../../domain/common/models';

/** Reservar bloquea la sesión: dos alumnos no pueden ocupar el último cupo. */
export class LiveUseCases extends BaseUseCases {
  constructor(
    db: Database,
    private readonly courses: CoursesUseCases,
    private readonly learning: LearningUseCases,
  ) {
    super(db);
  }
  async list(actor: Actor | undefined, courseId: unknown, query: Row) {
    const course = await this.resource(
      this.db.read.store,
      'tutorias',
      courseId,
    );
    const owner = course.tutorId === actor?.id;
    ensure(
      owner || (await this.db.read.queries.publicCourse(course.id)),
      'Curso no disponible.',
      404,
    );
    const result = await this.page(
      this.db.read.store,
      'sesiones_tutoria',
      { tutoriaId: course.id },
      v.pagination(query),
      { inicioEn: 'ASC' },
    );
    let enrollment: InscripcionesTutoria | undefined;
    if (actor && !owner)
      enrollment = await this.db.read.store.one('inscripciones_tutoria', {
        tutoriaId: course.id,
        alumnoId: actor.id,
        estado: { op: 'in', value: ['activa', 'completada'] },
      });
    const items = await Promise.all(
      result.items.map(async (session) => {
        const booking =
          enrollment &&
          (await this.db.read.store.one('reservas_sesion', {
            sesionId: session.id,
            inscripcionId: enrollment.id,
            estado: { op: 'in', value: ['confirmada', 'asistio'] },
          }));
        const reserved = await this.db.read.store.count('reservas_sesion', {
          sesionId: session.id,
          estado: { op: 'in', value: ['confirmada', 'asistio'] },
        });
        const { enlaceReunion, ...publicSession } = session;
        return {
          ...publicSession,
          cuposDisponibles: Math.max(0, session.capacidad - reserved),
          ...(owner || (booking && session.estado !== 'cancelada')
            ? { enlaceReunion }
            : {}),
        };
      }),
    );
    return { ...result, items };
  }
  async save(
    actor: Actor,
    courseId: unknown,
    input: unknown,
    sessionId?: unknown,
  ): Promise<Row> {
    const body = v.object(input, [
      'titulo',
      'inicioEn',
      'finEn',
      'capacidad',
      'enlaceReunion',
    ]);
    const start = v.date(body.inicioEn, 'inicioEn');
    const end = v.date(body.finEn, 'finEn');
    ensure(
      start > new Date() &&
        end > start &&
        end.getTime() - start.getTime() <= 24 * 3600000,
      'Horario inválido o duración mayor de 24 horas.',
    );
    let link: string | null = null;
    if (body.enlaceReunion !== undefined && body.enlaceReunion !== null) {
      link = v.text(body.enlaceReunion, 'enlaceReunion', 2048);
      let url: URL | undefined;
      try {
        url = new URL(link);
      } catch {
        // La validación siguiente convierte una URL inválida en una respuesta 400.
      }
      ensure(
        url && url.protocol === 'https:' && !url.username && !url.password,
        'El enlace de reunión debe usar HTTPS sin credenciales.',
      );
    }
    const data = {
      titulo: v.text(body.titulo, 'titulo', 200),
      inicioEn: start,
      finEn: end,
      capacidad: v.integer(body.capacidad, 'capacidad', 1, 1000),
      enlaceReunion: link,
    };
    return this.db.transaction(async (tx) => {
      const course = await this.courses.owner(tx.store, actor, courseId);
      ensure(
        course.modalidad !== 'grabada',
        'Usa modalidad en vivo o mixta para programar sesiones.',
      );
      if (!sessionId)
        return tx.store.insert('sesiones_tutoria', {
          ...data,
          tutoriaId: course.id,
        });
      const session = await this.resource(
        tx.store,
        'sesiones_tutoria',
        sessionId,
        true,
      );
      ensure(
        session.tutoriaId === course.id &&
          session.estado === 'programada' &&
          new Date(session.inicioEn) > new Date(),
        'Sesión no editable.',
        409,
      );
      const reserved = await tx.store.count('reservas_sesion', {
        sesionId: session.id,
        estado: { op: 'in', value: ['confirmada', 'asistio'] },
      });
      ensure(
        data.capacidad >= reserved,
        'La capacidad no puede ser menor que las reservas confirmadas.',
      );
      return (
        await tx.store.update('sesiones_tutoria', { id: session.id }, data)
      )[0];
    });
  }
  async changeState(
    actor: Actor,
    courseId: unknown,
    sessionId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['estado', 'motivo']);
    const state = v.choice(body.estado, ['cancelada', 'finalizada'], 'estado');
    const reason = v.text(body.motivo, 'motivo', 2000);
    return this.db.transaction(async (tx) => {
      const course = await this.courses.owner(tx.store, actor, courseId);
      const session = await this.resource(
        tx.store,
        'sesiones_tutoria',
        sessionId,
        true,
      );
      ensure(
        session.tutoriaId === course.id && session.estado === 'programada',
        'Sesión no disponible.',
        409,
      );
      if (state === 'finalizada')
        ensure(
          new Date(session.finEn) <= new Date(),
          'La sesión todavía no ha terminado.',
        );
      const bookings = await tx.store.find(
        'reservas_sesion',
        { sesionId: session.id, estado: 'confirmada' },
        { limit: 1000 },
      );
      const [result] = await tx.store.update(
        'sesiones_tutoria',
        { id: session.id },
        { estado: state },
      );
      if (state === 'cancelada') {
        await tx.store.update(
          'reservas_sesion',
          { sesionId: session.id, estado: 'confirmada' },
          { estado: 'cancelada' },
        );
        for (const booking of bookings) {
          const enrollment = await tx.store.one('inscripciones_tutoria', {
            id: booking.inscripcionId,
          });
          if (enrollment)
            await this.notify(
              tx,
              enrollment.alumnoId,
              'sesion',
              'Una sesión fue cancelada',
              { sesionId: session.id, motivo: reason },
            );
        }
        if (
          course.estado === 'publicada' &&
          !(await tx.store.count('sesiones_tutoria', {
            tutoriaId: course.id,
            estado: 'programada',
            inicioEn: { op: 'gt', value: new Date() },
          }))
        )
          await tx.store.update(
            'tutorias',
            { id: course.id },
            { estado: 'pausada', versionLock: course.versionLock + 1 },
          );
      }
      await this.audit(tx, actor, 'sesion.' + state, 'sesion', session.id, {
        motivo: reason,
      });
      return result;
    });
  }
  async reserve(
    actor: Actor,
    courseId: unknown,
    sessionId: unknown,
  ): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const { course, enrollment } = await this.learning.access(
        tx,
        actor,
        courseId,
        true,
      );
      ensure(enrollment, 'El tutor no reserva un cupo en su propia sesión.');
      const session = await this.resource(
        tx.store,
        'sesiones_tutoria',
        sessionId,
        true,
      );
      ensure(
        session.tutoriaId === course.id &&
          session.estado === 'programada' &&
          new Date(session.inicioEn) > new Date(),
        'Sesión no disponible.',
        409,
      );
      const key = { sesionId: session.id, inscripcionId: enrollment.id };
      const existing = await tx.store.one('reservas_sesion', key);
      if (existing?.estado === 'confirmada') return existing;
      const reserved = await tx.store.count('reservas_sesion', {
        sesionId: session.id,
        estado: { op: 'in', value: ['confirmada', 'asistio'] },
      });
      ensure(
        reserved < session.capacidad,
        'No quedan cupos disponibles.',
        409,
        'CAPACITY_FULL',
      );
      const data = { tutoriaId: course.id, estado: 'confirmada' };
      const booking = existing
        ? (await tx.store.update('reservas_sesion', key, data))[0]
        : await tx.store.insert('reservas_sesion', { ...key, ...data });
      await this.audit(tx, actor, 'reserva.confirmada', 'sesion', session.id);
      return booking;
    });
  }
  async cancelReservation(actor: Actor, sessionId: unknown): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const session = await this.resource(
        tx.store,
        'sesiones_tutoria',
        sessionId,
        true,
      );
      const enrollment = await tx.store.one('inscripciones_tutoria', {
        tutoriaId: session.tutoriaId,
        alumnoId: actor.id,
      });
      ensure(enrollment, 'Reserva no encontrada.', 404);
      const booking = await tx.store.one('reservas_sesion', {
        sesionId: session.id,
        inscripcionId: enrollment.id,
      });
      ensure(
        booking &&
          booking.estado === 'confirmada' &&
          new Date(session.inicioEn) > new Date(),
        'Esta reserva no se puede cancelar.',
        409,
      );
      const [result] = await tx.store.update(
        'reservas_sesion',
        { sesionId: session.id, inscripcionId: enrollment.id },
        { estado: 'cancelada' },
      );
      await this.audit(tx, actor, 'reserva.cancelada', 'sesion', session.id);
      return result;
    });
  }
  async bookings(
    actor: Actor,
    courseId: unknown,
    sessionId: unknown,
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
    const session = await this.resource(
      this.db.read.store,
      'sesiones_tutoria',
      sessionId,
    );
    ensure(session.tutoriaId === course.id, 'Sesión de otro curso.', 403);
    return this.page(
      this.db.read.store,
      'reservas_sesion',
      { sesionId: session.id },
      v.pagination(query),
      { creadoEn: 'ASC' },
    );
  }
  async attendance(
    actor: Actor,
    courseId: unknown,
    sessionId: unknown,
    enrollmentId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['estado']);
    const state = v.choice(body.estado, ['asistio', 'no_asistio'], 'estado');
    return this.db.transaction(async (tx) => {
      const course = await this.owned(
        tx.store,
        'tutorias',
        courseId,
        actor,
        'tutorId',
      );
      const session = await this.resource(
        tx.store,
        'sesiones_tutoria',
        sessionId,
        true,
      );
      ensure(
        session.tutoriaId === course.id &&
          session.estado !== 'cancelada' &&
          new Date(session.inicioEn) <= new Date(),
        'La sesión no ha comenzado o fue cancelada.',
      );
      const key = { sesionId: session.id, inscripcionId: v.id(enrollmentId) };
      const booking = await tx.store.one('reservas_sesion', key);
      ensure(
        booking &&
          booking.tutoriaId === course.id &&
          booking.estado !== 'cancelada',
        'Reserva no encontrada.',
        404,
      );
      const [result] = await tx.store.update('reservas_sesion', key, {
        estado: state,
      });
      await this.audit(tx, actor, 'asistencia.' + state, 'sesion', session.id, {
        inscripcionId: key.inscripcionId,
      });
      return result;
    });
  }
}

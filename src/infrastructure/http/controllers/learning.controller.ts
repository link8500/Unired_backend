import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LearningUseCases } from '../../../application/learning/learning.use-cases';
import { LiveUseCases } from '../../../application/live/live.use-cases';
import { Actor, Row } from '../../../domain/common/contracts';
import {
  BodyFields,
  CurrentActor,
  OptionalAuth,
  Paged,
  Public,
} from '../common/api.decorators';

@ApiTags('Aprendizaje y seguimiento')
@ApiBearerAuth()
@Controller()
export class LearningController {
  constructor(private readonly learning: LearningUseCases) {}
  @OptionalAuth()
  @Get('courses/:id/lessons/:lessonId')
  @ApiOperation({
    summary: 'Contenido de lección: vista previa o inscripción válida',
  })
  lesson(
    @CurrentActor() actor: Actor | undefined,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.learning.lesson(actor, id, lessonId);
  }
  @Post('courses/:id/enrollments')
  @ApiOperation({
    summary:
      'Inscribirme: gratis activo; importe mayor que cero solicita alta manual',
  })
  enroll(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.learning.enroll(actor, id);
  }
  @Get('me/enrollments')
  @Paged()
  @ApiOperation({ summary: 'Mis inscripciones y estados' })
  mine(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.learning.enrollments(actor, query);
  }
  @Get('me/enrollments/:id')
  @ApiOperation({
    summary: 'Mi progreso y comentarios compartidos; sin notas privadas',
  })
  progress(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.learning.progress(actor, id);
  }
  @Delete('me/enrollments/:id')
  @ApiOperation({ summary: 'Cancelar mi inscripción conservando progreso' })
  cancel(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.learning.cancelEnrollment(actor, id);
  }
  @Put('me/enrollments/:id/progress/:lessonId')
  @BodyFields(
    'Guardar progreso de una lección del mismo curso',
    ['posicionSegundos', 'completada'],
    [],
  )
  updateProgress(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body() body: unknown,
  ) {
    return this.learning.updateProgress(actor, id, lessonId, body);
  }
  @Public()
  @Get('courses/:id/reviews')
  @Paged()
  @ApiOperation({ summary: 'Reseñas visibles de un curso publicado' })
  reviews(@Param('id') id: string, @Query() query: Row) {
    return this.learning.reviews(id, query);
  }
  @Put('me/enrollments/:id/review')
  @BodyFields(
    'Crear o modificar mi única reseña de un curso al que tengo acceso',
    ['puntuacion', 'comentario'],
    ['puntuacion'],
  )
  review(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.learning.review(actor, id, body);
  }
  @Get('me/courses/:id/students')
  @Paged()
  @ApiOperation({ summary: 'Alumnos únicamente de mis cursos' })
  students(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Query() query: Row,
  ) {
    return this.learning.students(actor, id, query);
  }
  @Patch('me/courses/:id/enrollments/:enrollmentId')
  @BodyFields('Tutor: activar, revocar o completar una inscripción', [
    'estado',
    'motivo',
  ])
  decide(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('enrollmentId') enrollmentId: string,
    @Body() body: unknown,
  ) {
    return this.learning.decideEnrollment(actor, id, enrollmentId, body);
  }
  @Get('me/courses/:id/students/:enrollmentId/notes')
  @Paged()
  @ApiOperation({ summary: 'Mis notas privadas y compartidas sobre el alumno' })
  notes(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('enrollmentId') enrollmentId: string,
    @Query() query: Row,
  ) {
    return this.learning.notes(actor, id, enrollmentId, query);
  }
  @Post('me/courses/:id/students/:enrollmentId/notes')
  @BodyFields(
    'Añadir seguimiento privado o compartido',
    ['comentario', 'visibilidad'],
    ['comentario'],
  )
  note(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('enrollmentId') enrollmentId: string,
    @Body() body: unknown,
  ) {
    return this.learning.addNote(actor, id, enrollmentId, body);
  }
  @Get('courses/:id/lessons/:lessonId/questions')
  @Paged()
  @ApiOperation({ summary: 'Preguntas de una lección con acceso autorizado' })
  questions(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Query() query: Row,
  ) {
    return this.learning.questions(actor, id, lessonId, query);
  }
  @Post('courses/:id/lessons/:lessonId/questions')
  @BodyFields('Alumno: hacer una pregunta de la lección', [
    'titulo',
    'contenido',
  ])
  ask(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body() body: unknown,
  ) {
    return this.learning.ask(actor, id, lessonId, body);
  }
  @Get('questions/:id/replies')
  @Paged()
  @ApiOperation({ summary: 'Respuestas dentro del curso autorizado' })
  replies(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Query() query: Row,
  ) {
    return this.learning.replies(actor, id, query);
  }
  @Post('questions/:id/replies')
  @BodyFields('Responder una pregunta del curso', ['contenido'])
  reply(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.learning.reply(actor, id, body);
  }
  @Patch('questions/:id')
  @BodyFields('Resolver pregunta; ocultar solo como tutor propietario', [
    'estado',
  ])
  resolve(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.learning.resolveQuestion(actor, id, body);
  }
}
const sessionFields = [
  'titulo',
  'inicioEn',
  'finEn',
  'capacidad',
  'enlaceReunion',
];
@ApiTags('Clases en vivo')
@ApiBearerAuth()
@Controller()
export class LiveController {
  constructor(private readonly live: LiveUseCases) {}
  @OptionalAuth()
  @Get('courses/:id/sessions')
  @Paged()
  @ApiOperation({
    summary: 'Agenda; enlaces solo para tutor o alumno con reserva',
  })
  list(
    @CurrentActor() actor: Actor | undefined,
    @Param('id') id: string,
    @Query() query: Row,
  ) {
    return this.live.list(actor, id, query);
  }
  @Post('me/courses/:id/sessions')
  @BodyFields('Programar una clase futura', sessionFields, [
    'titulo',
    'inicioEn',
    'finEn',
    'capacidad',
  ])
  create(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.live.save(actor, id, body);
  }
  @Put('me/courses/:id/sessions/:sessionId')
  @BodyFields('Editar horario y aforo sin perder reservas', sessionFields, [
    'titulo',
    'inicioEn',
    'finEn',
    'capacidad',
  ])
  edit(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ) {
    return this.live.save(actor, id, body, sessionId);
  }
  @Patch('me/courses/:id/sessions/:sessionId/state')
  @BodyFields('Cancelar o finalizar sesión con motivo', ['estado', 'motivo'])
  state(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ) {
    return this.live.changeState(actor, id, sessionId, body);
  }
  @Post('courses/:id/sessions/:sessionId/reservations')
  @ApiOperation({ summary: 'Reservar cupo con control transaccional de aforo' })
  reserve(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.live.reserve(actor, id, sessionId);
  }
  @Delete('me/reservations/:id')
  @ApiOperation({ summary: 'Cancelar mi reserva antes del inicio' })
  cancel(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.live.cancelReservation(actor, id);
  }
  @Get('me/courses/:id/sessions/:sessionId/reservations')
  @Paged()
  @ApiOperation({ summary: 'Tutor: reservas de su propia sesión' })
  bookings(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Query() query: Row,
  ) {
    return this.live.bookings(actor, id, sessionId, query);
  }
  @Patch('me/courses/:id/sessions/:sessionId/reservations/:enrollmentId')
  @BodyFields('Tutor: registrar asistencia cuando comenzó la sesión', [
    'estado',
  ])
  attendance(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Param('enrollmentId') enrollmentId: string,
    @Body() body: unknown,
  ) {
    return this.live.attendance(actor, id, sessionId, enrollmentId, body);
  }
}

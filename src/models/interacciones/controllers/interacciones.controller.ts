// Archivo: src/models/interacciones/controllers/interacciones.controller.ts
// Expone ofertas, solicitudes de tutoría y reseñas entre participantes.
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor, Registro } from '../../../core/dominio/comun/contratos';
import {
  BodyFields,
  CurrentActor,
  Paged,
} from '../../../shared/http/comun/decoradores-api';
import { InteraccionesUseCases } from '../aplicacion/interacciones.use-cases';
@ApiTags('Ofertas y solicitudes de tutoría')
@ApiBearerAuth()
@Controller()
export class InteraccionesController {
  constructor(private readonly interactions: InteraccionesUseCases) {}
  @Post('listings/:id/offers')
  @BodyFields(
    'Enviar una oferta; el chat permanece cerrado hasta su aceptación',
    ['clienteId', 'importe', 'mensaje', 'tipo'],
  )
  offer(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.interactions.offer(actor, id, body);
  }
  @Get('me/offers')
  @Paged()
  offers(@CurrentActor() actor: Actor, @Query() q: Registro) {
    return this.interactions.offers(actor, q);
  }
  @Patch('me/offers/:id')
  @BodyFields('Responder, cancelar o finalizar una negociación', ['estado'])
  decide(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.interactions.decideOffer(actor, id, body);
  }
  @Get('me/tutoring-requests')
  @Paged()
  requests(@CurrentActor() actor: Actor, @Query() q: Registro) {
    return this.interactions.requests(actor, q);
  }
  @Post('me/tutoring-requests')
  @BodyFields(
    'Publicar una necesidad de tutoría con precio calculado por el servidor',
    [
      'areaId',
      'materia',
      'tema',
      'descripcion',
      'modalidad',
      'duracionMinutos',
      'precioConfirmado',
    ],
  )
  request(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.interactions.request(actor, body);
  }
  @Post('me/tutoring-requests/:id/accept')
  accept(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.interactions.accept(actor, id);
  }
  @Post('me/tutoring-requests/:id/ignore')
  ignore(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.interactions.ignore(actor, id);
  }
  @Patch('me/tutoring-requests/:id')
  @BodyFields('Cancelar o finalizar una tutoría como estudiante o tutor', [
    'estado',
  ])
  close(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.interactions.closeRequest(actor, id, body);
  }
  @Post('me/tutoring-requests/:id/material')
  @BodyFields(
    'El tutor asignado comparte un curso propio y concede acceso al material',
    ['cursoId'],
  )
  material(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.interactions.material(actor, id, body);
  }
  @Post('me/offers/:id/review')
  @BodyFields('Valorar al otro participante después de finalizar', [
    'puntuacion',
    'comentario',
  ])
  reviewOffer(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.interactions.review(actor, 'oferta', id, body);
  }
  @Post('me/tutoring-requests/:id/review')
  @BodyFields('Valorar al estudiante o al tutor después de finalizar', [
    'puntuacion',
    'comentario',
  ])
  reviewRequest(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.interactions.review(actor, 'solicitud', id, body);
  }
  @Post('me/enrollments/:id/peer-review')
  @BodyFields('Valorar al participante de un curso ya completado', [
    'puntuacion',
    'comentario',
  ])
  reviewEnrollment(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.interactions.review(actor, 'inscripcion', id, body);
  }
}

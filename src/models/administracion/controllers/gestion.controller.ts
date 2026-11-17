// Archivo: src/models/administracion/controllers/gestion.controller.ts
// Controlador HTTP de administracion; recibe la solicitud y delega en los casos de uso.

import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GestionUseCases } from '../aplicacion/gestion.use-cases';
import { Actor, Registro } from '../../../core/dominio/comun/contratos';
import {
  BodyFields,
  CurrentActor,
  Paged,
} from '../../../shared/http/comun/decoradores-api';

@ApiTags('Espacios de gestión')
@ApiBearerAuth()
@Controller('admin/workspace')
export class GestionController {
  constructor(private readonly workspace: GestionUseCases) {}
  @Get('courses/:id')
  @ApiOperation({
    summary:
      'Inspección estructural de curso sin lecciones privadas, notas ni enlaces de reunión',
  })
  course(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.workspace.course(actor, id);
  }
  @Get(':section')
  @Paged()
  @ApiOperation({
    summary:
      'Submódulos: applications, tutors, sessions, participation, reviews y market-updates; q, estado',
  })
  list(
    @CurrentActor() actor: Actor,
    @Param('section') section: string,
    @Query() query: Registro,
  ) {
    return this.workspace.list(actor, section, query);
  }
  @Patch('reviews/:id/state')
  @BodyFields('Ocultar o restaurar una reseña con justificación', [
    'estado',
    'motivo',
  ])
  review(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.workspace.visibility(actor, 'review', id, body);
  }
  @Patch('market-updates/:id/state')
  @BodyFields('Ocultar o restaurar una actualización con justificación', [
    'estado',
    'motivo',
  ])
  update(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.workspace.visibility(actor, 'update', id, body);
  }
  @Patch('peer-reviews/:id/state')
  @BodyFields(
    'Moderar una valoración entre participantes con motivo y auditoría',
    ['estado', 'motivo'],
  )
  peerReview(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.workspace.visibility(actor, 'peer-review', id, body);
  }
}

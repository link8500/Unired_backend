import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkspaceUseCases } from '../../../application/administration/workspace.use-cases';
import { Actor, Row } from '../../../domain/common/contracts';
import { BodyFields, CurrentActor, Paged } from '../common/api.decorators';

@ApiTags('Espacios de gestión')
@ApiBearerAuth()
@Controller('admin/workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceUseCases) {}
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
    @Query() query: Row,
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
}

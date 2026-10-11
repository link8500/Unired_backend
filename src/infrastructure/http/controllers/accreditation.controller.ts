import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccreditationUseCases } from '../../../application/accreditation/accreditation.use-cases';
import { Actor, Row } from '../../../domain/common/contracts';
import {
  BodyFields,
  CurrentActor,
  Paged,
  Public,
} from '../common/api.decorators';

@ApiTags('Acreditación de tutores')
@ApiBearerAuth()
@Controller()
export class AccreditationController {
  constructor(private readonly accreditation: AccreditationUseCases) {}
  @Public()
  @Get('areas')
  @ApiOperation({ summary: 'Áreas activas y requisitos documentales' })
  areas() {
    return this.accreditation.areas();
  }
  @Get('me/tutor-applications')
  @Paged()
  @ApiOperation({ summary: 'Mis expedientes de tutor' })
  mine(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.accreditation.mine(actor, query);
  }
  @Post('me/tutor-applications')
  @BodyFields('Crear expediente de un área', ['areaId'])
  create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.accreditation.create(actor, body);
  }
  @Get('me/tutor-applications/:id')
  @ApiOperation({ summary: 'Mi expediente, documentos, envíos y decisiones' })
  own(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.accreditation.details(actor, id);
  }
  @Post('me/tutor-applications/:id/documents')
  @BodyFields(
    'Añadir una nueva versión de evidencia propia',
    ['archivoId', 'tipo', 'descripcion', 'grupoDocumento', 'versionLock'],
    ['archivoId', 'tipo', 'versionLock'],
  )
  document(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.accreditation.addDocument(actor, id, body);
  }
  @Post('me/tutor-applications/:id/submit')
  @BodyFields('Enviar una instantánea inmutable de documentos', ['versionLock'])
  submit(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.accreditation.submit(actor, id, body);
  }
  @Post('me/tutor-applications/:id/withdraw')
  @BodyFields('Retirar mi expediente cuando su estado lo permita', [
    'versionLock',
  ])
  withdraw(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.accreditation.withdraw(actor, id, body);
  }
  @Get('me/tutor-grants')
  @ApiOperation({ summary: 'Mis habilitaciones por área' })
  grants(@CurrentActor() actor: Actor) {
    return this.accreditation.grants(actor);
  }
  @Get('admin/tutor-applications')
  @Paged()
  @ApiOperation({ summary: 'Cola de acreditaciones (revisor o administrador)' })
  queue(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.accreditation.queue(actor, query);
  }
  @Post('admin/tutor-applications/:id/claim')
  @BodyFields('Asumir una revisión ajena', ['versionLock'])
  claim(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.accreditation.claim(actor, id, body);
  }
  @Get('admin/tutor-applications/:id')
  @ApiOperation({
    summary: 'Consultar expediente asignado; acceso administrativo controlado',
  })
  review(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.accreditation.details(actor, id, true);
  }
  @Post('admin/tutor-applications/:id/decision')
  @BodyFields(
    'Aprobar, rechazar o solicitar correcciones al último envío',
    ['versionLock', 'envioId', 'decision', 'motivo', 'validaHasta'],
    ['versionLock', 'envioId', 'decision', 'motivo'],
  )
  decision(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.accreditation.decide(actor, id, body);
  }
  @Patch('admin/tutor-grants/:id')
  @BodyFields('Suspender o revocar una habilitación con auditoría', [
    'estado',
    'motivo',
  ])
  grant(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.accreditation.changeGrant(actor, id, body);
  }
}

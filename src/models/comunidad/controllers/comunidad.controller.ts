// Archivo: src/models/comunidad/controllers/comunidad.controller.ts
// Controlador HTTP de comunidad; recibe la solicitud y delega en los casos de uso.

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
import { ComunidadUseCases } from '../aplicacion/comunidad.use-cases';
import { Actor, Registro } from '../../../core/dominio/comun/contratos';
import {
  BodyFields,
  CurrentActor,
  Paged,
  Public,
} from '../../../shared/http/comun/decoradores-api';

@ApiTags('Perfiles, notificaciones y denuncias')
@ApiBearerAuth()
@Controller()
export class ComunidadController {
  constructor(private readonly community: ComunidadUseCases) {}
  @Public()
  @Get('search')
  @Paged()
  @ApiOperation({
    summary:
      'Búsqueda global: q, universidad, carrera, anioEstudio y materia; accesible a visitantes',
  })
  search(@Query() query: Registro) {
    return this.community.search(query);
  }
  @Public()
  @Get('profiles/:id')
  @ApiOperation({ summary: 'Perfil público sin email ni teléfono privado' })
  profile(@Param('id') id: string) {
    return this.community.profile(id);
  }
  @Public()
  @Get('profiles/:id/reviews')
  @Paged()
  @ApiOperation({
    summary:
      'Valoraciones públicas de interacciones finalizadas, sin datos de contacto ni conversaciones',
  })
  reviews(@Param('id') id: string, @Query() query: Registro) {
    return this.community.reviews(id, query);
  }
  @Get('me/notifications')
  @Paged()
  @ApiOperation({
    summary: 'Mis notificaciones; sinLeer=true filtra las pendientes',
  })
  notices(@CurrentActor() actor: Actor, @Query() query: Registro) {
    return this.community.notifications(actor, query);
  }
  @Patch('me/notifications/read-all')
  @ApiOperation({ summary: 'Marcar todas mis notificaciones como leídas' })
  readAll(@CurrentActor() actor: Actor) {
    return this.community.readNotification(actor);
  }
  @Patch('me/notifications/:id/read')
  @ApiOperation({ summary: 'Marcar una notificación propia como leída' })
  read(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.community.readNotification(actor, id);
  }
  @Post('reports')
  @BodyFields(
    'Denunciar anuncio, curso, mensaje accesible o usuario',
    ['tipo', 'recursoId', 'motivo', 'detalle'],
    ['tipo', 'recursoId', 'motivo'],
  )
  report(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.community.report(actor, body);
  }
  @Get('me/reports')
  @Paged()
  @ApiOperation({ summary: 'Mis denuncias y su resolución' })
  reports(@CurrentActor() actor: Actor, @Query() query: Registro) {
    return this.community.myReports(actor, query);
  }
}

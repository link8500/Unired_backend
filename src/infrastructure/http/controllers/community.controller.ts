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
import { CommunityUseCases } from '../../../application/community/community.use-cases';
import { Actor, Row } from '../../../domain/common/contracts';
import {
  BodyFields,
  CurrentActor,
  Paged,
  Public,
} from '../common/api.decorators';

@ApiTags('Perfiles, notificaciones y denuncias')
@ApiBearerAuth()
@Controller()
export class CommunityController {
  constructor(private readonly community: CommunityUseCases) {}
  @Public()
  @Get('profiles/:id')
  @ApiOperation({ summary: 'Perfil público sin email ni teléfono privado' })
  profile(@Param('id') id: string) {
    return this.community.profile(id);
  }
  @Get('me/notifications')
  @Paged()
  @ApiOperation({
    summary: 'Mis notificaciones; sinLeer=true filtra las pendientes',
  })
  notices(@CurrentActor() actor: Actor, @Query() query: Row) {
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
  reports(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.community.myReports(actor, query);
  }
}

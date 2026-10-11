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
import { MessagingUseCases } from '../../../application/messaging/messaging.use-cases';
import { IdentityUseCases } from '../../../application/identity/identity.use-cases';
import { Actor, Row } from '../../../domain/common/contracts';
import { BodyFields, CurrentActor, Paged } from '../common/api.decorators';

@ApiTags('Conversaciones privadas')
@ApiBearerAuth()
@Controller()
export class MessagingController {
  constructor(
    private readonly chat: MessagingUseCases,
    private readonly identity: IdentityUseCases,
  ) {}
  @Post('listings/:id/conversations')
  @ApiOperation({
    summary: 'Contactar al vendedor; el destinatario se obtiene del anuncio',
  })
  market(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.chat.open(actor, 'market', id);
  }
  @Post('courses/:id/conversations')
  @ApiOperation({ summary: 'Alumno inscrito: conversar con el tutor' })
  course(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.chat.open(actor, 'tutoria', id);
  }
  @Get('me/conversations')
  @Paged()
  @ApiOperation({ summary: 'Mis conversaciones no archivadas' })
  list(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.chat.list(actor, query);
  }
  @Get('conversations/:id/messages')
  @Paged()
  @ApiOperation({
    summary:
      'Historial autorizado; afterId permite sincronizar nuevos mensajes',
  })
  messages(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Query() query: Row,
  ) {
    return this.chat.messages(actor, id, query);
  }
  @Post('conversations/:id/messages')
  @BodyFields(
    'Enviar mensaje o adjunto propio; clienteId evita duplicados',
    ['clienteId', 'contenido', 'archivoId'],
    ['clienteId'],
  )
  send(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.chat.send(actor, id, body);
  }
  @Put('conversations/:id/read')
  @BodyFields('Avanzar mi cursor de lectura sin retroceder', [
    'ultimoMensajeId',
  ])
  read(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.chat.read(actor, id, body);
  }
  @Delete('conversations/:id/messages/:messageId')
  @ApiOperation({
    summary: 'Ocultar mi mensaje sin devolver contenido eliminado',
  })
  remove(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chat.removeMessage(actor, id, messageId);
  }
  @Patch('me/conversations/:id')
  @BodyFields(
    'Archivar o silenciar solo para mí',
    ['archivada', 'silenciada'],
    [],
  )
  archive(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.chat.archive(actor, id, body);
  }
  @Get('me/blocks')
  @Paged()
  @ApiOperation({ summary: 'Usuarios que bloqueé' })
  blocks(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.chat.blocks(actor, query);
  }
  @Put('me/blocks/:id')
  @ApiOperation({
    summary: 'Bloquear nuevos contactos y mensajes de este usuario',
  })
  block(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.chat.block(actor, id, true);
  }
  @Delete('me/blocks/:id')
  @ApiOperation({ summary: 'Retirar mi bloqueo' })
  unblock(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.chat.block(actor, id, false);
  }
}

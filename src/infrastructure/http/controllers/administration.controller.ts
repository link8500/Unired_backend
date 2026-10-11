import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdministrationUseCases } from '../../../application/administration/administration.use-cases';
import { Actor, Row } from '../../../domain/common/contracts';
import { BodyFields, CurrentActor, Paged } from '../common/api.decorators';

@ApiTags('Administración y moderación')
@ApiBearerAuth()
@Controller('admin')
export class AdministrationController {
  constructor(private readonly admin: AdministrationUseCases) {}
  @Get('analytics')
  @ApiOperation({
    summary:
      'Series UTC y cursos más demandados; days=1..90, sin ingresos ficticios',
  })
  analytics(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.admin.analytics(actor, query);
  }
  @Get('dashboard')
  @ApiOperation({
    summary: 'Conteos reales; no inventa cobros o ventas verificadas',
  })
  dashboard(@CurrentActor() actor: Actor) {
    return this.admin.dashboard(actor);
  }
  @Get('users')
  @Paged()
  @ApiOperation({ summary: 'Directorio administrativo: q y estado' })
  users(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.admin.users(actor, query);
  }
  @Get('users/:id')
  @ApiOperation({ summary: 'Datos del usuario sin credenciales ni tokens' })
  user(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.admin.user(actor, id);
  }
  @Patch('users/:id/state')
  @BodyFields('Activar cuenta verificada, suspender o desactivar con motivo', [
    'estado',
    'motivo',
  ])
  state(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.userState(actor, id, body);
  }
  @Put('users/:id/roles')
  @BodyFields('Asignar roles; protege al último administrador activo', [
    'roles',
    'motivo',
  ])
  roles(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.userRoles(actor, id, body);
  }
  @Get('areas')
  @ApiOperation({ summary: 'Catálogo completo de áreas, incluidas inactivas' })
  areas(@CurrentActor() actor: Actor) {
    return this.admin.catalogsList(actor, 'areas_tutoria');
  }
  @Post('areas')
  @BodyFields(
    'Crear área y sus requisitos de acreditación',
    ['codigo', 'nombre', 'activo', 'requisitosDocumentales'],
    ['codigo', 'nombre'],
  )
  area(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.admin.catalogs(actor, 'areas_tutoria', body);
  }
  @Put('areas/:id')
  @BodyFields(
    'Editar área y requisitos',
    ['codigo', 'nombre', 'activo', 'requisitosDocumentales'],
    ['codigo', 'nombre'],
  )
  editArea(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.catalogs(actor, 'areas_tutoria', body, id);
  }
  @Get('categories')
  @ApiOperation({ summary: 'Catálogo completo de categorías' })
  categories(@CurrentActor() actor: Actor) {
    return this.admin.catalogsList(actor, 'categorias_market');
  }
  @Post('categories')
  @BodyFields(
    'Crear categoría del marketplace',
    ['codigo', 'nombre', 'activo'],
    ['codigo', 'nombre'],
  )
  category(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.admin.catalogs(actor, 'categorias_market', body);
  }
  @Put('categories/:id')
  @BodyFields(
    'Editar categoría del marketplace',
    ['codigo', 'nombre', 'activo'],
    ['codigo', 'nombre'],
  )
  editCategory(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.catalogs(actor, 'categorias_market', body, id);
  }
  @Get('courses')
  @Paged()
  @ApiOperation({
    summary: 'Supervisar cursos sin acceso global a progreso o chats',
  })
  courses(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.admin.publications(actor, 'tutorias', query);
  }
  @Post('courses/:id/block')
  @BodyFields('Bloquear un curso con motivo y notificación', ['motivo'])
  blockCourse(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.moderate(actor, 'tutorias', id, body);
  }
  @Post('courses/:id/restore')
  @BodyFields(
    'Retirar bloqueo; deja el curso pausado para validar su republicación',
    ['motivo'],
  )
  restoreCourse(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.moderate(actor, 'tutorias', id, body, true);
  }
  @Get('listings')
  @Paged()
  @ApiOperation({ summary: 'Supervisar anuncios de usuarios' })
  listings(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.admin.publications(actor, 'anuncios_market', query);
  }
  @Post('listings/:id/block')
  @BodyFields('Bloquear anuncio con motivo y notificación', ['motivo'])
  blockListing(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.moderate(actor, 'anuncios_market', id, body);
  }
  @Post('listings/:id/restore')
  @BodyFields('Retirar bloqueo dejando el anuncio como borrador', ['motivo'])
  restoreListing(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.moderate(actor, 'anuncios_market', id, body, true);
  }
  @Get('reports')
  @Paged()
  @ApiOperation({ summary: 'Cola de denuncias para moderación' })
  reports(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.admin.reports(actor, query);
  }
  @Post('reports/:id/claim')
  @ApiOperation({ summary: 'Asumir una denuncia pendiente' })
  claim(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.admin.claimReport(actor, id);
  }
  @Get('reports/:id')
  @ApiOperation({
    summary: 'Acceso auditado únicamente al contenido denunciado',
  })
  details(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.admin.reportDetails(actor, id);
  }
  @Post('reports/:id/resolve')
  @BodyFields(
    'Resolver o descartar denuncia y aplicar una acción permitida',
    ['estado', 'resolucion', 'accion'],
    ['estado', 'resolucion'],
  )
  resolve(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.resolveReport(actor, id, body);
  }
  @Get('audit')
  @Paged()
  @ApiOperation({
    summary: 'Consultar auditoría sin secretos; solo administrador',
  })
  audit(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.admin.auditLog(actor, query);
  }
}

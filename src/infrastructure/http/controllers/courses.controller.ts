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
import { CoursesUseCases } from '../../../application/courses/courses.use-cases';
import { MediaUseCases } from '../../../application/media/media.use-cases';
import { Actor, Row } from '../../../domain/common/contracts';
import {
  BodyFields,
  CurrentActor,
  Paged,
  Public,
} from '../common/api.decorators';

const courseFields = [
  'titulo',
  'descripcion',
  'nivel',
  'modalidad',
  'precioBase',
  'descuentoPorcentaje',
  'moneda',
  'portadaArchivoId',
];
const lessonFields = [
  'seccionId',
  'titulo',
  'tipo',
  'contenidoTexto',
  'videoArchivoId',
  'orden',
  'vistaPrevia',
  'publicada',
];
@ApiTags('Cursos y currículo')
@ApiBearerAuth()
@Controller()
export class CoursesController {
  constructor(
    private readonly courses: CoursesUseCases,
    private readonly media: MediaUseCases,
  ) {}
  @Public()
  @Get('courses')
  @Paged()
  @ApiOperation({
    summary: 'Catálogo publicado: q, areaId, tutorId, sort=recent|popular',
  })
  catalog(@Query() query: Row) {
    return this.courses.catalog(query);
  }
  @Public()
  @Get('courses/:id')
  @ApiOperation({
    summary: 'Detalle y currículo público sin contenido privado',
  })
  details(@Param('id') id: string) {
    return this.courses.publicDetails(id);
  }
  @Get('me/courses')
  @Paged()
  @ApiOperation({ summary: 'Mis cursos y borradores' })
  mine(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.courses.mine(actor, query);
  }
  @Post('me/courses')
  @BodyFields(
    'Crear un borrador propio de curso',
    ['areaId', ...courseFields],
    ['areaId', 'titulo', 'descripcion'],
  )
  create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.courses.create(actor, body);
  }
  @Get('me/courses/:id')
  @ApiOperation({ summary: 'Editar mi curso, currículo y galería' })
  own(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.courses.ownDetails(actor, id);
  }
  @Patch('me/courses/:id')
  @BodyFields(
    'Modificar mi curso con versión de concurrencia',
    ['versionLock', ...courseFields],
    ['versionLock'],
  )
  edit(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.courses.update(actor, id, body);
  }
  @Post('me/courses/:id/publish')
  @BodyFields('Publicar tras validar acreditación y currículo', ['versionLock'])
  publish(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.courses.publish(actor, id, body);
  }
  @Patch('me/courses/:id/state')
  @BodyFields('Pausar o archivar mi curso', ['estado', 'versionLock'])
  state(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.courses.changeState(actor, id, body);
  }
  @Post('me/courses/:id/sections')
  @BodyFields('Crear una sección del currículo', ['titulo', 'orden'])
  section(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.courses.section(actor, id, body);
  }
  @Put('me/courses/:id/sections/:sectionId')
  @BodyFields('Editar una sección propia', ['titulo', 'orden'])
  editSection(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() body: unknown,
  ) {
    return this.courses.section(actor, id, body, sectionId);
  }
  @Delete('me/courses/:id/sections/:sectionId')
  @ApiOperation({ summary: 'Archivar una sección vacía' })
  deleteSection(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.courses.removeSection(actor, id, sectionId);
  }
  @Post('me/courses/:id/lessons')
  @BodyFields('Crear lección de texto o video verificado', lessonFields, [
    'seccionId',
    'titulo',
    'tipo',
    'orden',
  ])
  lesson(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.courses.lesson(actor, id, body);
  }
  @Put('me/courses/:id/lessons/:lessonId')
  @BodyFields('Reemplazar los campos editables de una lección', lessonFields, [
    'seccionId',
    'titulo',
    'tipo',
    'orden',
  ])
  editLesson(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body() body: unknown,
  ) {
    return this.courses.lesson(actor, id, body, lessonId);
  }
  @Delete('me/courses/:id/lessons/:lessonId')
  @ApiOperation({ summary: 'Archivar lección conservando progreso histórico' })
  deleteLesson(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.courses.removeLesson(actor, id, lessonId);
  }
  @Post('me/courses/:id/lessons/:lessonId/resources')
  @BodyFields(
    'Vincular material propio a la lección',
    ['archivoId', 'titulo'],
    ['archivoId'],
  )
  resource(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body() body: unknown,
  ) {
    return this.courses.resourceLink(actor, id, lessonId, body);
  }
  @Delete('me/courses/:id/resources/:resourceId')
  @ApiOperation({ summary: 'Desvincular material de mi curso' })
  deleteResource(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.courses.removeResource(actor, id, resourceId);
  }
  @Post('me/courses/:id/gallery')
  @BodyFields('Vincular imagen o video demostrativo', ['archivoId', 'orden'])
  gallery(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.media.gallery(actor, id, body);
  }
  @Delete('me/courses/:id/gallery/:fileId')
  @ApiOperation({ summary: 'Retirar archivo de mi galería' })
  deleteGallery(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.media.removeGallery(actor, id, fileId);
  }
}

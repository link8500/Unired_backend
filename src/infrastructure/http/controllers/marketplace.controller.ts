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
import { MarketplaceUseCases } from '../../../application/marketplace/marketplace.use-cases';
import { Actor, Row } from '../../../domain/common/contracts';
import {
  BodyFields,
  CurrentActor,
  Paged,
  Public,
} from '../common/api.decorators';

const fields = [
  'titulo',
  'descripcion',
  'condicion',
  'tipoPrecio',
  'precioBase',
  'descuentoPorcentaje',
  'moneda',
  'ciudad',
];
@ApiTags('Marketplace entre usuarios')
@ApiBearerAuth()
@Controller()
export class MarketplaceController {
  constructor(private readonly market: MarketplaceUseCases) {}
  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Categorías activas del marketplace' })
  categories() {
    return this.market.categories();
  }
  @Public()
  @Get('listings')
  @Paged()
  @ApiOperation({
    summary:
      'Anuncios públicos: q, categoriaId, vendedorId, estado, sort=recent|popular',
  })
  catalog(@Query() query: Row) {
    return this.market.catalog(query);
  }
  @Public()
  @Get('listings/:id')
  @ApiOperation({
    summary: 'Detalle, imágenes y novedades visibles del anuncio',
  })
  details(@Param('id') id: string) {
    return this.market.details(id);
  }
  @Get('me/listings')
  @Paged()
  @ApiOperation({ summary: 'Mis anuncios, incluidos los borradores' })
  mine(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.market.mine(actor, query);
  }
  @Post('me/listings')
  @BodyFields(
    'Crear mi anuncio, no un producto vendido por UniRed',
    ['categoriaId', ...fields],
    ['categoriaId', 'titulo', 'descripcion', 'tipoPrecio'],
  )
  create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.market.create(actor, body);
  }
  @Get('me/listings/:id')
  @ApiOperation({ summary: 'Consultar mi anuncio para editarlo' })
  own(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.market.ownDetails(actor, id);
  }
  @Patch('me/listings/:id')
  @BodyFields(
    'Editar mi anuncio y sus ofertas',
    ['versionLock', ...fields],
    ['versionLock'],
  )
  edit(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.market.update(actor, id, body);
  }
  @Patch('me/listings/:id/state')
  @BodyFields('Publicar, reservar, declarar vendido o archivar mi anuncio', [
    'estado',
    'versionLock',
  ])
  state(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.market.state(actor, id, body);
  }
  @Post('me/listings/:id/images')
  @BodyFields('Vincular una imagen propia, limpia y del propósito correcto', [
    'archivoId',
    'orden',
  ])
  image(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.market.addImage(actor, id, body);
  }
  @Delete('me/listings/:id/images/:fileId')
  @ApiOperation({ summary: 'Desvincular una imagen de mi anuncio' })
  removeImage(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.market.removeImage(actor, id, fileId);
  }
  @Post('me/listings/:id/updates')
  @BodyFields('Publicar una novedad de mi artículo', ['contenido'])
  updatePost(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.market.updatePost(actor, id, body);
  }
  @Put('me/listings/:id/updates/:updateId')
  @BodyFields('Editar una novedad propia', ['contenido'])
  editPost(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('updateId') updateId: string,
    @Body() body: unknown,
  ) {
    return this.market.updatePost(actor, id, body, updateId);
  }
  @Delete('me/listings/:id/updates/:updateId')
  @ApiOperation({ summary: 'Ocultar una novedad propia' })
  removePost(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('updateId') updateId: string,
  ) {
    return this.market.removePost(actor, id, updateId);
  }
  @Get('me/favorites')
  @Paged()
  @ApiOperation({ summary: 'Mis favoritos que siguen siendo públicos' })
  favorites(@CurrentActor() actor: Actor, @Query() query: Row) {
    return this.market.favorites(actor, query);
  }
  @Put('me/favorites/:id')
  @ApiOperation({ summary: 'Añadir anuncio a mis favoritos, sin duplicar' })
  favorite(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.market.favorite(actor, id, true);
  }
  @Delete('me/favorites/:id')
  @ApiOperation({ summary: 'Retirar anuncio de mis favoritos' })
  unfavorite(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.market.favorite(actor, id, false);
  }
}

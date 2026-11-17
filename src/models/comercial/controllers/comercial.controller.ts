// Archivo: src/models/comercial/controllers/comercial.controller.ts
// Publica las rutas comerciales. Las tarjetas se validan solo en el navegador.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor, Registro } from '../../../core/dominio/comun/contratos';
import {
  BodyFields,
  CurrentActor,
  Paged,
  Public,
} from '../../../shared/http/comun/decoradores-api';
import { ComercialUseCases } from '../aplicacion/comercial.use-cases';

@ApiTags('Empresas, publicidad y pagos de demostración')
@ApiBearerAuth()
@Controller()
export class ComercialController {
  constructor(private readonly commerce: ComercialUseCases) {}
  @Public()
  @Get('commerce/rates')
  rates() {
    return this.commerce.rates();
  }
  @Patch('admin/commerce/rates/:id')
  @BodyFields(
    'Configurar la tarifa por materia; null hereda la tarifa global',
    ['precioMinutoOnline', 'precioMinutoPresencial'],
  )
  rate(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.saveRate(actor, id, body);
  }
  @Public()
  @Get('commerce/config')
  @ApiOperation({
    summary: 'Precios, comisión y aviso explícito de simulación',
  })
  config() {
    return this.commerce.config();
  }
  @Public()
  @Get('business/plans')
  @ApiOperation({
    summary: 'Planes disponibles para empresas: sin cobros reales',
  })
  plans() {
    return this.commerce.plans();
  }
  @Public()
  @Get('campaigns')
  @Paged()
  @ApiOperation({
    summary: 'Banners activos de empresas aprobadas con un plan vigente',
  })
  publicCampaigns(@Query() q: Registro) {
    return this.commerce.publicCampaigns(q);
  }
  @Public()
  @Get('highlights')
  @ApiOperation({
    summary: 'Publicaciones destacadas vigentes y todavía visibles',
  })
  highlights() {
    return this.commerce.highlights();
  }
  @Get('me/businesses')
  @Paged()
  companies(@CurrentActor() actor: Actor, @Query() q: Registro) {
    return this.commerce.companies(actor, q);
  }
  @Post('me/businesses')
  @BodyFields('Solicitar afiliación de una empresa', [
    'nombre',
    'razonSocial',
    'ruc',
    'emailComercial',
    'telefono',
    'sitioWeb',
    'descripcion',
    'ciudad',
  ])
  requestCompany(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.commerce.requestCompany(actor, body);
  }
  @Get('me/businesses/:id')
  details(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.commerce.companyDetails(actor, id);
  }
  @Post('me/businesses/:id/campaigns')
  @BodyFields('Crear banner sujeto a plan y aprobación empresarial', [
    'titulo',
    'descripcion',
    'bannerArchivoId',
    'enlace',
    'iniciaEn',
    'terminaEn',
    'estado',
  ])
  campaign(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.saveCampaign(actor, id, body);
  }
  @Patch('me/businesses/:id/campaigns/:campaignId')
  @BodyFields('Editar, pausar o finalizar una campaña', [
    'titulo',
    'descripcion',
    'bannerArchivoId',
    'enlace',
    'iniciaEn',
    'terminaEn',
    'estado',
  ])
  editCampaign(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('campaignId') campaignId: string,
    @Body() body: unknown,
  ) {
    return this.commerce.saveCampaign(actor, id, body, campaignId);
  }
  @Delete('me/businesses/:id/subscription')
  cancel(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.commerce.cancelSubscription(actor, id);
  }
  @Get('me/wallet')
  wallet(@CurrentActor() actor: Actor) {
    return this.commerce.wallet(actor);
  }
  @Get('me/demo-payments')
  @Paged()
  payments(@CurrentActor() actor: Actor, @Query() q: Registro) {
    return this.commerce.payments(actor, q);
  }
  @Post('demo/checkout')
  @BodyFields(
    'Confirmar una operación de DEMOSTRACIÓN sin recibir datos bancarios',
    ['clienteId', 'concepto', 'recursoId', 'planId', 'importe'],
  )
  payment(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.commerce.payDemo(actor, body);
  }
  @Post('tutorial-quote')
  @BodyFields('Cotización automática por materia, modalidad y duración', [
    'areaId',
    'modalidad',
    'duracionMinutos',
  ])
  quote(@Body() body: unknown) {
    return this.commerce.quote(body);
  }
  @Get('admin/businesses')
  @Paged()
  adminCompanies(@CurrentActor() actor: Actor, @Query() q: Registro) {
    return this.commerce.companies(actor, q, true);
  }
  @Patch('admin/businesses/:id/review')
  @BodyFields('Aprobar, rechazar o suspender una empresa', ['estado', 'motivo'])
  review(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.reviewCompany(actor, id, body);
  }
  @Get('admin/campaigns')
  @Paged()
  adminCampaigns(@CurrentActor() actor: Actor, @Query() q: Registro) {
    return this.commerce.adminCampaigns(actor, q);
  }
  @Post('admin/campaigns/:id/block')
  @BodyFields('Retirar una campaña del catálogo público', ['motivo'])
  block(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.moderateCampaign(actor, id, body);
  }
  @Patch('admin/commerce/config')
  @BodyFields('Configurar comisión, tarifas y destacados', [
    'comisionPorcentaje',
    'precioDestacado',
    'diasDestacado',
    'precioMinutoOnline',
    'precioMinutoPresencial',
  ])
  update(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.commerce.updateConfig(actor, body);
  }
}

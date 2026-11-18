// Redirecciones OAuth y canje privado para Flutter. Nunca pone JWT en la URL.
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Actor, Registro } from '../../../core/dominio/comun/contratos';
import {
  BodyFields,
  CurrentActor,
  Public,
} from '../../../shared/http/comun/decoradores-api';
import { AccesoSocialUseCases } from '../aplicacion/acceso-social.use-cases';

@ApiTags('Acceso con Google y Facebook')
@Controller()
export class AccesoSocialController {
  constructor(private readonly social: AccesoSocialUseCases) {}
  @Public()
  @Get('auth/social/providers')
  @ApiOperation({
    summary: 'Métodos de acceso disponibles, sin claves de los proveedores',
  })
  providers() {
    return this.social.providers();
  }
  @Public()
  @Post('auth/social/:provider/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @BodyFields('Preparar acceso con reto PKCE de la pestaña', ['origen', 'reto'])
  start(@Param('provider') provider: string, @Body() body: unknown) {
    return this.social.start(provider, body);
  }
  @ApiBearerAuth()
  @Post('me/social/:provider/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @BodyFields('Vincular un proveedor desde una sesión de UniRed autenticada', [
    'origen',
    'reto',
  ])
  link(
    @CurrentActor() actor: Actor,
    @Param('provider') provider: string,
    @Body() body: unknown,
  ) {
    return this.social.start(provider, body, actor);
  }
  @Public()
  @Get('auth/social/:provider/callback')
  @ApiOperation({
    summary:
      'Retorno autorizado del proveedor; envía a Flutter un código de un solo uso',
  })
  async callback(
    @Param('provider') provider: string,
    @Query() query: Registro,
    @Res() response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const url = await this.social.callbackResult(provider, query);
    response.redirect(303, url);
  }
  @Public()
  @Post('auth/social/exchange')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @BodyFields(
    'Canjear código con el verificador original; confirmar contraseña UniRed si la cuenta ya existe',
    ['codigo', 'verificador', 'passwordActual', 'navegadorId'],
    ['codigo', 'verificador'],
  )
  exchange(@Body() body: unknown, @Headers('user-agent') agente?: string) {
    return this.social.exchange(body, agente);
  }
  @ApiBearerAuth()
  @Get('me/social')
  @ApiOperation({ summary: 'Métodos vinculados a mi cuenta' })
  linked(@CurrentActor() actor: Actor) {
    return this.social.linked(actor);
  }
  @ApiBearerAuth()
  @Delete('me/social/:provider')
  @ApiOperation({
    summary:
      'Desvincular un proveedor conservando al menos un método de acceso',
  })
  unlink(@CurrentActor() actor: Actor, @Param('provider') provider: string) {
    return this.social.unlink(actor, provider);
  }
}

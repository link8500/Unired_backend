import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IdentityUseCases } from '../../../application/identity/identity.use-cases';
import { Actor } from '../../../domain/common/contracts';
import {
  AllowPending,
  BodyFields,
  CurrentActor,
  Public,
} from '../common/api.decorators';

@ApiTags('Autenticación')
@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityUseCases) {}
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @BodyFields(
    'Registrar una cuenta y enviar su verificación',
    ['nombre', 'email', 'password', 'edad'],
    ['nombre', 'email', 'password'],
  )
  register(@Body() body: unknown) {
    return this.identity.register(body);
  }
  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @BodyFields('Iniciar sesión con email y contraseña', ['email', 'password'])
  login(@Body() body: unknown) {
    return this.identity.login(body);
  }
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @BodyFields('Rotar refresh token y obtener un access token', ['refreshToken'])
  refresh(@Body() body: unknown) {
    return this.identity.refresh(body);
  }
  @AllowPending()
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cerrar la sesión actual' })
  logout(@CurrentActor() actor: Actor) {
    return this.identity.logout(actor);
  }
  @AllowPending()
  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cerrar todas mis sesiones' })
  logoutAll(@CurrentActor() actor: Actor) {
    return this.identity.logout(actor, true);
  }
  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @BodyFields('Confirmar correo mediante token de un solo uso', ['token'])
  verify(@Body() body: unknown) {
    return this.identity.verifyEmail(body);
  }
  @AllowPending()
  @ApiBearerAuth()
  @Post('resend-verification')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Reenviar la verificación de mi correo' })
  resend(@CurrentActor() actor: Actor) {
    return this.identity.resendVerification(actor);
  }
  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @BodyFields('Solicitar recuperación sin revelar si existe la cuenta', [
    'email',
  ])
  forgot(@Body() body: unknown) {
    return this.identity.forgot(body);
  }
  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @BodyFields('Cambiar contraseña con token de recuperación', [
    'token',
    'password',
  ])
  reset(@Body() body: unknown) {
    return this.identity.resetPassword(body);
  }
}
@ApiTags('Mi cuenta')
@ApiBearerAuth()
@Controller('me')
export class AccountController {
  constructor(private readonly identity: IdentityUseCases) {}
  @Post('change-email')
  @HttpCode(200)
  @BodyFields(
    'Cambiar correo con contraseña actual; revoca sesiones y exige nueva verificación',
    ['email', 'passwordActual'],
  )
  email(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.identity.changeEmail(actor, body);
  }
  @AllowPending()
  @Get()
  @ApiOperation({ summary: 'Consultar mi cuenta y mi perfil' })
  me(@CurrentActor() actor: Actor) {
    return this.identity.me(actor);
  }
  @Patch()
  @BodyFields(
    'Editar únicamente mi perfil',
    [
      'nombre',
      'edad',
      'presentacion',
      'telefono',
      'telefonoPublico',
      'areaProfesional',
      'ciudad',
      'notificacionesActivas',
    ],
    [],
  )
  edit(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.identity.editProfile(actor, body);
  }
  @Delete()
  @ApiOperation({ summary: 'Desactivar mi cuenta sin borrar el historial' })
  @AllowPending()
  deactivate(@CurrentActor() actor: Actor) {
    return this.identity.deactivate(actor);
  }
  @AllowPending()
  @Get('sessions')
  @ApiOperation({ summary: 'Listar mis sesiones sin exponer refresh tokens' })
  sessions(@CurrentActor() actor: Actor) {
    return this.identity.sessions(actor);
  }
  @AllowPending()
  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Revocar una de mis sesiones' })
  revoke(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.identity.revokeSession(actor, id);
  }
  @AllowPending()
  @Post('change-password')
  @HttpCode(200)
  @BodyFields('Cambiar mi contraseña y cerrar todas las sesiones', [
    'passwordActual',
    'passwordNueva',
  ])
  password(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.identity.changePassword(actor, body);
  }
}

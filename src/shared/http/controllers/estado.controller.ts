// Archivo: src/shared/http/controllers/estado.controller.ts
// Controlador HTTP de estado del servicio; recibe la solicitud y delega en los casos de uso.

import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BaseDatos } from '../../../core/dominio/comun/contratos';
import { Public } from '../comun/decoradores-api';

@ApiTags('Estado')
@Controller('health')
export class EstadoController {
  constructor(@Inject('DATABASE') private readonly db: BaseDatos) {}
  @Public()
  @Get()
  @ApiOperation({ summary: 'Comprobar API y conexión a PostgreSQL' })
  async health() {
    await this.db.read.store.count('roles');
    return { status: 'ok', database: 'postgresql' };
  }
}

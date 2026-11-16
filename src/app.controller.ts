// Archivo: src/app.controller.ts
// Controlador HTTP de estado del servicio; recibe la solicitud y delega en los casos de uso.

import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './shared/http/comun/decoradores-api';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }
}

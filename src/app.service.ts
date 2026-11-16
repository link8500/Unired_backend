// Archivo: src/app.service.ts
// Entrega la información básica del servicio utilizada por el controlador raíz.

import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}

// Archivo: src/app.module.ts
// Compone los módulos de la API y registra sus controladores raíz y protecciones globales.

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EstadoController } from './shared/http/controllers/estado.controller';
import { AutenticacionGuard } from './shared/http/comun/autenticacion.guard';
import { LimiteSolicitudesGuard } from './shared/http/comun/limite-solicitudes.guard';
import { PlataformaModule } from './shared/modulos/plataforma.module';
import { IdentidadModule } from './models/identidad/identidad.module';
import { AcreditacionesModule } from './models/acreditaciones/acreditaciones.module';
import { AprendizajeModule } from './models/aprendizaje/aprendizaje.module';
import { CursosModule } from './models/cursos/cursos.module';
import { MarketModule } from './models/market/market.module';
import { ComunidadModule } from './models/comunidad/comunidad.module';
import { MultimediaModule } from './models/multimedia/multimedia.module';
import { AdministracionModule } from './models/administracion/administracion.module';

/** Punto de composición. Cada módulo declara sus controladores y dependencias.
 * core/dominio y los casos de uso siguen sin importar NestJS, HTTP ni PostgreSQL.
 * Son módulos de una API, no microservicios ni procesos separados. */
@Module({
  imports: [
    PlataformaModule,
    IdentidadModule,
    AcreditacionesModule,
    AprendizajeModule,
    MultimediaModule,
    CursosModule,
    MarketModule,
    ComunidadModule,
    AdministracionModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 600 }]),
  ],
  controllers: [AppController, EstadoController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AutenticacionGuard },
    { provide: APP_GUARD, useClass: LimiteSolicitudesGuard },
  ],
})
export class AppModule {}

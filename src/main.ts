// Archivo: src/main.ts
// Valida la configuración, crea NestJS y abre el puerto HTTP configurado.

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './shared/http/configurar-aplicacion';
import { validateRuntime } from './shared/configuracion/entorno';

async function bootstrap(): Promise<void> {
  validateRuntime();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.PORT ?? 3000),
    process.env.API_HOST || '127.0.0.1',
  );
}
void bootstrap().catch(() => {
  console.error(
    'No se pudo iniciar la API. Comprueba .env, PostgreSQL y las migraciones.',
  );
  process.exitCode = 1;
});

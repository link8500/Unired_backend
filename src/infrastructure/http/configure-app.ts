import { INestApplication, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded, Response, NextFunction } from 'express';
import { ApiRequest } from './common/api-request';
import { randomUUID } from 'node:crypto';
import { ApiErrorFilter } from './common/error.filter';

/** Configuración única compartida por arranque y pruebas HTTP. */
export function configureApp(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          upgradeInsecureRequests:
            process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
    }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: false, limit: '16kb' }));
  app.use((request: ApiRequest, response: Response, next: NextFunction) => {
    request.requestId = randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    next();
  });
  app.enableCors({
    credentials: false,
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'X-Request-Id'],
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const origins = (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const local =
        process.env.NODE_ENV !== 'production' &&
        !!origin &&
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      callback(null, !origin || local || origins.includes(origin));
    },
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: '/', method: RequestMethod.GET }],
  });
  app.useGlobalFilters(new ApiErrorFilter());
  const config = new DocumentBuilder()
    .setTitle('UniRed API')
    .setDescription(
      'Cuentas, acreditación, cursos grabados y en vivo, marketplace entre usuarios, conversaciones y archivos privados. Sin carrito ni pagos.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: false },
  });
}

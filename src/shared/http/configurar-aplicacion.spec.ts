import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppController } from '../../app.controller';
import { AppService } from '../../app.service';
import { configureApp } from './configurar-aplicacion';

describe('Verificación pública del sitio', () => {
  let app: INestApplication;
  let origin: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    app.useGlobalGuards({ canActivate: () => false });
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('entrega el archivo de Google en la raíz sin sesión y mantiene los encabezados HTTP', async () => {
    const response = await fetch(`${origin}/google1ca61acbd8d5236d.html`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect((await response.text()).trim()).toBe(
      'google-site-verification: google1ca61acbd8d5236d.html',
    );
    const protectedResponse = await fetch(origin);
    expect(protectedResponse.status).toBe(403);
  });

  it('no presenta archivos internos del proyecto como contenido público', async () => {
    const response = await fetch(`${origin}/package.json`);
    expect(response.status).toBe(404);
  });

  it('no desplaza el archivo de verificación al prefijo de la API', async () => {
    const response = await fetch(
      `${origin}/api/v1/google1ca61acbd8d5236d.html`,
    );
    expect(response.status).toBe(404);
  });
});

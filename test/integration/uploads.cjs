// Regresión sobre PostgreSQL y HTTP reales: el servidor de imágenes no requiere
// antivirus nativo; documentos sin antivirus permanecen privados en cuarentena.
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { spawn } = require('node:child_process');
const path = require('node:path');

module.exports = async function uploads(ctx) {
  const api = ctx.base + '/api/v1';
  let token;
  let checks = 0;
  async function request(method, route, body, expected = 200) {
    const response = await fetch(api + route, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body && !(body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
    });
    const contentType = response.headers.get('content-type') || '';
    const result = contentType.includes('application/json')
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());
    assert.equal(
      response.status,
      expected,
      method + ' ' + route + ': ' + (result.message || 'respuesta inesperada'),
    );
    checks++;
    return result;
  }
  const session = await request('POST', '/auth/login', {
    email: 'admin@example.test',
    password: ctx.adminPassword,
  });
  token = session.accessToken;
  const photo = await sharp({
    create: { width: 160, height: 90, channels: 3, background: '#0075c9' },
  })
    .png()
    .withMetadata()
    .toBuffer();
  for (const purpose of [
    'avatar',
    'banner_perfil',
    'imagen_anuncio',
    'portada_curso',
    'galeria_curso',
    'evidencia_tutor',
    'adjunto_chat',
  ]) {
    const data = new FormData();
    data.append('proposito', purpose);
    data.append('file', new Blob([photo]), 'fotografia.png');
    const file = await request('POST', '/files', data, 201);
    assert.equal(file.estado, 'listo');
    assert.equal(file.verificacionContenido, 'recodificacion_imagen');
    assert.equal(file.mimeDetectado, 'image/webp');
    const bytes = await request('GET', '/files/' + file.id + '/content');
    const info = await sharp(bytes).metadata();
    assert.equal(info.format, 'webp');
    assert.equal(info.exif, undefined);
    assert.equal(String(bytes.length), file.tamanoBytes);
    if (purpose === 'avatar')
      await request('PUT', '/me/avatar', { archivoId: file.id });
  }
  const data = new FormData();
  data.append('proposito', 'evidencia_tutor');
  data.append(
    'file',
    new Blob([Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF\n')]),
    'documento.pdf',
  );
  const failed = await request('POST', '/files', data, 503);
  assert.equal(failed.code, 'SCANNER_UNAVAILABLE');
  assert.ok(failed.details.archivoId);
  const pending = await request('GET', '/files/' + failed.details.archivoId);
  assert.equal(pending.estado, 'cuarentena');
  await request('GET', '/files/' + pending.id + '/content', undefined, 409);
  console.log(
    'OK: ' +
      checks +
      ' solicitudes; siete usos de imágenes y documentos en cuarentena comprobados sin antivirus instalado.',
  );
  if (process.argv.includes('--web')) {
    const frontend = path.resolve(ctx.root, '../../../Flutter/unired');
    const flutter = path.resolve(frontend, '../sdk/flutter/bin/flutter.bat');
    const args = [
      'tool/run_web_tests.cjs',
      '--no-pub',
      '--timeout=90s',
      '--dart-define=UNIRED_LIVE_UPLOAD=true',
      '--dart-define=baseUrl=' + api,
      '--dart-define=adminEmail=admin@example.test',
      '--dart-define=adminPassword=' + ctx.adminPassword,
    ];
    await new Promise((resolve, reject) => {
      const windows = process.platform === 'win32';
      const child = spawn(process.execPath, args, {
        cwd: frontend,
        env: {
          ...process.env,
          ...ctx.env,
          PATH: path.dirname(flutter) + path.delimiter + process.env.PATH,
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let log = '';
      const timer = setTimeout(() => {
        if (windows)
          spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        else child.kill('SIGTERM');
      }, 240000);
      child.stdout.on('data', (chunk) => {
        log += chunk;
        process.stdout.write(
          String(chunk).split(ctx.adminPassword).join('[clave temporal]'),
        );
      });
      child.stderr.on('data', (chunk) => {
        log += chunk;
        process.stderr.write(
          String(chunk).split(ctx.adminPassword).join('[clave temporal]'),
        );
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        code === 0
          ? resolve()
          : reject(new Error('La prueba real de Chrome falló.'));
      });
    });
  }
};

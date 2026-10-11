// Prueba aislada: no lee credenciales de una base existente ni usa sus volúmenes.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');

function command(executable, args, env) {
  return new Promise((resolve, reject) => {
    const process = spawn(executable, args, {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    process.stdout.on('data', (chunk) => {
      output += chunk;
    });
    process.stderr.on('data', (chunk) => {
      output += chunk;
    });
    process.once('error', reject);
    process.once('exit', (code) => {
      if (code === 0) return resolve(output);
      let safe = output;
      for (const [key, value] of Object.entries(env ?? {})) {
        if (/PASSWORD|SECRET|ENCRYPTION_KEY/.test(key) && value?.length > 7)
          safe = safe.split(value).join('[redactado]');
      }
      reject(
        new Error(
          executable + ' terminó con código ' + code + '\n' + safe.slice(-6000),
        ),
      );
    });
  });
}
async function port() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const result = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return result;
}
async function main() {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), 'unired-api-test-'),
  );
  const owner = crypto.randomUUID();
  const name = 'unired-api-test-' + owner.slice(0, 8);
  const password = crypto.randomBytes(32).toString('hex');
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DB_HOST: '127.0.0.1',
    DB_NAME: 'unired_api_test',
    DB_USER: 'api_test',
    DB_PASSWORD: password,
    JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('hex'),
    MAIL_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    MAIL_TRANSPORT: 'file',
    MAIL_OUTBOX_ROOT: path.join(temporary, 'mails'),
    STORAGE_ROOT: path.join(temporary, 'storage'),
    API_HOST: '127.0.0.1',
    PORT: String(await port()),
    AV_PROVIDER: process.platform === 'win32' ? 'defender' : 'clamav',
    FFPROBE_PATH:
      process.env.FFPROBE_PATH ??
      (process.platform === 'win32'
        ? path.join(root, '.tools/ffmpeg/bin/ffprobe.exe')
        : 'ffprobe'),
  };
  let container = false;
  let api;
  let apiExited = false;
  let client;
  let logs = '';
  try {
    console.log('Compilando API y preparando PostgreSQL temporal...');
    await command(
      process.execPath,
      ['node_modules/@nestjs/cli/bin/nest.js', 'build'],
      env,
    );
    await command(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '--label',
        'unired.test.owner=' + owner,
        '-p',
        '127.0.0.1::5432',
        '-e',
        'POSTGRES_DB=unired_api_test',
        '-e',
        'POSTGRES_USER=api_test',
        '-e',
        'POSTGRES_PASSWORD=' + password,
        'postgres:16-alpine',
      ],
      env,
    );
    container = true;
    const published = (
      await command('docker', ['port', name, '5432/tcp'], env)
    ).trim();
    env.DB_PORT = published.split(':').pop();
    for (let attempt = 0; attempt < 100; attempt++) {
      const probe = new Client({
        host: env.DB_HOST,
        port: Number(env.DB_PORT),
        database: env.DB_NAME,
        user: env.DB_USER,
        password,
      });
      try {
        await probe.connect();
        await probe.end();
        break;
      } catch {
        await probe.end().catch(() => {});
        if (attempt === 99)
          throw Error('PostgreSQL temporal no está disponible.');
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    console.log('Aplicando migraciones únicamente a la base temporal...');
    await command(
      process.execPath,
      [
        'node_modules/typeorm/cli.js',
        'migration:run',
        '-d',
        'dist/infrastructure/database/data-source.js',
      ],
      env,
    );
    client = new Client({
      host: env.DB_HOST,
      port: Number(env.DB_PORT),
      database: env.DB_NAME,
      user: env.DB_USER,
      password,
    });
    await client.connect();
    const { rows } = await client.query(
      "SELECT COUNT(*)::int AS total FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    );
    assert.equal(rows[0].total, 44); // 42 originales + outbox + historial de migraciones.
    const adminPassword =
      'Prueba-admin-' + crypto.randomBytes(12).toString('hex');
    console.log('Creando administrador ficticio por consola...');
    await command(
      process.execPath,
      ['dist/infrastructure/cli/create-admin.js'],
      {
        ...env,
        BOOTSTRAP_ADMIN_EMAIL: 'admin@example.test',
        BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
        BOOTSTRAP_ADMIN_NAME: 'Admin prueba',
      },
    );
    api = spawn(process.execPath, ['dist/main.js'], {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    api.once('exit', () => {
      apiExited = true;
    });
    api.stdout.on('data', (chunk) => {
      logs = (logs + chunk).slice(-10000);
    });
    api.stderr.on('data', (chunk) => {
      logs = (logs + chunk).slice(-10000);
    });
    const base = 'http://127.0.0.1:' + env.PORT;
    let ready = false;
    for (let attempt = 0; attempt < 80 && !apiExited; attempt++) {
      try {
        const response = await fetch(base + '/api/v1/health', {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) {
      console.error(logs);
      throw Error('La API temporal no pudo arrancar.');
    }
    const scenarios = require('../test/integration/api-scenarios.cjs');
    await scenarios({ root, base, env, temporary, client, adminPassword });
    console.log('OK: integración HTTP sobre PostgreSQL aislado.');
  } finally {
    if (api && !apiExited) {
      const stopped = new Promise((resolve) => api.once('exit', resolve));
      api.kill('SIGTERM');
      await Promise.race([
        stopped,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      assert.ok(apiExited, 'No terminó el proceso temporal de la API.');
    }
    if (client) await client.end().catch(() => {});
    if (container) {
      const labels = JSON.parse(
        (
          await command(
            'docker',
            ['inspect', name, '--format', '{{json .Config.Labels}}'],
            env,
          )
        ).trim(),
      );
      assert.equal(
        labels['unired.test.owner'],
        owner,
        'Se niega a detener un contenedor ajeno.',
      );
      await command('docker', ['stop', '--timeout', '10', name], env); // --rm retira solo su volumen anónimo.
    }
    const resolved = path.resolve(temporary);
    const relative = path.relative(path.resolve(os.tmpdir()), resolved);
    assert.ok(
      /^unired-api-test-[^\\/]+$/.test(relative),
      'Se niega a borrar una carpeta fuera de la prueba.',
    );
    await fs.rm(resolved, { recursive: true, force: true });
    console.log(
      'Retirados únicamente contenedor y archivos temporales de prueba.',
    );
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

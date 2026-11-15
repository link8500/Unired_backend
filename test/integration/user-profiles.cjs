// Solo se ejecuta con la base efímera creada por scripts/test-integration.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function profiles(ctx) {
  let checks = 0;
  const api = ctx.base + '/api/v1';
  function check(actual, expected, message) {
    assert.deepEqual(actual, expected, message);
    checks++;
  }
  async function request(method, route, body, token, expected = 200) {
    const response = await fetch(api + route, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    check(response.status, expected, method + ' ' + route);
    return response.json();
  }
  async function verify(email) {
    if (ctx.env.REQUIRE_EMAIL_VERIFICATION === 'false') return;
    for (let i = 0; i < 100; i++) {
      const names = await fs.readdir(ctx.env.MAIL_OUTBOX_ROOT).catch(() => []);
      for (const name of names) {
        const mail = JSON.parse(
          await fs.readFile(path.join(ctx.env.MAIL_OUTBOX_ROOT, name), 'utf8'),
        );
        if (mail.to === email && mail.text.includes('verificar_email: ')) {
          const token = mail.text.split('verificar_email: ')[1].split('\n')[0];
          await request('POST', '/auth/verify-email', { token });
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('No llegó el token al buzón temporal de pruebas.');
  }
  const { rows: columns } = await ctx.client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='perfiles_usuario'",
  );
  for (const column of [
    'pais',
    'departamento',
    'universidad',
    'sede',
    'carrera',
    'anio_estudio',
    'trabaja',
    'ocupacion',
  ]) {
    check(
      columns.some((entry) => entry.column_name === column),
      true,
      column,
    );
  }
  const { rows: migrations } = await ctx.client.query(
    'SELECT name FROM typeorm_migrations ORDER BY id',
  );
  check(migrations.length, 5, 'Migraciones aditivas registradas');
  check(migrations[2].name, 'UserProfiles1791700000000');
  const password = 'Prueba-perfil-universitario-2026!';
  const email = 'perfil@example.test';
  const registered = await request(
    'POST',
    '/auth/register',
    {
      nombre: 'Estudiante de prueba',
      email,
      password,
      edad: 21,
      pais: 'Nicaragua',
      departamento: 'Managua',
      ciudad: 'Managua',
      universidad: 'UNAN-Managua',
      sede: 'Central',
      carrera: 'Ingeniería en Sistemas',
      anioEstudio: 3,
      trabaja: true,
      ocupacion: 'Desarrollador',
      telefono: '+505 8888-8888',
    },
    undefined,
    201,
  );
  await verify(email);
  const session = await request('POST', '/auth/login', { email, password });
  const token = session.accessToken;
  let me = await request('GET', '/me', undefined, token);
  check(me.edad, 21);
  check(me.tipoPerfil, 'universitario');
  check(me.perfil.universidad, 'UNAN-Managua');
  check(me.perfil.anioEstudio, 3);
  check(me.perfil.trabaja, true);
  check(me.camposPerfilEditables.includes('universidad'), true);
  const { rows: stored } = await ctx.client.query(
    'SELECT u.edad,p.universidad,p.anio_estudio,p.trabaja FROM usuarios u JOIN perfiles_usuario p ON p.usuario_id=u.id WHERE u.id=$1',
    [registered.usuario.id],
  );
  check(stored[0], {
    edad: 21,
    universidad: 'UNAN-Managua',
    anio_estudio: 3,
    trabaja: true,
  });
  me = await request('PATCH', '/me', { trabaja: false }, token);
  check(me.perfil.trabaja, false);
  check(me.perfil.ocupacion, null);
  check(
    me.perfil.universidad,
    'UNAN-Managua',
    'PATCH no borra campos omitidos',
  );
  await request('PATCH', '/me', { ocupacion: 'Docente' }, token, 400);
  me = await request(
    'PATCH',
    '/me',
    { trabaja: true, ocupacion: 'Docente' },
    token,
  );
  check(me.perfil.ocupacion, 'Docente');
  me = await request('PATCH', '/me', { trabaja: null }, token);
  check(me.perfil.trabaja, null);
  check(me.perfil.ocupacion, null);
  for (const body of [
    { trabaja: 'false' },
    { edad: 131 },
    { anioEstudio: 0 },
    { anioEstudio: 16 },
    { universidad: 'x'.repeat(181) },
    { telefono: 'correo@example.test' },
    { roles: ['administrador'] },
    { tipoPerfil: 'administrador' },
    {},
  ])
    await request('PATCH', '/me', body, token, 400);
  await request(
    'POST',
    '/auth/register',
    {
      nombre: 'Intento',
      email: 'invalido@example.test',
      password,
      roles: ['administrador'],
    },
    undefined,
    400,
  );
  const publicProfile = await request(
    'GET',
    '/profiles/' + registered.usuario.id,
  );
  for (const field of [
    'edad',
    'email',
    'pais',
    'departamento',
    'universidad',
    'sede',
    'carrera',
    'anioEstudio',
    'trabaja',
    'ocupacion',
    'telefono',
  ]) {
    check(Object.hasOwn(publicProfile, field), false, 'Dato privado: ' + field);
  }
  const adminSession = await request('POST', '/auth/login', {
    email: 'admin@example.test',
    password: ctx.adminPassword,
  });
  const adminToken = adminSession.accessToken;
  let admin = await request('GET', '/me', undefined, adminToken);
  check(admin.tipoPerfil, 'administrador');
  check(admin.camposPerfilEditables.includes('universidad'), false);
  check(admin.camposPerfilEditables.includes('edad'), false);
  admin = await request(
    'PATCH',
    '/me',
    {
      pais: 'Nicaragua',
      departamento: 'León',
      ciudad: 'León',
      telefono: '+505 7777-7777',
      trabaja: true,
      ocupacion: 'Administrador de sistemas',
    },
    adminToken,
  );
  check(admin.perfil.trabaja, true);
  check(admin.perfil.ocupacion, 'Administrador de sistemas');
  for (const body of [
    { universidad: 'UNAN' },
    { carrera: 'Sistemas' },
    { sede: null },
    { anioEstudio: 1 },
    { edad: 30 },
  ]) {
    await request('PATCH', '/me', body, adminToken, 400);
  }
  const detail = await request(
    'GET',
    '/admin/users/' + registered.usuario.id,
    undefined,
    adminToken,
  );
  check(detail.perfil.universidad, 'UNAN-Managua');
  check(detail.tipoPerfil, 'universitario');
  await request(
    'GET',
    '/admin/users/' + registered.usuario.id,
    undefined,
    token,
    403,
  );
  // Cambiar roles cambia la política, no destruye los estudios previamente guardados.
  await request(
    'PUT',
    '/admin/users/' + registered.usuario.id + '/roles',
    {
      roles: ['administrador'],
      motivo: 'Prueba aislada de excepción de perfil',
    },
    adminToken,
  );
  me = await request('GET', '/me', undefined, token);
  check(me.tipoPerfil, 'administrador');
  check(me.perfil.universidad, 'UNAN-Managua');
  await request(
    'PATCH',
    '/me',
    { universidad: 'Otra universidad' },
    token,
    400,
  );
  await request('PATCH', '/me', { ciudad: 'Granada', trabaja: false }, token);
  const basic = await request(
    'POST',
    '/auth/register',
    {
      nombre: 'Perfil básico',
      email: 'basico@example.test',
      password,
    },
    undefined,
    201,
  );
  const { rows: optional } = await ctx.client.query(
    'SELECT universidad,trabaja FROM perfiles_usuario WHERE usuario_id=$1',
    [basic.usuario.id],
  );
  check(
    optional[0],
    { universidad: null, trabaja: null },
    'No inventa datos del usuario nuevo',
  );
  // Las reglas también se cumplen fuera de HTTP.
  await assert.rejects(
    ctx.client.query(
      'UPDATE perfiles_usuario SET anio_estudio=16 WHERE usuario_id=$1',
      [basic.usuario.id],
    ),
    (error) => error.code === '23514',
  );
  checks++;
  await assert.rejects(
    ctx.client.query(
      "UPDATE perfiles_usuario SET trabaja=false,ocupacion='Docente' WHERE usuario_id=$1",
      [basic.usuario.id],
    ),
    (error) => error.code === '23514',
  );
  checks++;
  const spec = await (await fetch(ctx.base + '/docs-json')).json();
  const schemas =
    spec.paths['/api/v1/me'].patch.requestBody.content['application/json']
      .schema.anyOf;
  check(Object.hasOwn(schemas[0].properties, 'universidad'), true);
  check(Object.hasOwn(schemas[1].properties, 'universidad'), false);
  check(schemas[1].properties.trabaja.type, 'boolean');
  console.log(
    'OK: ' +
      checks +
      ' comprobaciones HTTP/PostgreSQL de perfiles, roles y privacidad.',
  );
};

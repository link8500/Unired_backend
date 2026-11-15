// Ejecutar exclusivamente mediante el harness y su PostgreSQL efímero.
const assert = require('node:assert/strict');

module.exports = async function adminInterface(ctx) {
  let checks = 0;
  const api = ctx.base + '/api/v1';
  const current = await ctx.client.query('SELECT current_database() AS name');
  assert.equal(current.rows[0].name, 'unired_api_test');
  async function request(method, route, body, token, expected = 200) {
    const result = await fetch(api + route, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const data = await result.json();
    assert.equal(
      result.status,
      expected,
      `${method} ${route}: ${JSON.stringify(data)}`,
    );
    checks++;
    return data;
  }
  function check(value, expected, label) {
    assert.deepEqual(value, expected, label);
    checks++;
  }
  const admin = (
    await request('POST', '/auth/login', {
      email: 'admin@example.test',
      password: ctx.adminPassword,
    })
  ).accessToken;
  const password = 'Prueba-admin-interface-2026!';
  await request(
    'POST',
    '/auth/register',
    {
      nombre: 'Estudiante con perfil',
      email: 'estudiante-ui@example.test',
      password,
      edad: 22,
      universidad: 'UNAN-Managua',
      sede: 'Central',
      carrera: 'Sistemas',
      anioEstudio: 3,
      pais: 'Nicaragua',
      departamento: 'Managua',
      ciudad: 'Managua',
      trabaja: true,
      ocupacion: 'Asistente',
      telefono: '+505 8888 8888',
    },
    undefined,
    201,
  );
  // Se habilita únicamente la cuenta ficticia de esta base para aislar las pruebas UI/API.
  await ctx.client.query(
    "UPDATE usuarios SET estado='activo',email_verificado_en=CURRENT_TIMESTAMP WHERE email=$1",
    ['estudiante-ui@example.test'],
  );
  const student = (
    await request('POST', '/auth/login', {
      email: 'estudiante-ui@example.test',
      password,
    })
  ).accessToken;
  const me = await request('GET', '/me', undefined, student);
  check(me.perfil.universidad, 'UNAN-Managua');
  check(me.perfil.ciudad, 'Managua');
  const page = await request(
    'GET',
    '/admin/users?q=estudiante-ui%40example.test&sort=nombre&rol=usuario&estado=activo',
    undefined,
    admin,
  );
  check(page.total, 1);
  check(page.items[0].id, me.id);
  check(page.items[0].universidad, 'UNAN-Managua');
  check(page.items[0].publicaciones, 0);
  check(page.items[0].tutorias, 0);
  check(page.items[0].tutorVerificado, false);
  check(Object.hasOwn(page.items[0], 'passwordHash'), false);
  const detail = await request(
    'GET',
    `/admin/users/${me.id}`,
    undefined,
    admin,
  );
  check(detail.perfil.ocupacion, 'Asistente');
  check(detail.resumen.publicaciones, 0);
  check(detail.publicaciones, []);
  check(detail.tutorias, []);
  check(detail.acreditaciones, []);
  check(detail.resumen.sesionesActivas, 1);
  await request('GET', '/admin/users', undefined, student, 403);
  await request('GET', `/admin/users/${me.id}`, undefined, student, 403);
  await request('GET', '/admin/users?sort=desconocido', undefined, admin, 400);
  await request('GET', '/admin/users?rol=propietario', undefined, admin, 400);
  const corrected = await request(
    'PATCH',
    `/admin/users/${me.id}/profile`,
    {
      ciudad: 'León',
      carrera: 'Ingeniería de Software',
      trabaja: false,
      ocupacion: null,
      motivo: 'Corrección solicitada por el usuario',
    },
    admin,
  );
  check(corrected.perfil.ciudad, 'León');
  check(corrected.perfil.carrera, 'Ingeniería de Software');
  check(corrected.perfil.ocupacion, null);
  check(corrected.edad, 22);
  await request(
    'PATCH',
    `/admin/users/${me.id}/profile`,
    { ciudad: 'Masaya', motivo: 'Cambio no autorizado' },
    student,
    403,
  );
  await request(
    'PATCH',
    `/admin/users/${me.id}/profile`,
    { email: 'otro@example.test', motivo: 'No se admite cambio de correo' },
    admin,
    400,
  );
  await request(
    'PATCH',
    `/admin/users/${me.id}/profile`,
    { ciudad: 'Masaya' },
    admin,
    400,
  );
  const adminMe = await request('GET', '/me', undefined, admin);
  await request(
    'PATCH',
    `/admin/users/${adminMe.id}/profile`,
    {
      universidad: 'UNAN',
      motivo: 'Los administradores no tienen campos académicos',
    },
    admin,
    400,
  );
  const analytics = await request(
    'GET',
    '/admin/analytics?days=7',
    undefined,
    admin,
  );
  check(analytics.actividad.length, 7);
  check(Array.isArray(analytics.estadosUsuarios), true);
  check(Array.isArray(analytics.tutoresDemandados), true);
  check(Array.isArray(analytics.actividadReciente), true);
  check(Array.isArray(analytics.solicitudesRecientes), true);
  check(
    analytics.actividadReciente.some(
      (e) => e.accion === 'usuario.perfil_actualizado',
    ),
    true,
  );
  await request('GET', '/admin/analytics', undefined, student, 403);
  await request(
    'GET',
    '/admin/listings?estado=publicado&q=libro',
    undefined,
    admin,
  );
  await request('GET', '/admin/courses?estado=borrador', undefined, admin);
  await request(
    'GET',
    '/admin/listings?estado=publicada',
    undefined,
    admin,
    400,
  );
  const audit = await request('GET', '/admin/audit', undefined, admin);
  check(
    audit.items.some(
      (e) =>
        e.accion === 'usuario.perfil_actualizado' &&
        e.resumen.motivo === 'Corrección solicitada por el usuario',
    ),
    true,
  );
  await request('POST', '/auth/login', {
    email: 'estudiante-ui@example.test',
    password,
  });
  console.log(
    `Comprobaciones de interfaz administrativa y permisos: ${checks}.`,
  );
};

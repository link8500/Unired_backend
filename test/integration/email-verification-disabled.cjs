const assert = require('node:assert/strict');
module.exports = async function ({ base, client }) {
  let assertions = 0;
  async function request(method, path, data, token, status = 200) {
    const response = await fetch(base + '/api/v1' + path, {
      method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    assert.equal(response.status, status, path);
    assertions++;
    return await response.json();
  }
  const password = 'Prueba-desarrollo-sin-correo-2026!';
  const email = 'sin-verificacion@example.test';
  const created = await request(
    'POST',
    '/auth/register',
    { nombre: 'Usuario sin verificación', email, password },
    null,
    201,
  );
  assert.equal(created.verificacionEmailRequerida, false);
  assertions++;
  assert.equal(created.usuario.estado, 'activo');
  assertions++;
  assert.equal(created.usuario.emailVerificadoEn, null);
  assertions++;
  let session = await request('POST', '/auth/login', { email, password });
  let me = await request('GET', '/me', null, session.accessToken);
  assert.equal(me.verificacionEmailRequerida, false);
  assertions++;
  await request('GET', '/me/listings', null, session.accessToken);
  const category = (
    await client.query('SELECT id FROM categorias_market ORDER BY id LIMIT 1')
  ).rows[0].id;
  await request(
    'POST',
    '/me/listings',
    {
      categoriaId: category,
      titulo: 'Artículo de desarrollo',
      descripcion: 'Creado sin verificación de correo',
      precioBase: '10.00',
      condicion: 'usado',
      tipoPrecio: 'fijo',
    },
    session.accessToken,
    201,
  );
  const tokens = await client.query(
    "SELECT COUNT(*)::int AS total FROM tokens_cuenta WHERE usuario_id=$1 AND proposito='verificar_email'",
    [me.id],
  );
  assert.equal(tokens.rows[0].total, 0);
  assertions++;
  // Simula exclusivamente una cuenta antigua dentro de la BD desechable.
  await client.query(
    "UPDATE usuarios SET estado='pendiente_email' WHERE id=$1",
    [me.id],
  );
  session = await request('POST', '/auth/login', { email, password });
  me = await request('GET', '/me', null, session.accessToken);
  assert.equal(me.estado, 'activo');
  assertions++;
  assert.equal(me.emailVerificadoEn, null);
  assertions++;
  await request('GET', '/me/notifications', null, session.accessToken);
  const changed = await request(
    'POST',
    '/me/change-email',
    { email: 'nuevo-desarrollo@example.test', passwordActual: password },
    session.accessToken,
  );
  assert.equal(changed.verificacionEmailRequerida, false);
  assertions++;
  session = await request('POST', '/auth/login', {
    email: 'nuevo-desarrollo@example.test',
    password,
  });
  await request('GET', '/me/listings', null, session.accessToken);
  await client.query("UPDATE usuarios SET estado='suspendido' WHERE id=$1", [
    me.id,
  ]);
  await request(
    'POST',
    '/auth/login',
    { email: 'nuevo-desarrollo@example.test', password },
    null,
    401,
  );
  console.log(
    'OK: ' +
      assertions +
      ' comprobaciones con verificación desactivada, solo en PostgreSQL temporal.',
  );
};

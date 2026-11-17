const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
module.exports = async function social(ctx) {
  const api = ctx.base + '/api/v1';
  let checks = 0;
  async function request(method, path, body, token, status = 200) {
    const r = await fetch(api + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
    });
    const data = await r.json();
    assert.equal(
      r.status,
      status,
      method + ' ' + path + ': ' + (data.message || JSON.stringify(data)),
    );
    checks++;
    return data;
  }
  async function start(provider, token, origin = 'http://localhost:63636') {
    const verifier = randomBytes(64).toString('base64url');
    const reto = createHash('sha256').update(verifier).digest('base64url');
    const data = await request(
      'POST',
      (token ? '/me' : '/auth') + '/social/' + provider + '/start',
      { origen: origin, reto },
      token,
    );
    return {
      provider,
      verifier,
      state: new URL(data.url).searchParams.get('state'),
    };
  }
  async function callback(flow, code, error) {
    const url = new URL(api + '/auth/social/' + flow.provider + '/callback');
    url.searchParams.set('state', flow.state);
    if (code) url.searchParams.set('code', code);
    if (error) url.searchParams.set('error', error);
    const r = await fetch(url, { redirect: 'manual' });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    checks++;
    const target = new URL(r.headers.get('location'));
    assert.equal(target.origin, 'http://localhost:63636');
    return new URLSearchParams(target.hash.split('?')[1]);
  }
  async function login(provider, fixture, password) {
    const flow = await start(provider);
    const params = await callback(flow, fixture);
    return {
      flow,
      code: params.get('codigo'),
      result: await request('POST', '/auth/social/exchange', {
        codigo: params.get('codigo'),
        verificador: flow.verifier,
        ...(password ? { passwordActual: password } : {}),
      }),
    };
  }
  const providerSettings = await request('GET', '/auth/social/providers');
  assert.deepEqual(providerSettings, { google: true, facebook: true });
  await request(
    'POST',
    '/auth/social/apple/start',
    { origen: 'http://localhost:63636', reto: 'a'.repeat(43) },
    null,
    400,
  );
  await request(
    'POST',
    '/auth/social/google/start',
    { origen: 'https://evil.example.test', reto: 'a'.repeat(43) },
    null,
    400,
  );
  await request(
    'POST',
    '/auth/social/google/start',
    { origen: 'http://localhost:63636/otra', reto: 'a'.repeat(43) },
    null,
    400,
  );
  await request(
    'POST',
    '/auth/social/google/start',
    {
      origen: 'http://localhost:63636',
      reto: 'a'.repeat(43),
      rol: 'administrador',
    },
    null,
    400,
  );
  const google = await login('google', 'google-new');
  assert.equal(google.result.nuevo, true);
  assert.deepEqual(google.result.roles, ['usuario']);
  assert.ok(google.result.accessToken);
  assert.equal(google.result.usuario.estado, 'activo');
  const me = await request('GET', '/me', null, google.result.accessToken);
  assert.equal(me.tienePassword, false);
  assert.equal(me.email, 'social@example.test');
  const methods = await request(
    'GET',
    '/me/social',
    null,
    google.result.accessToken,
  );
  assert.equal(methods.identidades.length, 1);
  assert.equal(methods.identidades[0].proveedor, 'google');
  assert.equal(methods.identidades[0].sujetoProveedor, undefined);
  await request(
    'DELETE',
    '/me/social/google',
    null,
    google.result.accessToken,
    409,
  );
  await request(
    'POST',
    '/auth/social/exchange',
    { codigo: google.code, verificador: google.flow.verifier },
    null,
    400,
  );
  const repeated = await login('google', 'google-new');
  assert.equal(repeated.result.usuario.id, google.result.usuario.id);
  assert.equal(repeated.result.nuevo, false);
  const blocked = await start('google');
  const blockedParams = await callback(blocked, 'google-second');
  await request(
    'POST',
    '/auth/social/exchange',
    {
      codigo: blockedParams.get('codigo'),
      verificador: randomBytes(64).toString('base64url'),
    },
    null,
    400,
  );
  const second = await request('POST', '/auth/social/exchange', {
    codigo: blockedParams.get('codigo'),
    verificador: blocked.verifier,
  });
  assert.notEqual(second.usuario.id, google.result.usuario.id);
  const toLink = await start('facebook', google.result.accessToken);
  const linkParams = await callback(toLink, 'facebook-no-email');
  const linked = await request('POST', '/auth/social/exchange', {
    codigo: linkParams.get('codigo'),
    verificador: toLink.verifier,
  });
  assert.equal(linked.usuario.id, google.result.usuario.id);
  assert.equal(linked.usuario.email, 'social@example.test');
  const fbLogin = await login('facebook', 'facebook-no-email');
  assert.equal(fbLogin.result.usuario.id, google.result.usuario.id);
  await request('DELETE', '/me/social/facebook', null, linked.accessToken);
  await request('GET', '/me', null, google.result.accessToken, 401); // Se cerraron las otras sesiones.
  await request('DELETE', '/me/social/google', null, linked.accessToken, 409);
  const missing = await start('facebook');
  const missingParams = await callback(missing, 'facebook-no-email');
  await request(
    'POST',
    '/auth/social/exchange',
    { codigo: missingParams.get('codigo'), verificador: missing.verifier },
    null,
    400,
  );
  const pending = await login('facebook', 'facebook-pending');
  assert.equal(pending.result.usuario.estado, 'pendiente_email');
  assert.equal(pending.result.usuario.emailVerificadoEn, null);
  const cancelled = await start('google');
  assert.equal(
    (await callback(cancelled, null, 'access_denied')).get('error'),
    'SOCIAL_CANCELLED',
  );
  assert.equal(
    (await callback(cancelled, 'google-new')).get('error'),
    'SOCIAL_INVALID_STATE',
  );
  const expires = await start('google');
  await ctx.client.query(
    "UPDATE flujos_acceso_social SET expira_en=now()-interval '1 second' WHERE estado_hash=$1",
    [createHash('sha256').update(expires.state).digest()],
  );
  assert.equal(
    (await callback(expires, 'google-new')).get('error'),
    'SOCIAL_INVALID_STATE',
  );
  // El contador debe persistir incluso cuando se rechaza la contraseña.
  const capped = await start('google');
  const cappedParams = await callback(capped, 'google-admin');
  const cappedBody = {
    codigo: cappedParams.get('codigo'),
    verificador: capped.verifier,
  };
  for (let i = 0; i < 5; i++) {
    await request(
      'POST',
      '/auth/social/exchange',
      { ...cappedBody, passwordActual: 'Contraseña-incorrecta-ficticia' },
      null,
      401,
    );
  }
  await request(
    'POST',
    '/auth/social/exchange',
    { ...cappedBody, passwordActual: ctx.adminPassword },
    null,
    429,
  );
  const existing = await start('google');
  const existingParams = await callback(existing, 'google-admin');
  const confirmBody = {
    codigo: existingParams.get('codigo'),
    verificador: existing.verifier,
  };
  assert.equal(
    (await request('POST', '/auth/social/exchange', confirmBody))
      .requierePassword,
    true,
  );
  await request(
    'POST',
    '/auth/social/exchange',
    { ...confirmBody, passwordActual: 'Clave-incorrecta-de-prueba' },
    null,
    401,
  );
  const admin = await request('POST', '/auth/social/exchange', {
    ...confirmBody,
    passwordActual: ctx.adminPassword,
  });
  assert.deepEqual(admin.roles, ['usuario', 'administrador']);
  assert.equal(
    (await request('GET', '/me', null, admin.accessToken)).nombre,
    'Admin prueba',
  );
  const passwordFlow = await start('google');
  const passwordParams = await callback(passwordFlow, 'google-admin'); // Ya vinculado: no vuelve a pedir contraseña.
  assert.ok(
    (
      await request('POST', '/auth/social/exchange', {
        codigo: passwordParams.get('codigo'),
        verificador: passwordFlow.verifier,
      })
    ).accessToken,
  );
  const onlyOther = await start('facebook', second.accessToken);
  const otherParams = await callback(onlyOther, 'facebook-pending');
  await request(
    'POST',
    '/auth/social/exchange',
    { codigo: otherParams.get('codigo'), verificador: onlyOther.verifier },
    null,
    409,
  );
  const revoked = await start('facebook', second.accessToken);
  const revokedParams = await callback(revoked, 'facebook-no-email');
  await request('POST', '/auth/logout', null, second.accessToken);
  await request(
    'POST',
    '/auth/social/exchange',
    { codigo: revokedParams.get('codigo'), verificador: revoked.verifier },
    null,
    401,
  );
  await ctx.client.query(
    "UPDATE usuarios SET estado='suspendido' WHERE id=$1",
    [google.result.usuario.id],
  );
  const suspended = await start('google');
  const suspendedParams = await callback(suspended, 'google-new');
  await request(
    'POST',
    '/auth/social/exchange',
    { codigo: suspendedParams.get('codigo'), verificador: suspended.verifier },
    null,
    403,
  );
  const { rows } = await ctx.client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name IN ('identidades_externas','flujos_acceso_social')",
  );
  assert.ok(
    !rows.some((row) =>
      /access_token|refresh_token|password/.test(row.column_name),
    ),
  );
  console.log(
    'OK: ' +
      checks +
      ' comprobaciones HTTP de acceso social, PKCE, roles, confirmación, caducidad, vinculación y privacidad. Proveedores externos sustituidos solo dentro de esta prueba.',
  );
};

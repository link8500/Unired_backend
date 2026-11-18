const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
module.exports = async function social(ctx) {
  const api = ctx.base + '/api/v1';
  const chrome =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36';
  const safari =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 Version/18.3 Mobile/15E148 Safari/604.1';
  let checks = 0;
  async function request(
    method,
    path,
    body,
    token,
    status = 200,
    agent = chrome,
  ) {
    const r = await fetch(api + path, {
      method,
      headers: {
        'User-Agent': agent,
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
  async function login(
    provider,
    fixture,
    password,
    navegadorId,
    agent = chrome,
  ) {
    const flow = await start(provider);
    const params = await callback(flow, fixture);
    return {
      flow,
      code: params.get('codigo'),
      result: await request(
        'POST',
        '/auth/social/exchange',
        {
          codigo: params.get('codigo'),
          verificador: flow.verifier,
          ...(password ? { passwordActual: password } : {}),
          ...(navegadorId ? { navegadorId } : {}),
        },
        null,
        200,
        agent,
      ),
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
  const browserId = randomUUID();
  const otherBrowserId = randomUUID();
  const google = await login('google', 'google-new', null, browserId);
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
  const repeated = await login('google', 'google-new', null, browserId);
  assert.equal(repeated.result.usuario.id, google.result.usuario.id);
  assert.equal(repeated.result.nuevo, false);
  await request('GET', '/me', null, google.result.accessToken, 401);
  await request(
    'POST',
    '/auth/refresh',
    { refreshToken: google.result.refreshToken },
    null,
    401,
  );
  const otherBrowser = await login(
    'google',
    'google-new',
    null,
    otherBrowserId,
    safari,
  );
  await request('GET', '/me', null, repeated.result.accessToken);
  let sessions = await request(
    'GET',
    '/me/sessions',
    null,
    repeated.result.accessToken,
  );
  assert.equal(
    sessions.length,
    2,
    'Dos navegadores bajo la misma IP siguen siendo independientes.',
  );
  assert.equal(sessions.filter((session) => session.actual).length, 1);
  assert.equal(
    sessions.find((session) => session.actual).dispositivo,
    'Chrome en Windows',
  );
  assert.equal(
    sessions.find((session) => !session.actual).dispositivo,
    'Safari en iPhone',
  );
  assert.ok(
    sessions.every(
      (session) =>
        !('navegadorId' in session) &&
        !('refreshTokenHash' in session) &&
        !('userAgent' in session),
    ),
  );
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
    navegadorId: browserId,
  });
  assert.notEqual(second.usuario.id, google.result.usuario.id);
  await request('GET', '/me', null, repeated.result.accessToken);
  const toLink = await start('facebook', repeated.result.accessToken);
  const linkParams = await callback(toLink, 'facebook-no-email');
  const linked = await request('POST', '/auth/social/exchange', {
    codigo: linkParams.get('codigo'),
    verificador: toLink.verifier,
    navegadorId: browserId,
  });
  assert.equal(linked.usuario.id, google.result.usuario.id);
  assert.equal(linked.usuario.email, 'social@example.test');
  await request('GET', '/me', null, repeated.result.accessToken, 401);
  await request('GET', '/me', null, otherBrowser.result.accessToken);
  const fbLogin = await login('facebook', 'facebook-no-email');
  assert.equal(fbLogin.result.usuario.id, google.result.usuario.id);
  await request('DELETE', '/me/social/facebook', null, linked.accessToken);
  await request('GET', '/me', null, otherBrowser.result.accessToken, 401); // Se cerraron las otras sesiones.
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
  // Contraseña y Google comparten la misma regla de dispositivo.
  const loginBody = {
    email: 'admin@example.test',
    password: ctx.adminPassword,
  };
  const passwordFirst = await request('POST', '/auth/login', {
    ...loginBody,
    navegadorId: browserId,
  });
  const mixed = await login('google', 'google-admin', null, browserId);
  await request('GET', '/me', null, passwordFirst.accessToken, 401);
  const [raceA, raceB] = await Promise.all([
    request('POST', '/auth/login', { ...loginBody, navegadorId: browserId }),
    request('POST', '/auth/login', { ...loginBody, navegadorId: browserId }),
  ]);
  await request('GET', '/me', null, mixed.result.accessToken, 401);
  const active = await request('POST', '/auth/login', {
    ...loginBody,
    navegadorId: browserId,
  });
  await request('GET', '/me', null, raceA.accessToken, 401);
  await request('GET', '/me', null, raceB.accessToken, 401);
  sessions = await request('GET', '/me/sessions', null, active.accessToken);
  assert.equal(sessions.filter((session) => session.actual).length, 1);
  const oldId = sessions.find((session) => !session.actual).id;
  await ctx.client.query(
    "UPDATE sesiones_usuario SET creado_en=now()-interval '31 days', expira_en=now()-interval '1 second' WHERE id=$1",
    [oldId],
  );
  sessions = await request('GET', '/me/sessions', null, active.accessToken);
  assert.ok(!sessions.some((session) => session.id === oldId));
  const closed = await request(
    'POST',
    '/me/sessions/revoke-others',
    null,
    active.accessToken,
  );
  assert.equal(closed.cerradas, sessions.length - 1);
  sessions = await request('GET', '/me/sessions', null, active.accessToken);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].actual, true);
  await request('GET', '/me', null, linked.accessToken); // El usuario no puede cerrar sesiones ajenas.
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

// Ejercita empresas, campañas y operaciones ficticias exclusivamente en la BD desechable.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');

module.exports = async function commerce(ctx) {
  const api = ctx.base + '/api/v1';
  let checks = 0;
  async function request(method, path, body, token, expected = 200) {
    const response = await fetch(api + path, {
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
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json')
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());
    assert.equal(
      response.status,
      expected,
      method + ' ' + path + ': ' + (data.message || 'respuesta inesperada'),
    );
    checks++;
    return data;
  }
  async function person(name) {
    const email =
        name.toLowerCase().replace(/[^a-z0-9]/g, '') + '@example.test',
      password = 'Demo-empresa-segura-2026!';
    const result = await request(
      'POST',
      '/auth/register',
      { nombre: name, email, password },
      null,
      201,
    );
    // Fixture autorizada de esta prueba aislada; la verificación de correo se
    // prueba por separado con su buzón privado y tokens de un solo uso.
    await ctx.client.query(
      "UPDATE usuarios SET estado='activo',email_verificado_en=now() WHERE id=$1",
      [result.usuario.id],
    );
    return {
      ...(await request('POST', '/auth/login', { email, password })),
      id: result.usuario.id,
    };
  }
  const admin = await request('POST', '/auth/login', {
    email: 'admin@example.test',
    password: ctx.adminPassword,
  });
  const seller = await person('Empresa de prueba'),
    other = await person('Otra persona');
  const token = seller.accessToken;
  const data = {
    nombre: 'Tienda de la comunidad',
    razonSocial: 'Empresa demostrativa',
    ruc: 'DEMO-UNIREd-001',
    emailComercial: 'negocio@example.test',
    telefono: '88881234',
    descripcion: 'Libros y materiales de estudio para la comunidad.',
    ciudad: 'Managua',
  };
  const company = await request('POST', '/me/businesses', data, token, 201);
  assert.equal(company.estado, 'pendiente');
  await request(
    'GET',
    '/me/businesses/' + company.id,
    null,
    other.accessToken,
    403,
  );
  await request('GET', '/admin/businesses', null, token, 403);
  await request(
    'PATCH',
    '/admin/businesses/' + company.id + '/review',
    { estado: 'aprobada', motivo: 'Validación de afiliación demostrativa' },
    token,
    403,
  );
  const plans = await request('GET', '/business/plans');
  assert.equal(plans.length, 3);
  const checkout = {
    concepto: 'suscripcion_empresa',
    recursoId: company.id,
    planId: plans[0].id,
    clienteId: randomUUID(),
    importe: plans[0].precioMensual,
  };
  await request('POST', '/demo/checkout', checkout, token, 403);
  await request(
    'PATCH',
    '/admin/businesses/' + company.id + '/review',
    { estado: 'aprobada', motivo: 'Validación de afiliación demostrativa' },
    admin.accessToken,
  );
  const abortEvents = new AbortController();
  try {
    const stream = await fetch(api + '/me/events?afterId=0', {
      headers: { Authorization: 'Bearer ' + token },
      signal: abortEvents.signal,
    });
    assert.equal(stream.status, 200);
    assert.ok(stream.headers.get('content-type').includes('text/event-stream'));
    const reader = stream.body.getReader();
    let received = '';
    while (!received.includes('\n\n')) {
      const next = await reader.read();
      if (next.done) break;
      received += new TextDecoder().decode(next.value);
    }
    assert.ok(received.includes('notifications'));
    assert.ok(received.includes('empresa'));
    checks++;
  } finally {
    abortEvents.abort();
  }
  await request(
    'POST',
    '/demo/checkout',
    { ...checkout, numeroTarjeta: '4111111111111111' },
    token,
    400,
  );
  const paid = await request('POST', '/demo/checkout', checkout, token, 201);
  const repeated = await request(
    'POST',
    '/demo/checkout',
    checkout,
    token,
    201,
  );
  assert.equal(paid.pago.id, repeated.pago.id);
  assert.equal(paid.simulado, true);
  assert.equal(paid.pago.estado, 'simulado');
  assert.equal(
    (
      await ctx.client.query(
        'SELECT count(*)::int AS total FROM pagos_demo WHERE usuario_id=$1',
        [seller.id],
      )
    ).rows[0].total,
    1,
  );
  await request(
    'POST',
    '/demo/checkout',
    { ...checkout, clienteId: randomUUID() },
    token,
    409,
  );
  await request('POST', '/demo/checkout', checkout, other.accessToken, 403);
  async function upload(purpose) {
    const photo = await sharp({
      create: { width: 160, height: 90, channels: 3, background: '#0075c9' },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append('proposito', purpose);
    form.append('file', new Blob([photo]), 'banner.png');
    return request('POST', '/files', form, token, 201);
  }
  const banner = await upload('imagen_anuncio');
  const campaignBody = {
    titulo: 'Materiales para tus clases',
    descripcion:
      'Una campaña de prueba, sin publicidad contratada ni cobros reales.',
    bannerArchivoId: banner.id,
    enlace: 'https://example.com/catalogo',
    estado: 'activa',
    iniciaEn: new Date(Date.now() - 1000).toISOString(),
    terminaEn: new Date(Date.now() + 3 * 86400000).toISOString(),
  };
  const campaign = await request(
    'POST',
    '/me/businesses/' + company.id + '/campaigns',
    campaignBody,
    token,
    201,
  );
  assert.equal((await request('GET', '/campaigns')).items[0].id, campaign.id);
  await request('GET', '/files/' + banner.id + '/thumbnail');
  await request(
    'POST',
    '/me/businesses/' + company.id + '/campaigns',
    campaignBody,
    token,
    409,
  );
  await request(
    'PATCH',
    '/me/businesses/' + company.id + '/campaigns/' + campaign.id,
    { ...campaignBody, estado: 'pausada' },
    token,
  );
  assert.equal((await request('GET', '/campaigns')).total, 0);
  await request('GET', '/files/' + banner.id + '/thumbnail', null, null, 403);
  await request(
    'GET',
    '/files/' + banner.id + '/thumbnail',
    null,
    admin.accessToken,
  );
  await request(
    'PATCH',
    '/me/businesses/' + company.id + '/campaigns/' + campaign.id,
    campaignBody,
    token,
  );
  await request(
    'POST',
    '/admin/campaigns/' + campaign.id + '/block',
    { motivo: 'Campaña retirada en la prueba de moderación' },
    admin.accessToken,
    201,
  );
  assert.equal((await request('GET', '/campaigns')).total, 0);
  await request(
    'PATCH',
    '/me/businesses/' + company.id + '/campaigns/' + campaign.id,
    campaignBody,
    token,
    403,
  );
  await request('DELETE', '/files/' + banner.id, null, token, 409);
  const areas = await request('GET', '/areas');
  const quote = await request(
    'POST',
    '/tutorial-quote',
    { areaId: areas[0].id, modalidad: 'online', duracionMinutos: 60 },
    token,
    201,
  );
  assert.equal(quote.total, '180.00');
  assert.equal(quote.comision, '18.00');
  await request(
    'PATCH',
    '/admin/commerce/config',
    { comisionPorcentaje: '15.00' },
    token,
    403,
  );
  await request(
    'PATCH',
    '/admin/commerce/config',
    { comisionPorcentaje: '101.00' },
    admin.accessToken,
    400,
  );
  await request(
    'PATCH',
    '/admin/commerce/config',
    { comisionPorcentaje: '15.00' },
    admin.accessToken,
  );
  assert.equal(
    (
      await request(
        'POST',
        '/tutorial-quote',
        { areaId: areas[0].id, modalidad: 'online', duracionMinutos: 60 },
        token,
        201,
      )
    ).comision,
    '27.00',
  );
  await request(
    'POST',
    '/demo/checkout',
    { concepto: 'recarga_tutor', importe: '100.00', clienteId: randomUUID() },
    token,
    403,
  );
  // Acreditación por el flujo real: solicitud, imagen de evidencia, envío y aprobación.
  const evidence = await upload('evidencia_tutor');
  const application = await request(
    'POST',
    '/me/tutor-applications',
    { areaId: areas[0].id },
    token,
    201,
  );
  await request(
    'POST',
    '/me/tutor-applications/' + application.id + '/documents',
    {
      archivoId: evidence.id,
      tipo: 'certificado',
      versionLock: application.versionLock,
    },
    token,
    201,
  );
  const current = await request(
    'GET',
    '/me/tutor-applications/' + application.id,
    null,
    token,
  );
  const sent = await request(
    'POST',
    '/me/tutor-applications/' + application.id + '/submit',
    { versionLock: current.versionLock },
    token,
    201,
  );
  const claimed = await request(
    'POST',
    '/admin/tutor-applications/' + application.id + '/claim',
    { versionLock: sent.versionLock },
    admin.accessToken,
    201,
  );
  await request(
    'POST',
    '/admin/tutor-applications/' + application.id + '/decision',
    {
      versionLock: claimed.versionLock,
      envioId: sent.envioId,
      decision: 'aprobada',
      motivo: 'Evidencias verificadas para la prueba',
    },
    admin.accessToken,
    201,
  );
  const topup = {
    concepto: 'recarga_tutor',
    importe: '250.00',
    clienteId: randomUUID(),
  };
  const first = await request('POST', '/demo/checkout', topup, token, 201);
  const again = await request('POST', '/demo/checkout', topup, token, 201);
  assert.equal(first.pago.id, again.pago.id);
  const wallet = await request('GET', '/me/wallet', null, token);
  assert.equal(wallet.saldoDemo, '250.00');
  assert.equal(wallet.movimientos.length, 1);
  await request(
    'POST',
    '/demo/checkout',
    { ...topup, importe: '100.00' },
    token,
    409,
  );
  const categories = await request('GET', '/categories');
  const listing = await request(
    'POST',
    '/me/listings',
    {
      categoriaId: categories[0].id,
      titulo: 'Libro universitario de prueba',
      descripcion: 'Publicación real de prueba para el destacado simulado',
      precioBase: '100.00',
      tipoPrecio: 'fijo',
      condicion: 'usado',
    },
    token,
    201,
  );
  await request(
    'POST',
    '/me/listings/' + listing.id + '/images',
    { archivoId: banner.id, orden: 1 },
    token,
    201,
  );
  await request(
    'PATCH',
    '/me/listings/' + listing.id + '/state',
    { estado: 'publicado', versionLock: listing.versionLock },
    token,
  );
  const promotion = {
    concepto: 'destacar_anuncio',
    recursoId: listing.id,
    importe: '50.00',
    clienteId: randomUUID(),
  };
  await request(
    'POST',
    '/demo/checkout',
    { ...promotion, importe: '1.00' },
    token,
    409,
  );
  await request('POST', '/demo/checkout', promotion, token, 201);
  assert.equal((await request('GET', '/highlights')).items[0].id, listing.id);
  await request(
    'DELETE',
    '/me/businesses/' + company.id + '/subscription',
    null,
    token,
  );
  assert.equal(
    (await request('GET', '/me/businesses/' + company.id, null, token))
      .suscripciones[0].estado,
    'cancelada',
  );
  const columns = (
    await ctx.client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='pagos_demo'",
    )
  ).rows;
  assert.ok(
    columns.every(
      (row) =>
        !/(tarjeta|cvv|vencimiento|titular|marca)/i.test(row.column_name),
    ),
  );
  console.log(
    'OK: ' +
      checks +
      ' solicitudes de empresas, planes, campañas, destacados, cuotas y recargas simuladas. Sin datos bancarios persistidos.',
  );
  return { admin, seller, other, listing, token, areas, banner, categories };
};

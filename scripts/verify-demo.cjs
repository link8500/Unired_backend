// Comprueba la muestra local mediante HTTP real. No imprime contraseñas ni tokens.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const sharp = require('sharp');
const base = 'http://127.0.0.1:3000/api/v1';
let checks = 0;
async function request(method, route, token, body, expected = 200) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const text = await response.text();
  assert.equal(response.status, expected, method + ' ' + route);
  checks++;
  return text ? JSON.parse(text) : null;
}
async function main() {
  const text = await fs.readFile(process.argv[2], 'utf8');
  const accounts = [
    ...text.matchAll(/Correo: ([^\r\n]+)\r?\nContraseña: ([^\r\n]+)/g),
  ];
  const login = async (email) => {
    const c = accounts.find((x) => x[1] === email);
    assert(c, 'No se encontró la cuenta de muestra.');
    return request('POST', '/auth/login', undefined, {
      email: c[1],
      password: c[2],
    });
  };
  await request('GET', '/health');
  const admin = await login('admin@demo.unired.test');
  const student = await login('sofia@demo.unired.test');
  const tutor = await login('daniela@demo.unired.test');
  const a = admin.accessToken,
    s = student.accessToken,
    t = tutor.accessToken;
  const [me, adminMe, catalog] = await Promise.all([
    request('GET', '/me', s),
    request('GET', '/me', a),
    request('GET', '/listings?limit=30'),
  ]);
  assert(adminMe.roles.includes('administrador'));
  assert(!me.roles.includes('administrador'));
  for (const route of [
    '/admin/users',
    '/admin/dashboard',
    '/admin/listings',
    '/admin/courses',
    '/admin/tutor-applications',
    '/admin/workspace/sessions',
    '/admin/reports',
  ])
    await request('GET', route, a);
  const analytics = await request('GET', '/admin/analytics?days=30', a);
  assert(!('actividadReciente' in analytics));
  await request('GET', '/admin/users', s, undefined, 403);
  const courses = await request('GET', '/courses', s);
  assert(courses.total >= 6 && catalog.total >= 12);
  const learning = await request('GET', '/me/enrollments', s);
  assert(learning.items.length > 0);
  const own = await request('GET', '/me/courses', t);
  assert(own.items.length > 0);
  for (const route of [
    '/me/favorites',
    '/me/conversations',
    '/me/notifications',
  ])
    await request('GET', route, s);
  const ownCourse = await request('GET', '/me/courses/' + own.items[0].id, t);
  const course = await request('GET', '/courses/' + courses.items[0].id, s);
  assert(course.titulo);
  // Comprobar los bytes reales, no solo la fila de metadatos del catálogo.
  const imageId = catalog.items.find(
    (x) => x.portadaArchivoId,
  )?.portadaArchivoId;
  assert(imageId);
  const image = await fetch(base + '/files/' + imageId + '/thumbnail');
  assert.equal(image.status, 200);
  assert((await image.arrayBuffer()).byteLength > 100);
  checks++;
  const content = await request('GET', '/me/courses/' + ownCourse.id, t);
  const videoLesson = (content.lecciones || []).find((l) => l.videoArchivoId);
  assert(
    videoLesson,
    'El curso de muestra debe incluir un video reproducible.',
  );
  {
    const videoTicket = await request(
      'POST',
      '/files/' + videoLesson.videoArchivoId + '/access',
      t,
      undefined,
      201,
    );
    const videoUrl = new URL(videoTicket.url, 'http://127.0.0.1:3000');
    const video = await fetch(videoUrl, { headers: { Range: 'bytes=0-1023' } });
    assert([200, 206].includes(video.status));
    assert((await video.arrayBuffer()).byteLength > 0);
    checks++;
  }
  // Las imágenes se suben como borradores privados, sin alterar el perfil.
  const uploaded = [];
  const before = await request('GET', '/me', s);
  try {
    for (const purpose of ['avatar', 'banner_perfil']) {
      const bytes = await sharp({
        create: { width: 80, height: 60, channels: 3, background: '#0875C9' },
      })
        .png()
        .toBuffer();
      const body = new FormData();
      body.append('proposito', purpose);
      body.append(
        'file',
        new Blob([bytes], { type: 'image/png' }),
        'comprobacion.png',
      );
      uploaded.push(await request('POST', '/files', s, body, 201));
    }
    const draft = await request('GET', '/me', s);
    assert.equal(draft.perfil.avatarArchivoId, before.perfil.avatarArchivoId);
    assert.equal(draft.perfil.bannerArchivoId, before.perfil.bannerArchivoId);
    await request('PATCH', '/me', s, {
      nombre: before.nombre,
      avatarArchivoId: uploaded[0].id,
      bannerArchivoId: uploaded[1].id,
    });
    const saved = await request('GET', '/me', s);
    assert.equal(saved.perfil.avatarArchivoId, uploaded[0].id);
    assert.equal(saved.perfil.bannerArchivoId, uploaded[1].id);
    await request(
      'PATCH',
      '/me',
      s,
      {
        nombre: 'No debe guardarse',
        avatarArchivoId: adminMe.perfil.avatarArchivoId,
      },
      403,
    );
    assert.equal((await request('GET', '/me', s)).nombre, before.nombre);
  } finally {
    await request('PATCH', '/me', s, {
      avatarArchivoId: before.perfil.avatarArchivoId,
      bannerArchivoId: before.perfil.bannerArchivoId,
    });
    for (const file of uploaded)
      await request('DELETE', '/files/' + file.id, s);
  }
  // Leer la ficha no crea chats. El primer contacto confirmado es idempotente.
  const listing = catalog.items.find(
    (x) => Number(x.vendedorId) !== Number(me.id) && x.estado === 'publicado',
  );
  assert(listing);
  const beforeInbox = await request('GET', '/me/conversations', s);
  const contact = await request(
    'GET',
    '/listings/' + listing.id + '/contact',
    s,
  );
  const afterInbox = await request('GET', '/me/conversations', s);
  assert.equal(beforeInbox.total, afterInbox.total);
  if (!contact.mensajeEnviado) {
    const inquiryBody = {
      clienteId: crypto.randomUUID(),
      contenido: 'Consulta técnica de demostración: ¿sigue disponible?',
    };
    const initial = await request(
      'POST',
      '/listings/' + listing.id + '/inquiry',
      s,
      inquiryBody,
      201,
    );
    const repeat = await request(
      'POST',
      '/listings/' + listing.id + '/inquiry',
      s,
      inquiryBody,
      201,
    );
    const otherTab = await request(
      'POST',
      '/listings/' + listing.id + '/inquiry',
      s,
      { ...inquiryBody, clienteId: crypto.randomUUID() },
      201,
    );
    assert.equal(initial.mensaje.id, repeat.mensaje.id);
    assert.equal(initial.mensaje.id, otherTab.mensaje.id);
    const history = await request(
      'GET',
      '/conversations/' + initial.conversacionId + '/messages',
      s,
    );
    assert.equal(history.total, 1);
    assert(
      (await request('GET', '/listings/' + listing.id + '/contact', s))
        .mensajeEnviado,
    );
  } else {
    const beforeMessages = await request(
      'GET',
      '/conversations/' + contact.conversacionId + '/messages',
      s,
    );
    await request(
      'POST',
      '/listings/' + listing.id + '/inquiry',
      s,
      {
        clienteId: crypto.randomUUID(),
        contenido: 'Consulta técnica de demostración: ¿sigue disponible?',
      },
      201,
    );
    const afterMessages = await request(
      'GET',
      '/conversations/' + contact.conversacionId + '/messages',
      s,
    );
    assert.equal(afterMessages.total, beforeMessages.total);
  }
  console.log(
    'OK: ' +
      checks +
      ' solicitudes HTTP reales; roles, catálogos, archivos, perfil, aprendizaje y contacto.',
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

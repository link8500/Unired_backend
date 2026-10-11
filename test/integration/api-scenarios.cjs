const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');

module.exports = async function scenarios(ctx) {
  const api = ctx.base + '/api/v1';
  let checks = 0;
  async function request(method, url, token, body, expected = 200) {
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    if (body !== undefined && !(body instanceof FormData))
      headers['Content-Type'] = 'application/json';
    const response = await fetch(url.startsWith('http') ? url : api + url, {
      method,
      headers,
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(90000),
    });
    checks++;
    assert.equal(
      response.status,
      expected,
      method +
        ' ' +
        url +
        ' devolvió ' +
        response.status +
        ', esperado ' +
        expected,
    );
    return response;
  }
  async function json(method, url, token, body, expected = 200) {
    return (await request(method, url, token, body, expected)).json();
  }
  async function verifyMail(email, purpose = 'verificar_email') {
    for (let attempt = 0; attempt < 120; attempt++) {
      const names = await fs.readdir(ctx.env.MAIL_OUTBOX_ROOT).catch(() => []);
      for (const name of names.reverse()) {
        const mail = JSON.parse(
          await fs.readFile(path.join(ctx.env.MAIL_OUTBOX_ROOT, name), 'utf8'),
        );
        if (mail.to === email && mail.text.includes(purpose + ': '))
          return mail.text.split(purpose + ': ')[1].split('\n')[0];
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error('No llegó el correo de prueba al buzón local.');
  }
  async function login(email, password) {
    return json('POST', '/auth/login', undefined, { email, password });
  }
  async function upload(
    token,
    purpose,
    bytes,
    filename = 'fixture.png',
    expected = 201,
  ) {
    const data = new FormData();
    data.append('proposito', purpose);
    data.append('file', new Blob([bytes]), filename);
    return json('POST', '/files', token, data, expected);
  }
  console.log('Probando cuentas, verificación y permisos...');
  const spec = await (await fetch(ctx.base + '/docs-json')).json();
  assert.ok(Object.keys(spec.paths).length > 70);
  assert.equal(await (await fetch(ctx.base + '/')).text(), 'Hello World!');
  await json('GET', '/me', undefined, undefined, 401);
  await json(
    'POST',
    '/auth/register',
    undefined,
    {
      nombre: 'Intento',
      email: 'intento@example.test',
      password: 'Clave-invalida-de-prueba',
      roles: ['administrador'],
    },
    400,
  );
  const people = {};
  for (const name of ['tutor', 'alumno', 'alumno2', 'intruso']) {
    const email = name + '@example.test';
    const password = 'Clave-prueba-' + name + '-12345';
    const registered = await json(
      'POST',
      '/auth/register',
      undefined,
      { nombre: name, email, password },
      201,
    );
    assert.equal(registered.usuario.estado, 'pendiente_email');
    if (name === 'tutor') {
      const pending = await login(email, password);
      await json(
        'POST',
        '/me/courses',
        pending.accessToken,
        { areaId: '1', titulo: 'Pendiente', descripcion: 'No debe publicar' },
        403,
      );
    }
    await json('POST', '/auth/verify-email', undefined, {
      token: await verifyMail(email),
    });
    const session = await login(email, password);
    people[name] = { ...session, email, password, id: registered.usuario.id };
  }
  const admin = await login('admin@example.test', ctx.adminPassword);
  const tutor = people.tutor;
  const student = people.alumno;
  const student2 = people.alumno2;
  const intruder = people.intruso;
  await json('GET', '/admin/users', student.accessToken, undefined, 403);
  await json(
    'PATCH',
    '/me',
    student.accessToken,
    { estado: 'activo', roles: ['administrador'] },
    400,
  );
  await json(
    'POST',
    '/auth/login',
    undefined,
    { email: tutor.email, password: 'incorrecta' },
    401,
  );
  await json('GET', '/admin/users', admin.accessToken);
  await json('PATCH', '/me', tutor.accessToken, {
    presentacion: 'Tutor de prueba',
    telefono: '55555555',
    telefonoPublico: false,
  });
  const profile = await json('GET', '/profiles/' + tutor.id);
  assert.equal(profile.email, undefined);
  assert.equal(profile.telefono, undefined);
  const areas = await json('GET', '/areas');
  const categories = await json('GET', '/categories');
  const areaId = String(areas[0].id);
  const otherArea = String(areas[1].id);
  const categoryId = String(categories[0].id);

  console.log('Probando archivos reales, privacidad y acreditación...');
  const png = await sharp({
    create: { width: 20, height: 12, channels: 3, background: '#1385ed' },
  })
    .png()
    .toBuffer();
  const evidence = await upload(tutor.accessToken, 'evidencia_tutor', png);
  assert.equal(evidence.estado, 'listo');
  assert.equal(evidence.storageKey, undefined);
  await request(
    'GET',
    '/files/' + evidence.id + '/content',
    undefined,
    undefined,
    403,
  );
  await request(
    'GET',
    '/files/' + evidence.id + '/content',
    intruder.accessToken,
    undefined,
    403,
  );
  await request('GET', '/files/' + evidence.id + '/content', tutor.accessToken);
  await upload(
    intruder.accessToken,
    'avatar',
    Buffer.from('archivo no es una imagen'),
    'falso.png',
    415,
  );
  const application = await json(
    'POST',
    '/me/tutor-applications',
    tutor.accessToken,
    { areaId },
    201,
  );
  await json(
    'POST',
    '/me/tutor-applications',
    tutor.accessToken,
    { areaId },
    409,
  );
  await json(
    'GET',
    '/me/tutor-applications/' + application.id,
    intruder.accessToken,
    undefined,
    403,
  );
  await json(
    'POST',
    '/me/tutor-applications/' + application.id + '/documents',
    tutor.accessToken,
    {
      archivoId: evidence.id,
      tipo: 'certificado',
      versionLock: application.versionLock,
    },
    201,
  );
  const current = await json(
    'GET',
    '/me/tutor-applications/' + application.id,
    tutor.accessToken,
  );
  const submitted = await json(
    'POST',
    '/me/tutor-applications/' + application.id + '/submit',
    tutor.accessToken,
    { versionLock: current.versionLock },
    201,
  );
  const claimed = await json(
    'POST',
    '/admin/tutor-applications/' + application.id + '/claim',
    admin.accessToken,
    { versionLock: submitted.versionLock },
    201,
  );
  await request('GET', '/files/' + evidence.id + '/content', admin.accessToken);
  const approved = await json(
    'POST',
    '/admin/tutor-applications/' + application.id + '/decision',
    admin.accessToken,
    {
      versionLock: claimed.versionLock,
      envioId: submitted.envioId,
      decision: 'aprobada',
      motivo: 'Evidencias de prueba verificadas',
    },
    201,
  );
  assert.equal(approved.estado, 'aprobada');
  await json(
    'POST',
    '/admin/tutor-applications/' + application.id + '/decision',
    admin.accessToken,
    {
      versionLock: claimed.versionLock,
      envioId: submitted.envioId,
      decision: 'aprobada',
      motivo: 'Reintento',
    },
    409,
  );
  const grants = await json('GET', '/me/tutor-grants', tutor.accessToken);
  assert.equal(grants.length, 1);
  const mine = await json(
    'POST',
    '/me/tutor-applications',
    admin.accessToken,
    { areaId: otherArea },
    201,
  );
  await json(
    'POST',
    '/admin/tutor-applications/' + mine.id + '/claim',
    admin.accessToken,
    { versionLock: mine.versionLock },
    403,
  );

  console.log(
    'Probando cursos, alcance de habilitación, progreso y notas privadas...',
  );
  const course = await json(
    'POST',
    '/me/courses',
    tutor.accessToken,
    {
      areaId,
      titulo: 'Curso API de prueba',
      descripcion: 'Curso grabado gratuito de prueba',
      modalidad: 'grabada',
    },
    201,
  );
  await json(
    'POST',
    '/me/courses/' + course.id + '/publish',
    tutor.accessToken,
    { versionLock: course.versionLock },
    400,
  );
  const section = await json(
    'POST',
    '/me/courses/' + course.id + '/sections',
    tutor.accessToken,
    { titulo: 'Introducción', orden: 1 },
    201,
  );
  const lesson = await json(
    'POST',
    '/me/courses/' + course.id + '/lessons',
    tutor.accessToken,
    {
      seccionId: section.id,
      titulo: 'Lección privada',
      tipo: 'texto',
      contenidoTexto: 'Contenido privado de prueba',
      orden: 1,
      publicada: true,
    },
    201,
  );
  const published = await json(
    'POST',
    '/me/courses/' + course.id + '/publish',
    tutor.accessToken,
    { versionLock: course.versionLock },
    201,
  );
  assert.equal(published.estado, 'publicada');
  const otherCourse = await json(
    'POST',
    '/me/courses',
    tutor.accessToken,
    {
      areaId: otherArea,
      titulo: 'Curso sin permiso',
      descripcion: 'Otra área sin habilitación',
    },
    201,
  );
  await json(
    'POST',
    '/me/courses/' + otherCourse.id + '/publish',
    tutor.accessToken,
    { versionLock: otherCourse.versionLock },
    403,
  );
  await json(
    'PATCH',
    '/me/courses/' + course.id,
    intruder.accessToken,
    { versionLock: published.versionLock, titulo: 'Ataque' },
    403,
  );
  await json(
    'GET',
    '/courses/' + course.id + '/lessons/' + lesson.id,
    undefined,
    undefined,
    401,
  );
  await json(
    'GET',
    '/courses/' + course.id + '/lessons/' + lesson.id,
    student.accessToken,
    undefined,
    403,
  );
  const enrollment = await json(
    'POST',
    '/courses/' + course.id + '/enrollments',
    student.accessToken,
    undefined,
    201,
  );
  assert.equal(enrollment.estado, 'activa');
  const same = await json(
    'POST',
    '/courses/' + course.id + '/enrollments',
    student.accessToken,
    undefined,
    201,
  );
  assert.equal(same.id, enrollment.id);
  const content = await json(
    'GET',
    '/courses/' + course.id + '/lessons/' + lesson.id,
    student.accessToken,
  );
  assert.equal(content.contenidoTexto, 'Contenido privado de prueba');
  await json(
    'PUT',
    '/me/enrollments/' + enrollment.id + '/progress/' + lesson.id,
    intruder.accessToken,
    { completada: true },
    403,
  );
  await json(
    'PUT',
    '/me/enrollments/' + enrollment.id + '/progress/' + lesson.id,
    student.accessToken,
    { completada: true },
  );
  await json(
    'POST',
    '/me/courses/' + course.id + '/students/' + enrollment.id + '/notes',
    tutor.accessToken,
    { comentario: 'NOTA PRIVADA', visibilidad: 'solo_tutor' },
    201,
  );
  await json(
    'POST',
    '/me/courses/' + course.id + '/students/' + enrollment.id + '/notes',
    tutor.accessToken,
    { comentario: 'Comentario compartido', visibilidad: 'alumno_y_tutor' },
    201,
  );
  const progress = await json(
    'GET',
    '/me/enrollments/' + enrollment.id,
    student.accessToken,
  );
  assert.equal(progress.porcentaje, 100);
  assert.equal(progress.seguimiento.length, 1);
  assert.ok(!JSON.stringify(progress).includes('NOTA PRIVADA'));
  await json(
    'GET',
    '/me/courses/' + course.id + '/students',
    admin.accessToken,
    undefined,
    403,
  );
  await json(
    'PUT',
    '/me/enrollments/' + enrollment.id + '/review',
    student.accessToken,
    { puntuacion: 5, comentario: 'Prueba' },
  );
  const question = await json(
    'POST',
    '/courses/' + course.id + '/lessons/' + lesson.id + '/questions',
    student.accessToken,
    { titulo: 'Duda', contenido: 'Pregunta de prueba' },
    201,
  );
  await json(
    'POST',
    '/questions/' + question.id + '/replies',
    tutor.accessToken,
    { contenido: 'Respuesta de prueba' },
    201,
  );
  await json(
    'GET',
    '/questions/' + question.id + '/replies',
    intruder.accessToken,
    undefined,
    403,
  );
  await json(
    'GET',
    '/questions/' + question.id + '/replies',
    student.accessToken,
  );

  console.log(
    'Probando videos válidos, miniaturas, recursos y enlaces temporales...',
  );
  const avatar = await upload(tutor.accessToken, 'avatar', png);
  await json('PUT', '/me/avatar', tutor.accessToken, { archivoId: avatar.id });
  await request('GET', '/files/' + avatar.id + '/content');
  const banner = await upload(tutor.accessToken, 'banner_perfil', png);
  await json('PUT', '/me/banner', tutor.accessToken, { archivoId: banner.id });
  const cover = await upload(tutor.accessToken, 'portada_curso', png);
  const currentCourse = await json(
    'GET',
    '/me/courses/' + course.id,
    tutor.accessToken,
  );
  await json('PATCH', '/me/courses/' + course.id, tutor.accessToken, {
    versionLock: currentCourse.versionLock,
    portadaArchivoId: cover.id,
  });
  const demo = await upload(tutor.accessToken, 'galeria_curso', png);
  await json(
    'POST',
    '/me/courses/' + course.id + '/gallery',
    tutor.accessToken,
    { archivoId: demo.id, orden: 1 },
    201,
  );
  await request('GET', '/files/' + demo.id + '/content');
  const resourceFile = await upload(tutor.accessToken, 'recurso_curso', png);
  await json(
    'POST',
    '/me/courses/' + course.id + '/lessons/' + lesson.id + '/resources',
    tutor.accessToken,
    { archivoId: resourceFile.id, titulo: 'Material privado' },
    201,
  );
  await request(
    'GET',
    '/files/' + resourceFile.id + '/content',
    intruder.accessToken,
    undefined,
    403,
  );
  await request(
    'GET',
    '/files/' + resourceFile.id + '/content',
    student.accessToken,
  );
  const videoPath = path.join(ctx.temporary, 'fixture.mp4');
  const ffmpeg =
    process.platform === 'win32'
      ? path.join(ctx.root, '.tools/ffmpeg/bin/ffmpeg.exe')
      : 'ffmpeg';
  execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=64x64:r=1',
      '-t',
      '2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y',
      videoPath,
    ],
    { windowsHide: true },
  );
  const video = await upload(
    tutor.accessToken,
    'video_leccion',
    await fs.readFile(videoPath),
    'fixture.mp4',
  );
  assert.equal(video.procesamiento, 'listo');
  assert.ok(video.duracionSegundos >= 2);
  const videoLesson = await json(
    'POST',
    '/me/courses/' + course.id + '/lessons',
    tutor.accessToken,
    {
      seccionId: section.id,
      titulo: 'Video privado',
      tipo: 'video',
      videoArchivoId: video.id,
      orden: 2,
      publicada: true,
    },
    201,
  );
  await request(
    'GET',
    '/files/' + video.id + '/content',
    intruder.accessToken,
    undefined,
    403,
  );
  const ticket = await json(
    'POST',
    '/files/' + video.id + '/access',
    student.accessToken,
    undefined,
    201,
  );
  const partial = await fetch(ctx.base + ticket.url, {
    headers: { Range: 'bytes=0-31' },
  });
  checks++;
  assert.equal(partial.status, 206);
  assert.equal((await partial.arrayBuffer()).byteLength, 32);
  assert.ok(partial.headers.get('content-range').startsWith('bytes 0-31/'));
  const wrongFile =
    '/api/v1/files/' +
    evidence.id +
    '/content' +
    ticket.url.slice(ticket.url.indexOf('?'));
  await request('GET', ctx.base + wrongFile, undefined, undefined, 401);
  await request('GET', '/me', ticket.url.split('ticket=')[1], undefined, 401);
  await json(
    'PUT',
    '/me/enrollments/' + enrollment.id + '/progress/' + videoLesson.id,
    student.accessToken,
    { posicionSegundos: video.duracionSegundos + 10 },
    400,
  );
  await json(
    'PUT',
    '/me/enrollments/' + enrollment.id + '/progress/' + videoLesson.id,
    student.accessToken,
    { posicionSegundos: video.duracionSegundos, completada: true },
  );
  await json('DELETE', '/files/' + video.id, tutor.accessToken, undefined, 409);

  console.log('Probando aforo concurrente de sesiones en vivo...');
  const liveCourse = await json(
    'POST',
    '/me/courses',
    tutor.accessToken,
    {
      areaId,
      titulo: 'Curso en vivo',
      descripcion: 'Sesión de prueba',
      modalidad: 'en_vivo',
    },
    201,
  );
  const session = await json(
    'POST',
    '/me/courses/' + liveCourse.id + '/sessions',
    tutor.accessToken,
    {
      titulo: 'Sesión única',
      inicioEn: new Date(Date.now() + 3600000).toISOString(),
      finEn: new Date(Date.now() + 7200000).toISOString(),
      capacidad: 1,
      enlaceReunion: 'https://example.test/reunion-privada',
    },
    201,
  );
  await json(
    'POST',
    '/me/courses/' + liveCourse.id + '/publish',
    tutor.accessToken,
    { versionLock: liveCourse.versionLock },
    201,
  );
  await json(
    'POST',
    '/courses/' + liveCourse.id + '/enrollments',
    student.accessToken,
    undefined,
    201,
  );
  await json(
    'POST',
    '/courses/' + liveCourse.id + '/enrollments',
    student2.accessToken,
    undefined,
    201,
  );
  const agenda = await json('GET', '/courses/' + liveCourse.id + '/sessions');
  assert.equal(agenda.items[0].enlaceReunion, undefined);
  const reservationUrl =
    api +
    '/courses/' +
    liveCourse.id +
    '/sessions/' +
    session.id +
    '/reservations';
  const reservations = await Promise.all(
    [student, student2].map((person) =>
      fetch(reservationUrl, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + person.accessToken },
      }),
    ),
  );
  checks += 2;
  assert.deepEqual(
    reservations.map((response) => response.status).sort(),
    [201, 409],
  );
  const winner = reservations[0].status === 201 ? student : student2;
  const authorizedAgenda = await json(
    'GET',
    '/courses/' + liveCourse.id + '/sessions',
    winner.accessToken,
  );
  assert.equal(
    authorizedAgenda.items[0].enlaceReunion,
    'https://example.test/reunion-privada',
  );
  await json('DELETE', '/me/reservations/' + session.id, winner.accessToken);

  console.log('Probando anuncios, ofertas, propiedad y conversaciones...');
  const marketImage = await upload(tutor.accessToken, 'imagen_anuncio', png);
  const listing = await json(
    'POST',
    '/me/listings',
    tutor.accessToken,
    {
      categoriaId: categoryId,
      titulo: 'Artículo de prueba',
      descripcion: 'No existe carrito ni cobro',
      tipoPrecio: 'fijo',
      precioBase: '100.00',
      descuentoPorcentaje: '10.00',
    },
    201,
  );
  await json(
    'POST',
    '/me/listings/' + listing.id + '/images',
    tutor.accessToken,
    { archivoId: evidence.id, orden: 1 },
    409,
  );
  await json(
    'POST',
    '/me/listings/' + listing.id + '/images',
    tutor.accessToken,
    { archivoId: marketImage.id, orden: 1 },
    201,
  );
  const visible = await json(
    'PATCH',
    '/me/listings/' + listing.id + '/state',
    tutor.accessToken,
    { estado: 'publicado', versionLock: listing.versionLock },
  );
  await json(
    'PATCH',
    '/me/listings/' + listing.id,
    intruder.accessToken,
    { versionLock: visible.versionLock, titulo: 'Robo' },
    403,
  );
  await json(
    'PATCH',
    '/me/listings/' + listing.id,
    tutor.accessToken,
    { versionLock: visible.versionLock, descuentoPorcentaje: '95.00' },
    400,
  );
  await request('GET', '/files/' + marketImage.id + '/content');
  await request('GET', '/files/' + marketImage.id + '/thumbnail');
  await json('PUT', '/me/favorites/' + listing.id, student.accessToken);
  await json('PUT', '/me/favorites/' + listing.id, student.accessToken);
  assert.equal(
    (await json('GET', '/me/favorites', student.accessToken)).total,
    1,
  );
  const post = await json(
    'POST',
    '/me/listings/' + listing.id + '/updates',
    tutor.accessToken,
    { contenido: 'Nueva información' },
    201,
  );
  await json(
    'PUT',
    '/me/listings/' + listing.id + '/updates/' + post.id,
    intruder.accessToken,
    { contenido: 'Ataque' },
    403,
  );
  const chats = await Promise.all([
    json(
      'POST',
      '/listings/' + listing.id + '/conversations',
      student.accessToken,
      undefined,
      201,
    ),
    json(
      'POST',
      '/listings/' + listing.id + '/conversations',
      student.accessToken,
      undefined,
      201,
    ),
  ]);
  assert.equal(chats[0].id, chats[1].id);
  const chat = chats[0];
  await json(
    'GET',
    '/conversations/' + chat.id + '/messages',
    intruder.accessToken,
    undefined,
    403,
  );
  await json(
    'GET',
    '/conversations/' + chat.id + '/messages',
    admin.accessToken,
    undefined,
    403,
  );
  const nonce = crypto.randomUUID();
  const messageBody = { clienteId: nonce, contenido: 'Mensaje privado' };
  const message = await json(
    'POST',
    '/conversations/' + chat.id + '/messages',
    student.accessToken,
    messageBody,
    201,
  );
  const retry = await json(
    'POST',
    '/conversations/' + chat.id + '/messages',
    student.accessToken,
    messageBody,
    201,
  );
  assert.equal(message.id, retry.id);
  await json(
    'POST',
    '/conversations/' + chat.id + '/messages',
    student.accessToken,
    { clienteId: nonce, contenido: 'Otro texto' },
    409,
  );
  await json(
    'POST',
    '/conversations/' + chat.id + '/messages',
    tutor.accessToken,
    { clienteId: crypto.randomUUID(), archivoId: evidence.id },
    409,
  );
  await json('PUT', '/conversations/' + chat.id + '/read', tutor.accessToken, {
    ultimoMensajeId: message.id,
  });
  await json('PUT', '/me/blocks/' + tutor.id, student.accessToken);
  await json(
    'POST',
    '/conversations/' + chat.id + '/messages',
    tutor.accessToken,
    { clienteId: crypto.randomUUID(), contenido: 'No debe enviarse' },
    403,
  );
  await json(
    'GET',
    '/conversations/' + chat.id + '/messages',
    student.accessToken,
  );
  await json('DELETE', '/me/blocks/' + tutor.id, student.accessToken);
  await json(
    'DELETE',
    '/conversations/' + chat.id + '/messages/' + message.id,
    student.accessToken,
  );
  const history = await json(
    'GET',
    '/conversations/' + chat.id + '/messages',
    tutor.accessToken,
  );
  assert.equal(history.items[0].contenido, null);
  assert.equal(history.items[0].archivoId, null);

  console.log(
    'Probando moderación, notificaciones y revocación de sesiones...',
  );
  const report = await json(
    'POST',
    '/reports',
    student.accessToken,
    { tipo: 'anuncio', recursoId: listing.id, motivo: 'Prueba de moderación' },
    201,
  );
  await json(
    'POST',
    '/admin/reports/' + report.id + '/claim',
    admin.accessToken,
    undefined,
    201,
  );
  await json(
    'POST',
    '/admin/reports/' + report.id + '/resolve',
    admin.accessToken,
    {
      estado: 'resuelta',
      resolucion: 'Bloqueo de prueba',
      accion: 'bloquear_anuncio',
    },
    201,
  );
  await json('GET', '/listings/' + listing.id, undefined, undefined, 404);
  await json(
    'PATCH',
    '/me/listings/' + listing.id + '/state',
    tutor.accessToken,
    { estado: 'publicado', versionLock: visible.versionLock + 1 },
    409,
  );
  await json(
    'POST',
    '/admin/listings/' + listing.id + '/restore',
    admin.accessToken,
    { motivo: 'Revisión completada' },
    201,
  );
  await json('GET', '/admin/dashboard', admin.accessToken);
  const analytics = await json(
    'GET',
    '/admin/analytics?days=7',
    admin.accessToken,
  );
  assert.equal(analytics.actividad.length, 7);
  assert.ok(analytics.cursosDemandados.length > 0);
  const notices = await json('GET', '/me/notifications', tutor.accessToken);
  assert.ok(notices.total > 0);
  await json('GET', '/admin/audit', admin.accessToken);
  const sseAbort = new AbortController();
  const sse = await fetch(api + '/me/events', {
    headers: { Authorization: 'Bearer ' + tutor.accessToken },
    signal: sseAbort.signal,
  });
  checks++;
  assert.equal(sse.status, 200);
  assert.ok(sse.headers.get('content-type').includes('text/event-stream'));
  const reader = sse.body.getReader();
  let eventText = '';
  for (
    let attempt = 0;
    attempt < 10 && !eventText.includes('data:');
    attempt++
  ) {
    const packet = await reader.read();
    assert.ok(!packet.done, 'El stream terminó antes del primer evento.');
    eventText += new TextDecoder().decode(packet.value);
  }
  assert.ok(eventText.includes('data:'));
  await reader.cancel();
  sseAbort.abort();
  await json('GET', '/me/events', undefined, undefined, 401);
  await json(
    'PUT',
    '/admin/users/' + admin.usuario.id + '/roles',
    admin.accessToken,
    { roles: ['usuario'], motivo: 'No debe retirar el último admin' },
    409,
  );
  await json('DELETE', '/me', admin.accessToken, undefined, 409);
  const refreshed = await json('POST', '/auth/refresh', undefined, {
    refreshToken: intruder.refreshToken,
  });
  await json(
    'POST',
    '/auth/refresh',
    undefined,
    { refreshToken: intruder.refreshToken },
    401,
  );
  await json('GET', '/me', refreshed.accessToken, undefined, 401);
  const newSession = await login(intruder.email, intruder.password);
  await json('POST', '/auth/logout', newSession.accessToken);
  await json('GET', '/me', newSession.accessToken, undefined, 401);
  await json('POST', '/auth/forgot-password', undefined, {
    email: intruder.email,
  });
  const resetToken = await verifyMail(intruder.email, 'recuperar_password');
  const replacement = 'Clave-recuperada-intruso-12345';
  await json('POST', '/auth/reset-password', undefined, {
    token: resetToken,
    password: replacement,
  });
  await json(
    'POST',
    '/auth/reset-password',
    undefined,
    { token: resetToken, password: replacement },
    400,
  );
  const recovered = await login(intruder.email, replacement);
  await json(
    'POST',
    '/me/change-email',
    recovered.accessToken,
    { email: tutor.email, passwordActual: replacement },
    409,
  );
  await json('POST', '/me/change-email', recovered.accessToken, {
    email: 'nuevo-intruso@example.test',
    passwordActual: replacement,
  });
  await json('GET', '/me', recovered.accessToken, undefined, 401);
  await json('POST', '/auth/verify-email', undefined, {
    token: await verifyMail('nuevo-intruso@example.test'),
  });
  await json('GET', '/profiles/' + intruder.id);
  await json(
    'PATCH',
    '/admin/tutor-grants/' + grants[0].id,
    admin.accessToken,
    { estado: 'revocada', motivo: 'Prueba de revocación' },
  );
  await json('GET', '/courses/' + course.id, undefined, undefined, 404);
  await request('GET', ctx.base + ticket.url, undefined, undefined, 403);
  const preserved = await json(
    'GET',
    '/me/enrollments/' + enrollment.id,
    student.accessToken,
  );
  assert.equal(preserved.completadas, 2);
  console.log(
    'Comprobaciones HTTP exitosas: ' +
      checks +
      '. Sin usar datos ni credenciales reales.',
  );
};

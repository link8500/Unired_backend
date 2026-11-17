// Reutiliza la preparación comercial y comprueba decisiones con personas y material reales de prueba.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');

module.exports = async function interactions(ctx) {
  const { admin, seller, other, listing, token, areas } =
    await require('./commercial.cjs')(ctx);
  const student = other.accessToken;
  const api = ctx.base + '/api/v1';
  let checks = 0;
  async function request(method, path, body, auth, expected = 200) {
    const response = await fetch(api + path, {
      method,
      headers: {
        ...(auth ? { Authorization: 'Bearer ' + auth } : {}),
        ...(body && !(body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
    });
    const result = await response.json();
    assert.equal(
      response.status,
      expected,
      method + ' ' + path + ': ' + (result.message || 'respuesta inesperada'),
    );
    checks++;
    return result;
  }
  await request(
    'POST',
    '/listings/' + listing.id + '/conversations',
    null,
    student,
    403,
  );
  const proposal = {
    clienteId: randomUUID(),
    importe: '80.00',
    mensaje: 'Me interesa el libro para mi carrera.',
    tipo: 'compra',
  };
  const offer = await request(
    'POST',
    '/listings/' + listing.id + '/offers',
    proposal,
    student,
    201,
  );
  assert.equal(offer.estado, 'pendiente');
  assert.equal(
    (
      await request(
        'GET',
        '/listings/' + listing.id + '/contact',
        null,
        student,
      )
    ).conversacionId,
    null,
  );
  await request(
    'PATCH',
    '/me/offers/' + offer.id,
    { estado: 'aceptada' },
    student,
    403,
  );
  const accepted = await request(
    'PATCH',
    '/me/offers/' + offer.id,
    { estado: 'aceptada' },
    token,
  );
  const conversationId = accepted.conversacionId;
  assert.ok(conversationId);
  await request(
    'POST',
    '/conversations/' + conversationId + '/messages',
    { clienteId: randomUUID(), contenido: 'Gracias por aceptar mi oferta.' },
    student,
    201,
  );
  await request(
    'POST',
    '/conversations/' + conversationId + '/messages',
    { clienteId: randomUUID(), contenido: 'Podemos acordar la entrega aquí.' },
    token,
    201,
  );
  assert.equal(
    (await request('GET', '/me/conversations', null, student)).items[0]
      .recursoTitulo,
    listing.titulo,
  );
  await request(
    'GET',
    '/conversations/' + conversationId + '/messages',
    null,
    admin.accessToken,
    403,
  );
  await request(
    'PATCH',
    '/me/offers/' + offer.id,
    { estado: 'finalizada' },
    student,
  );
  assert.equal(
    (await request('GET', '/me/conversations', null, student)).total,
    0,
  );
  await request(
    'GET',
    '/conversations/' + conversationId + '/messages',
    null,
    student,
    403,
  );
  assert.equal(
    (await request('GET', '/conversations/' + conversationId, null, student))
      .estado,
    'cerrada',
  );
  await request(
    'POST',
    '/me/offers/' + offer.id + '/review',
    { puntuacion: 5, comentario: 'Buen trato y entrega acordada.' },
    student,
    201,
  );
  await request(
    'POST',
    '/me/offers/' + offer.id + '/review',
    { puntuacion: 4, comentario: 'La comunicación fue clara.' },
    token,
    201,
  );
  await request(
    'POST',
    '/me/offers/' + offer.id + '/review',
    { puntuacion: 5, comentario: 'No debe duplicarse.' },
    student,
    409,
  );
  assert.equal(
    (await request('GET', '/profiles/' + seller.id)).puntuacion,
    '5.00',
  );
  const reviews = await request(
    'GET',
    '/admin/workspace/peer-reviews',
    null,
    admin.accessToken,
  );
  assert.equal(reviews.total, 2);
  const buyerReview =
    reviews.items.find((r) => r.autorNombre === other.nombre) ||
    reviews.items.find((r) => r.puntuacion === 5);
  await request(
    'PATCH',
    '/admin/workspace/peer-reviews/' + buyerReview.id + '/state',
    { estado: 'oculta', motivo: 'Contenido revisado por moderación.' },
    student,
    403,
  );
  await request(
    'PATCH',
    '/admin/workspace/peer-reviews/' + buyerReview.id + '/state',
    { estado: 'oculta', motivo: 'Contenido revisado por moderación.' },
    admin.accessToken,
  );
  assert.equal((await request('GET', '/profiles/' + seller.id)).resenas, 0);
  await request(
    'PATCH',
    '/admin/workspace/peer-reviews/' + buyerReview.id + '/state',
    {
      estado: 'visible',
      motivo: 'La revisión confirma que cumple las reglas.',
    },
    admin.accessToken,
  );
  const publicReviews = await request(
    'GET',
    '/profiles/' + seller.id + '/reviews',
  );
  assert.equal(publicReviews.total, 1);
  assert.equal(
    publicReviews.items[0].comentario,
    'Buen trato y entrega acordada.',
  );
  assert.equal(publicReviews.items[0].ofertaId, undefined);
  assert.equal(publicReviews.items[0].email, undefined);
  const body = {
    areaId: areas[0].id,
    materia: 'Programación',
    tema: 'Comprender componentes y servicios',
    descripcion:
      'Necesito acompañamiento para organizar componentes y comprender sus dependencias.',
    modalidad: 'online',
    duracionMinutos: 60,
    precioConfirmado: '180.00',
  };
  await request(
    'POST',
    '/me/tutoring-requests',
    { ...body, precioConfirmado: '0.00' },
    student,
    409,
  );
  const ignored = await request(
    'POST',
    '/me/tutoring-requests',
    body,
    student,
    201,
  );
  assert.ok(
    (await request('GET', '/me/notifications', null, token)).items.some(
      (row) =>
        row.tipo === 'solicitud_tutoria' &&
        row.datos.solicitudId === ignored.id,
    ),
  );
  assert.ok(
    (
      await request(
        'GET',
        '/me/tutoring-requests?vista=disponibles',
        null,
        token,
      )
    ).items.some((row) => row.id === ignored.id),
  );
  await request(
    'POST',
    '/me/tutoring-requests/' + ignored.id + '/accept',
    null,
    student,
    403,
  );
  await request(
    'POST',
    '/me/tutoring-requests/' + ignored.id + '/ignore',
    null,
    token,
    201,
  );
  assert.equal(
    (
      await request(
        'GET',
        '/me/tutoring-requests?vista=disponibles',
        null,
        token,
      )
    ).total,
    0,
  );
  await request(
    'PATCH',
    '/me/tutoring-requests/' + ignored.id,
    { estado: 'cancelada' },
    student,
  );
  const help = await request(
    'POST',
    '/me/tutoring-requests',
    body,
    student,
    201,
  );
  const initialWallet = Number(
    (await request('GET', '/me/wallet', null, token)).saldoDemo,
  );
  const results = await Promise.all(
    [0, 1].map(() =>
      request(
        'POST',
        '/me/tutoring-requests/' + help.id + '/accept',
        null,
        token,
        201,
      ),
    ),
  );
  assert.equal(results[0].conversacionId, results[1].conversacionId);
  assert.equal(
    Number((await request('GET', '/me/wallet', null, token)).saldoDemo),
    initialWallet - 27,
  );
  const inbox = await request('GET', '/me/conversations', null, student);
  assert.equal(inbox.items[0].recursoTitulo, body.tema);
  await request(
    'POST',
    '/conversations/' + results[0].conversacionId + '/messages',
    { clienteId: randomUUID(), contenido: 'Ya podemos organizar la tutoría.' },
    token,
    201,
  );
  const photo = await sharp({
    create: { width: 120, height: 80, channels: 3, background: '#0075c9' },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append('proposito', 'portada_curso');
  form.append('file', new Blob([photo]), 'curso.png');
  const cover = await request('POST', '/files', form, token, 201);
  const course = await request(
    'POST',
    '/me/courses',
    {
      areaId: areas[0].id,
      titulo: 'Material de apoyo: componentes',
      descripcion:
        'Curso de apoyo con contenido original de prueba para el acompañamiento.',
      modalidad: 'grabada',
      nivel: 'inicial',
      precioBase: '0.00',
      moneda: 'NIO',
      portadaArchivoId: cover.id,
    },
    token,
    201,
  );
  const section = await request(
    'POST',
    '/me/courses/' + course.id + '/sections',
    { titulo: 'Primeros pasos', orden: 1 },
    token,
    201,
  );
  const lesson = await request(
    'POST',
    '/me/courses/' + course.id + '/lessons',
    {
      seccionId: section.id,
      titulo: 'Cómo organizar un componente',
      tipo: 'texto',
      contenidoTexto:
        'Un componente reúne la presentación y las acciones de una parte de la aplicación. Este es contenido de prueba propio para comprobar los permisos de lectura.',
      orden: 1,
      publicada: true,
      vistaPrevia: false,
    },
    token,
    201,
  );
  const draft = await request('GET', '/me/courses/' + course.id, null, token);
  const publishedCourse = await request(
    'POST',
    '/me/courses/' + course.id + '/publish',
    { versionLock: draft.versionLock },
    token,
    201,
  );
  assert.equal(publishedCourse.precioBase, '3.00');
  const computed = await request(
    'GET',
    '/me/courses/' + course.id,
    null,
    token,
  );
  assert.equal(computed.cotizacion.total, '3.00');
  const forged = await request(
    'PATCH',
    '/me/courses/' + course.id,
    {
      versionLock: computed.versionLock,
      precioBase: '999.00',
      descuentoPorcentaje: '90.00',
    },
    token,
  );
  assert.equal(forged.precioBase, '3.00');
  assert.equal(forged.descuentoPorcentaje, '0.00');
  await request(
    'GET',
    '/courses/' + course.id + '/lessons/' + lesson.id,
    null,
    student,
    403,
  );
  await request(
    'POST',
    '/me/tutoring-requests/' + help.id + '/material',
    { cursoId: course.id },
    token,
    201,
  );
  await request(
    'GET',
    '/courses/' + course.id + '/lessons/' + lesson.id,
    null,
    student,
  );
  await request(
    'PATCH',
    '/me/tutoring-requests/' + help.id,
    { estado: 'finalizada' },
    student,
  );
  await request(
    'GET',
    '/conversations/' + results[0].conversacionId + '/messages',
    null,
    student,
    403,
  );
  await request(
    'GET',
    '/courses/' + course.id + '/lessons/' + lesson.id,
    null,
    student,
  );
  await request(
    'POST',
    '/me/tutoring-requests/' + help.id + '/review',
    {
      puntuacion: 5,
      comentario: 'El material y el acompañamiento ayudaron mucho.',
    },
    student,
    201,
  );
  await request(
    'POST',
    '/me/tutoring-requests/' + help.id + '/review',
    {
      puntuacion: 5,
      comentario: 'Participó y realizó las prácticas propuestas.',
    },
    token,
    201,
  );
  const enrollment = (
    await request('GET', '/me/enrollments', null, student)
  ).items.find((row) => row.tutoriaId === course.id);
  const studentReview = await request(
    'POST',
    '/me/enrollments/' + enrollment.id + '/peer-review',
    { puntuacion: 5, comentario: 'Buen acompañamiento durante el curso.' },
    student,
    201,
  );
  await request(
    'POST',
    '/me/enrollments/' + enrollment.id + '/peer-review',
    { puntuacion: 5, comentario: 'Estudiante comprometido con las prácticas.' },
    token,
    201,
  );
  await request(
    'POST',
    '/me/enrollments/' + enrollment.id + '/peer-review',
    { puntuacion: 4, comentario: 'No duplicar la valoración.' },
    student,
    409,
  );
  assert.equal(
    (await request('GET', '/me/enrollments', null, student)).items.find(
      (row) => row.id === enrollment.id,
    ).resenaPropiaId,
    studentReview.id,
  );
  const students = await request(
    'GET',
    '/me/courses/' + course.id + '/students?estado=completada',
    null,
    token,
  );
  assert.ok(
    students.items.find((row) => row.id === enrollment.id).resenaPropiaId,
  );
  const history = await request('GET', '/me/tutoring-requests', null, student);
  assert.ok(history.items.some((row) => row.estado === 'cancelada'));
  assert.ok(history.items.some((row) => row.estado === 'finalizada'));
  const search = await request('GET', '/search?q=componentes');
  assert.equal(search.courses.total, 1);
  await request('GET', '/search?anioEstudio=16', null, null, 400);
  const rate = await request(
    'PATCH',
    '/admin/commerce/rates/' + areas[0].id,
    { precioMinutoOnline: '5.00' },
    admin.accessToken,
  );
  assert.equal(rate.precioMinutoOnline, '5.00');
  const quote = await request(
    'POST',
    '/tutorial-quote',
    { areaId: areas[0].id, modalidad: 'online', duracionMinutos: 60 },
    student,
    201,
  );
  assert.equal(quote.total, '300.00');
  assert.equal(quote.comision, '45.00');
  console.log(
    'OK: ' +
      checks +
      ' solicitudes adicionales de ofertas, chat condicionado, cierre, reputación, tutorías, notificaciones, material y búsqueda.',
  );
};

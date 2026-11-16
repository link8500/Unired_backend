// Restauración de datos de demostración exclusivamente para la base local.
// Requiere un respaldo PostgreSQL real antes de sustituir las cuentas.
require('dotenv/config');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const source = require('../dist/shared/base_datos/origen-datos').default;
const {
  PostgresStore,
} = require('../dist/shared/base_datos/postgres.database');
const { schema } = require('../dist/shared/base_datos/esquema');
const {
  ContrasenasScrypt,
} = require('../dist/shared/seguridad/criptografia.providers');
const {
  AlmacenamientoLocalAdapter,
} = require('../dist/shared/almacenamiento/almacenamiento-local.adapter');
const fixture = require('./demo/fixtures.cjs');

const ago = (days) => new Date(Date.now() - days * 86400000);
const later = (days) => ago(-days);
const run = crypto.randomUUID();
const storage = new AlmacenamientoLocalAdapter();
const credentials = [];
const people = fixture.people.map((person, i) => ({ ...person, index: i }));
const prepared = new Map();

async function prepareImage(name, input) {
  const bytes = await sharp(input).webp({ quality: 88 }).toBuffer();
  const key = 'demo/' + run + '/' + crypto.randomUUID() + '.webp';
  const filePath = storage.absolute(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
  // Las muestras pasan por el mismo antivirus y generador de miniaturas.
  await storage.scan(key);
  const thumbnail = await storage.thumbnail(key, 'demo/' + run + '/thumbnails');
  const dimensions = await sharp(bytes).metadata();
  prepared.set(name, {
    key,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest(),
    width: dimensions.width,
    height: dimensions.height,
    thumbnail,
    mime: 'image/webp',
    extension: 'webp',
  });
}
async function prepareVideo(name, imageName) {
  const poster = prepared.get(imageName);
  const key = 'demo/' + run + '/' + crypto.randomUUID() + '.mp4';
  const executable =
    process.platform === 'win32'
      ? path.resolve('.tools/ffmpeg/bin/ffmpeg.exe')
      : 'ffmpeg';
  execFileSync(
    executable,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-loop',
      '1',
      '-i',
      storage.absolute(poster.key),
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=mono',
      '-t',
      '9',
      '-r',
      '24',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      '-movflags',
      '+faststart',
      storage.absolute(key),
    ],
    { windowsHide: true, timeout: 60000, stdio: 'pipe' },
  );
  await storage.scan(key);
  const { duration } = await storage.probeVideo(key);
  const bytes = await fs.readFile(storage.absolute(key));
  prepared.set(name, {
    key,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest(),
    duration,
    mime: 'video/mp4',
    extension: 'mp4',
  });
}
async function storeFile(store, ownerId, purpose, name, title) {
  const input = prepared.get(name);
  assert(input, 'Falta preparar un archivo de muestra.');
  // Cada objeto físico tiene un único registro. Las lecciones del mismo tutor
  // pueden reutilizar su video, sin duplicar bytes ni romper la propiedad.
  const file = await store.insert('archivos', {
    propietarioId: ownerId,
    proposito: purpose,
    storageBucket: 'private-media',
    proveedor: 'local',
    extension: input.extension,
    storageKey: input.key,
    nombreOriginal: title + '.' + input.extension,
    mimeDetectado: input.mime,
    tamanoBytes: String(input.bytes),
    sha256: input.sha256,
    estado: 'listo',
    escaneo: 'limpio',
    procesamiento: input.duration ? 'listo' : 'no_aplica',
    anchoPx: input.width ?? null,
    altoPx: input.height ?? null,
    duracionSegundos: input.duration ?? null,
  });
  if (input.thumbnail) {
    const thumb = input.thumbnail;
    await store.insert('variantes_archivo', {
      archivoId: file.id,
      nombre: 'thumbnail',
      tipo: 'imagen',
      storageKey: thumb.key,
      mimeDetectado: 'image/webp',
      tamanoBytes: String(thumb.bytes),
      anchoPx: thumb.width,
      altoPx: thumb.height,
      estado: 'listo',
    });
  }
  return file;
}

async function main() {
  const args = process.argv.slice(2);
  const backupIndex = args.indexOf('--backup');
  const backupPath =
    backupIndex >= 0 ? path.resolve(args[backupIndex + 1] || '') : null;
  assert(
    args.includes('--reset-local-data') && backupPath,
    'Usa --reset-local-data --backup RUTA_AL_RESPALDO.dump. Este comando sustituye los datos locales.',
  );
  assert(
    (process.env.NODE_ENV || 'development') === 'development',
    'Las muestras solo se pueden cargar en development.',
  );
  assert(
    ['127.0.0.1', 'localhost', '::1'].includes(source.options.host) &&
      source.options.database === 'unired',
    'Solo se permite la base local unired.',
  );
  const backup = await fs.readFile(backupPath);
  assert(
    backup.length > 1000 && backup.subarray(0, 5).toString() === 'PGDMP',
    'Se requiere un respaldo válido en formato custom de pg_dump.',
  );
  const credentialPath = path.join(
    os.homedir(),
    'Downloads',
    'Credenciales-UniRed-demo-' + run.slice(0, 8) + '.txt',
  );
  await fs.access(path.dirname(credentialPath));
  await source.initialize();
  try {
    console.log(
      'Preparando imágenes, videos y documentos de muestra con antivirus...',
    );
    const passwords = new ContrasenasScrypt();
    for (const person of people) {
      person.password =
        'UniRed!' + crypto.randomBytes(15).toString('base64url');
      person.hash = await passwords.hash(person.password);
      await prepareImage('avatar-' + person.key, fixture.avatar(person));
      await prepareImage('banner-' + person.key, fixture.banner(person.color));
    }
    for (const [i, spec] of fixture.courses.entries()) {
      await prepareImage('course-' + i, fixture.cover(spec[2], spec[3]));
    }
    for (const person of people.filter((p) => p.area)) {
      await prepareImage(
        'evidence-' + person.key,
        fixture.svg(
          '<text x="65" y="100" font-family="Arial" font-size="22" fill="#0875C9">UNIRED · EXPEDIENTE DE MUESTRA</text><text x="65" y="230" font-family="Arial" font-size="38" fill="#172130">Documento de demostración</text><text x="65" y="310" font-family="Arial" font-size="26" fill="#747984">' +
            person.name +
            '</text><text x="65" y="435" font-family="Arial" font-size="20" fill="#D94E5B">SIN VALIDEZ ACADÉMICA NI LEGAL</text>',
        ),
      );
      const courseIndex = fixture.courses.findIndex((c) => c[0] === person.key);
      await prepareVideo('video-' + person.key, 'course-' + courseIndex);
    }
    for (const [i, spec] of fixture.listings.entries())
      await prepareImage('listing-' + i, fixture.product(spec));
    await prepareImage(
      'pending-evidence',
      fixture.svg(
        '<text x="60" y="230" font-size="40" font-family="Arial">Solicitud pendiente de muestra</text><text x="60" y="330" font-size="24" font-family="Arial" fill="#D94E5B">SIN VALIDEZ ACADÉMICA NI LEGAL</text>',
      ),
    );
    console.log(
      'Archivos verificados. Sustituyendo los datos en una transacción...',
    );
    const result = await source.transaction(async (manager) => {
      const store = new PostgresStore(manager);
      const keep = new Set(['roles', 'areas_tutoria', 'categorias_market']);
      const tables = Object.keys(schema).filter((table) => !keep.has(table));
      assert(tables.every((table) => /^[a-z_]+$/.test(table)));
      await manager.query(
        'TRUNCATE ' +
          tables.map((t) => '"' + t + '"').join(',') +
          ' RESTART IDENTITY',
      );
      const byKey = new Map();
      for (const person of people) {
        const user = await store.insert('usuarios', {
          nombre: person.name,
          email: person.email,
          estado: 'activo',
          emailVerificadoEn: ago(45),
          creadoEn: ago(48 - person.index * 3),
          edad:
            person.role === 'administrador' ? null : 21 + (person.index % 8),
        });
        person.id = user.id;
        byKey.set(person.key, person);
        await store.insert('credenciales_usuario', {
          usuarioId: user.id,
          passwordHash: person.hash,
        });
        await store.insert('usuario_roles', {
          usuarioId: user.id,
          rolCodigo: 'usuario',
        });
        if (person.role)
          await store.insert('usuario_roles', {
            usuarioId: user.id,
            rolCodigo: person.role,
          });
        const avatar = await storeFile(
          store,
          user.id,
          'avatar',
          'avatar-' + person.key,
          'Avatar de muestra',
        );
        const banner = await storeFile(
          store,
          user.id,
          'banner_perfil',
          'banner-' + person.key,
          'Portada de muestra',
        );
        await store.insert('perfiles_usuario', {
          usuarioId: user.id,
          presentacion: person.bio,
          telefono: '+505 0000 ' + String(1000 + person.index),
          telefonoPublico: false,
          pais: 'Nicaragua',
          departamento: person.city,
          ciudad: person.city,
          universidad:
            person.role === 'administrador'
              ? null
              : 'Universidad de demostración',
          sede:
            person.role === 'administrador' ? null : 'Recinto ' + person.city,
          carrera:
            person.role === 'administrador'
              ? null
              : person.major || 'Formación continua',
          anioEstudio:
            person.role === 'administrador' ? null : 2 + (person.index % 3),
          trabaja: person.works,
          ocupacion: person.occupation || null,
          areaProfesional: person.area ? 'Educación y acompañamiento' : null,
          avatarArchivoId: avatar.id,
          bannerArchivoId: banner.id,
        });
        credentials.push({
          nombre: person.name,
          email: person.email,
          rol: person.role || (person.area ? 'tutor' : 'usuario'),
          password: person.password,
        });
      }
      const areas = new Map(
        (await store.find('areas_tutoria', {})).map((a) => [a.codigo, a]),
      );
      const categories = new Map(
        (await store.find('categorias_market', {})).map((c) => [c.codigo, c]),
      );
      const admin = byKey.get('admin'),
        reviewer = byKey.get('reviewer');
      const grants = new Map();
      for (const tutor of people.filter((p) => p.area)) {
        assert(
          areas.has(tutor.area),
          'No está el catálogo del área ' + tutor.area,
        );
        const request = await store.insert('solicitudes_tutor', {
          tutorId: tutor.id,
          areaId: areas.get(tutor.area).id,
          estado: 'aprobada',
          asignadaA: reviewer.id,
          formacionAcademica:
            'Formación y certificado de demostración, sin validez académica.',
          experienciaDocente:
            'Ejemplo de experiencia para explorar la revisión de tutores.',
          especialidades: ['Fundamentos', 'Práctica guiada'],
          creadoEn: ago(35),
        });
        const file = await storeFile(
          store,
          tutor.id,
          'evidencia_tutor',
          'evidence-' + tutor.key,
          'Documento de demostración sin validez',
        );
        const document = await store.insert('documentos_solicitud', {
          solicitudId: request.id,
          tutorId: tutor.id,
          archivoId: file.id,
          grupoDocumento: crypto.randomUUID(),
          version: 1,
          tipo: 'certificado',
          descripcion: 'Muestra sintética, no acredita estudios.',
        });
        const submission = await store.insert('envios_solicitud', {
          solicitudId: request.id,
          numero: 1,
          enviadoEn: ago(34),
        });
        await store.insert('envio_documentos', {
          envioId: submission.id,
          documentoId: document.id,
          solicitudId: request.id,
        });
        const review = await store.insert('revisiones_tutor', {
          envioId: submission.id,
          solicitudId: request.id,
          revisorId: reviewer.id,
          decision: 'aprobada',
          motivo: 'Aprobación ficticia del expediente de demostración.',
          creadoEn: ago(33),
        });
        const grant = await store.insert('habilitaciones_tutor', {
          tutorId: tutor.id,
          areaId: areas.get(tutor.area).id,
          solicitudId: request.id,
          revisionId: review.id,
          validaDesde: ago(33),
          validaHasta: later(180),
          estado: 'vigente',
        });
        grants.set(tutor.key, grant);
        tutor.video = await storeFile(
          store,
          tutor.id,
          'video_leccion',
          'video-' + tutor.key,
          'Video corto de demostración',
        );
      }
      const pendingStudent = byKey.get('student4');
      const pending = await store.insert('solicitudes_tutor', {
        tutorId: pendingStudent.id,
        areaId: areas.get('diseno').id,
        estado: 'enviada',
        formacionAcademica:
          'Estudiante de arquitectura. Expediente ficticio para practicar la revisión.',
        experienciaDocente: 'Acompañamiento entre compañeros.',
        especialidades: ['Dibujo técnico'],
      });
      const pendingFile = await storeFile(
        store,
        pendingStudent.id,
        'evidencia_tutor',
        'pending-evidence',
        'Documento pendiente de muestra',
      );
      const pendingDoc = await store.insert('documentos_solicitud', {
        solicitudId: pending.id,
        tutorId: pendingStudent.id,
        archivoId: pendingFile.id,
        grupoDocumento: crypto.randomUUID(),
        version: 1,
        tipo: 'certificado',
      });
      const pendingSubmission = await store.insert('envios_solicitud', {
        solicitudId: pending.id,
        numero: 1,
      });
      await store.insert('envio_documentos', {
        envioId: pendingSubmission.id,
        documentoId: pendingDoc.id,
        solicitudId: pending.id,
      });
      const courses = [];
      const students = people.filter((p) => p.key.startsWith('student'));
      for (const [i, spec] of fixture.courses.entries()) {
        const tutor = byKey.get(spec[0]),
          grant = grants.get(spec[0]);
        const cover = await storeFile(
          store,
          tutor.id,
          'portada_curso',
          'course-' + i,
          spec[1],
        );
        const course = await store.insert('tutorias', {
          tutorId: tutor.id,
          areaId: grant.areaId,
          habilitacionId: grant.id,
          titulo: spec[1],
          resumen:
            'Aprende los fundamentos con una ruta clara, ejercicios y acompañamiento.',
          descripcion:
            'Curso de demostración de UniRed. Incluye un clip corto de ejemplo, lecturas, actividades y una sesión para practicar el flujo de aprendizaje. El contenido es de muestra y no representa una formación completa.',
          nivel: i < 4 ? 'inicial' : 'intermedio',
          modalidad: spec[4],
          estado: spec[5],
          precioBase: spec[6],
          moneda: 'NIO',
          portadaArchivoId: cover.id,
          publicadaEn: spec[5] === 'publicada' ? ago(25 - i * 2) : null,
          creadoEn: ago(29 - i * 2),
          objetivos: [
            'Comprender los conceptos esenciales',
            'Resolver un ejercicio guiado',
            'Aplicar lo aprendido a un caso práctico',
          ],
          requisitos: ['Conexión a internet', 'Cuaderno para practicar'],
          dirigidoA: 'Personas que quieren aprender con ejemplos sencillos.',
          idioma: 'Español',
          duracionEstimadaMinutos: 90,
        });
        const section = await store.insert('secciones_tutoria', {
          tutoriaId: course.id,
          titulo: 'Empieza por los fundamentos',
          orden: 1,
        });
        const lessons = [];
        for (let j = 0; j < 3; j++) {
          lessons.push(
            await store.insert('lecciones_tutoria', {
              tutoriaId: course.id,
              seccionId: section.id,
              tutorId: tutor.id,
              titulo: [
                'Bienvenida y ruta del curso',
                'Demostración en video',
                'Tu primer ejercicio',
              ][j],
              tipo: j === 1 ? 'video' : 'texto',
              videoArchivoId: j === 1 ? tutor.video.id : null,
              contenidoTexto:
                j === 1
                  ? null
                  : j === 0
                    ? 'Bienvenido a ' +
                      spec[1] +
                      '. Esta es una lección de muestra. Revisa el objetivo, prepara tus materiales y escribe una pregunta para tu tutor.'
                    : 'Actividad de demostración: elige un concepto del curso, explícalo con tus palabras y prepara un ejemplo. Comparte tus dudas en el apartado de preguntas.',
              orden: j + 1,
              vistaPrevia: j === 0,
              publicada: true,
            }),
          );
        }
        course.lessons = lessons;
        course.tutor = tutor;
        courses.push(course);
        if (course.estado !== 'publicada') continue;
        const session =
          course.modalidad !== 'grabada'
            ? await store.insert('sesiones_tutoria', {
                tutoriaId: course.id,
                titulo: 'Práctica guiada y resolución de dudas',
                inicioEn: later(2 + i),
                finEn: new Date(later(2 + i).getTime() + 3600000),
                capacidad: 12,
                estado: 'programada',
              })
            : null;
        for (const [s, student] of students.entries()) {
          if (i > 2 && s > 1) continue;
          const completed = s === 1 && i === 0;
          const enrollment = await store.insert('inscripciones_tutoria', {
            tutoriaId: course.id,
            alumnoId: student.id,
            estado: completed ? 'completada' : 'activa',
            activadaEn: ago(15 - i),
            completadaEn: completed ? ago(2) : null,
            creadoEn: ago(16 - i),
          });
          for (const lesson of lessons.slice(0, completed ? 3 : (s % 3) + 1)) {
            await store.insert('progreso_lecciones', {
              inscripcionId: enrollment.id,
              leccionId: lesson.id,
              tutoriaId: course.id,
              posicionSegundos: lesson.tipo === 'video' ? 9 : 0,
              completadaEn: ago(2),
            });
          }
          await store.insert('seguimiento_alumnos', {
            inscripcionId: enrollment.id,
            tutoriaId: course.id,
            tutorId: tutor.id,
            visibilidad: 'alumno_y_tutor',
            comentario:
              'Buen avance. Revisa el ejercicio y trae tus preguntas a la próxima práctica. Seguimiento de muestra.',
          });
          await store.insert('resenas_tutoria', {
            inscripcionId: enrollment.id,
            tutoriaId: course.id,
            puntuacion: 4 + (s % 2),
            comentario:
              'Reseña de demostración: ejemplos claros y una ruta fácil de seguir.',
          });
          if (session)
            await store.insert('reservas_sesion', {
              sesionId: session.id,
              inscripcionId: enrollment.id,
              tutoriaId: course.id,
            });
          if (s === 0) {
            const question = await store.insert('preguntas_leccion', {
              tutoriaId: course.id,
              leccionId: lessons[2].id,
              inscripcionId: enrollment.id,
              alumnoId: student.id,
              titulo: '¿Cómo compruebo mi ejercicio?',
              contenido:
                'Pregunta de muestra: ¿puedo usar un caso distinto al del ejemplo?',
              estado: 'resuelta',
            });
            await store.insert('respuestas_pregunta', {
              preguntaId: question.id,
              autorId: tutor.id,
              contenido:
                'Sí. Explica qué cambiaste y comprueba cada paso. Esa es una buena forma de practicar.',
            });
          }
        }
      }
      const listings = [];
      for (const [i, spec] of fixture.listings.entries()) {
        const seller = byKey.get(spec[6]),
          category = categories.get(spec[1]);
        assert(category, 'Falta una categoría de muestras.');
        const listing = await store.insert('anuncios_market', {
          vendedorId: seller.id,
          categoriaId: category.id,
          titulo: spec[0],
          descripcion:
            'Artículo de demostración para explorar el marketplace de UniRed. En buen estado, con los detalles que aparecen en la imagen ilustrativa. Consulta al vendedor antes de acordar la entrega. Esta publicación no es una oferta real.',
          condicion: i % 3 === 0 ? 'nuevo' : 'como_nuevo',
          estado: spec[5],
          tipoPrecio: 'negociable',
          precioBase: spec[4],
          moneda: 'NIO',
          ciudad: seller.city,
          marca: ['UniRed Demo', 'Edición de muestra'][i % 2],
          modelo: 'Muestra ' + (i + 1),
          zonaEntrega: 'Zona céntrica de ' + seller.city,
          detalleEntrega:
            'Coordinar por el chat. Ejemplo de entrega en lugar público.',
          formasEntrega: ['punto_acordado'],
          disponibilidad: 'unico',
          etiquetas: [spec[1], 'demostración'],
          referenciaPrivada: 'DEMO-' + String(i + 1).padStart(3, '0'),
          publicadoEn: spec[5] === 'borrador' ? null : ago(18 - i),
          creadoEn: ago(20 - i),
          vendidoEn: spec[5] === 'vendido' ? ago(1) : null,
        });
        listings.push(listing);
        const photo = await storeFile(
          store,
          seller.id,
          'imagen_anuncio',
          'listing-' + i,
          spec[0],
        );
        await store.insert('imagenes_anuncio', {
          anuncioId: listing.id,
          vendedorId: seller.id,
          archivoId: photo.id,
          orden: 0,
        });
        if (i % 3 === 0)
          await store.insert('actualizaciones_anuncio', {
            anuncioId: listing.id,
            vendedorId: seller.id,
            contenido:
              'Actualización de muestra: disponible para coordinar una entrega esta semana.',
          });
        for (const student of students.slice(0, 1 + (i % 4))) {
          if (student.id !== seller.id)
            await store.insert('favoritos_anuncio', {
              usuarioId: student.id,
              anuncioId: listing.id,
            });
        }
      }
      async function conversation(buyer, seller, resource, tutorial, texts) {
        const chat = await store.insert('conversaciones', {
          tipo: tutorial ? 'tutoria' : 'market',
          ...(tutorial
            ? { tutoriaId: resource.id }
            : { anuncioId: resource.id }),
          consultanteId: buyer.id,
          propietarioId: seller.id,
          ultimoMensajeEn: ago(0.03),
        });
        for (const person of [buyer, seller])
          await store.insert('participantes_conversacion', {
            conversacionId: chat.id,
            usuarioId: person.id,
          });
        for (const [i, text] of texts.entries())
          await store.insert('mensajes', {
            conversacionId: chat.id,
            autorId: i % 2 ? seller.id : buyer.id,
            clienteId: crypto.randomUUID(),
            contenido: text,
            creadoEn: ago(0.1 - i * 0.01),
          });
        return chat;
      }
      await conversation(students[0], byKey.get('math'), listings[1], false, [
        'Hola, ¿sigue disponible el libro?',
        '¡Hola! Sí, está disponible. Podemos coordinar la entrega por aquí.',
        'Perfecto, ¿puedes contarme si tiene anotaciones?',
      ]);
      await conversation(students[1], byKey.get('admin'), listings[9], false, [
        'Hola, me interesa el monitor. ¿Incluye su base?',
        'Sí, incluye la base y el cable. Es una conversación de demostración.',
      ]);
      await conversation(
        byKey.get('admin'),
        byKey.get('web'),
        listings[5],
        false,
        [
          'Hola, ¿el teclado permite cambiar los interruptores?',
          'Sí. Podemos revisar los detalles antes de acordar la entrega.',
        ],
      );
      for (const course of courses.slice(0, 3))
        await conversation(students[0], course.tutor, course, true, [
          'Hola, ya vi la primera lección. Tengo una duda sobre la práctica.',
          '¡Bienvenida! Escribe tu pregunta en la lección y la revisamos en la sesión.',
        ]);
      for (const person of people) {
        await store.insert('notificaciones', {
          usuarioId: person.id,
          tipo: 'bienvenida',
          titulo: 'Bienvenido a tu espacio de demostración',
          datos: { muestra: true },
        });
        if (!person.role)
          await store.insert('notificaciones', {
            usuarioId: person.id,
            tipo: 'mensaje',
            titulo: 'Explora los cursos, artículos y conversaciones de muestra',
            datos: { muestra: true },
          });
      }
      await store.insert('denuncias', {
        denuncianteId: students[1].id,
        anuncioId: listings[2].id,
        motivo: 'informacion_incorrecta',
        detalle: 'Reporte ficticio para explorar el flujo de atención.',
        estado: 'pendiente',
      });
      await store.insert('eventos_auditoria', {
        actorId: admin.id,
        accion: 'demo.restablecida',
        entidad: 'sistema',
        entidadId: 'local',
        resumen: {
          usuarios: people.length,
          cursos: courses.length,
          anuncios: listings.length,
          muestra: true,
        },
      });
      const summary = {
        usuarios: people.length,
        cursos: courses.length,
        anuncios: listings.length,
      };
      await fs.writeFile(
        credentialPath,
        [
          'UNIRED · CUENTAS LOCALES DE DEMOSTRACIÓN',
          'Estas cuentas sustituyen a las anteriores. Solo se guardaron hashes en PostgreSQL.',
          'Los correos .test, las publicaciones, los documentos y los videos son muestras.',
          'Administrador: http://127.0.0.1:62604/#/admin-login',
          'Usuarios: http://127.0.0.1:62604/#/login',
          '',
          ...credentials.flatMap((c) => [
            c.nombre + ' (' + c.rol + ')',
            'Correo: ' + c.email,
            'Contraseña: ' + c.password,
            '',
          ]),
          'Respaldo anterior: ' + backupPath,
        ].join('\n'),
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
      );
      return summary;
    });
    console.log(
      JSON.stringify({
        ...result,
        credenciales: credentialPath,
        respaldo: backupPath,
      }),
    );
  } finally {
    await source.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

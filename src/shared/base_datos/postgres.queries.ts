// Archivo: src/shared/base_datos/postgres.queries.ts
// Implementa las consultas especializadas de catálogos, cursos, inscripciones y conversaciones.

import { EntityManager } from 'typeorm';
import {
  Pagina,
  Paginacion,
  Consultas,
  Registro,
} from '../../core/dominio/comun/contratos';
import { camelRow } from './postgres.database';
import {
  CursoPublico,
  AnuncioPublico,
} from '../../core/dominio/comun/entidades';
import { AdministracionQueries } from './administracion.queries';
import { GestionQueries } from './gestion.queries';

const courseAccess =
  "t.estado = 'publicada' AND t.eliminada_en IS NULL AND u.estado = 'activo' AND u.eliminado_en IS NULL AND a.activo AND h.estado = 'vigente' AND h.valida_desde <= CURRENT_TIMESTAMP AND (h.valida_hasta IS NULL OR h.valida_hasta > CURRENT_TIMESTAMP)";
const courseJoin =
  ' FROM tutorias t JOIN usuarios u ON u.id=t.tutor_id JOIN areas_tutoria a ON a.id=t.area_id JOIN habilitaciones_tutor h ON h.id=t.habilitacion_id';
const freeTutoring =
  '(SELECT tutorias_gratuitas FROM configuracion_comercial WHERE id=1)';
const visibleCoursePrice = `CASE WHEN ${freeTutoring} THEN 0.00::numeric ELSE t.precio_base END`;
const visibleCourseDiscount = `CASE WHEN ${freeTutoring} THEN 0.00::numeric ELSE t.descuento_porcentaje END`;
// La lectura usa el material actual. Los videos solo aportan su duración
// verificada y el texto se estima a 240 palabras por minuto.
const courseDuration = (id: string, publishedOnly: boolean) => `
(SELECT NULLIF(CEIL((
    COALESCE((SELECT SUM(CASE
      WHEN l.tipo='video' AND v.estado='listo' AND v.escaneo='limpio'
        AND v.eliminado_en IS NULL THEN COALESCE(v.duracion_segundos,0)
      WHEN l.tipo='texto' THEN CARDINALITY(regexp_split_to_array(
        NULLIF(BTRIM(l.contenido_texto, E' \\t\\r\\n'),''),'[[:space:]]+'))*0.25
      ELSE 0 END)
      FROM lecciones_tutoria l
      JOIN secciones_tutoria s ON s.id=l.seccion_id AND s.archivada_en IS NULL
      LEFT JOIN archivos v ON v.id=l.video_archivo_id
      WHERE l.tutoria_id=${id} AND l.archivada_en IS NULL
      ${publishedOnly ? 'AND l.publicada' : ''}),0)
    + COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (ss.fin_en-ss.inicio_en)))
      FROM sesiones_tutoria ss WHERE ss.tutoria_id=${id} AND ss.estado<>'cancelada'),0)
  )/60),0)::int)
`;
const courseFields =
  `(SELECT COUNT(*)::int FROM secciones_tutoria s WHERE s.tutoria_id=t.id AND s.archivada_en IS NULL) AS secciones_total,
   (SELECT COUNT(*)::int FROM lecciones_tutoria l WHERE l.tutoria_id=t.id AND l.publicada AND l.archivada_en IS NULL) AS lecciones_total,
   (SELECT COUNT(*)::int FROM recursos_leccion r JOIN lecciones_tutoria l ON l.id=r.leccion_id WHERE r.tutoria_id=t.id AND l.publicada AND l.archivada_en IS NULL) AS recursos_total,` +
  `t.resumen,t.idioma,t.objetivos,t.requisitos,t.dirigido_a,${courseDuration('t.id', true)} AS duracion_estimada_minutos,` +
  `t.id,t.tutor_id,t.area_id,t.titulo,t.descripcion,t.nivel,t.modalidad,${visibleCoursePrice} AS precio_base,
   ${visibleCourseDiscount} AS descuento_porcentaje,t.moneda,t.portada_archivo_id,t.publicada_en,u.nombre AS tutor_nombre,a.nombre AS area_nombre,
   (SELECT COUNT(*)::int FROM inscripciones_tutoria i WHERE i.tutoria_id=t.id AND i.estado IN ('activa','completada')) AS alumnos,
   (SELECT ROUND(AVG(r.puntuacion),2)::text FROM resenas_tutoria r WHERE r.tutoria_id=t.id AND r.estado='visible') AS puntuacion`;
const listingJoin =
  ' FROM anuncios_market t JOIN usuarios u ON u.id=t.vendedor_id JOIN categorias_market a ON a.id=t.categoria_id';
const listingAccess =
  "t.estado IN ('publicado','reservado','vendido') AND t.eliminado_en IS NULL AND u.estado='activo' AND u.eliminado_en IS NULL AND a.activo";
const listingFields =
  't.tipo_publicacion,t.atributos,t.etiquetas,t.disponibilidad,' +
  't.marca,t.modelo,t.zona_entrega,t.detalle_entrega,t.formas_entrega,' +
  "t.id,t.vendedor_id,t.categoria_id,t.titulo,t.descripcion,t.condicion,t.estado,t.tipo_precio,t.precio_base,t.descuento_porcentaje,t.moneda,t.ciudad,t.publicado_en,t.vendido_en,u.nombre AS vendedor_nombre,a.nombre AS categoria_nombre,(SELECT f.archivo_id::text FROM imagenes_anuncio f JOIN archivos af ON af.id=f.archivo_id WHERE f.anuncio_id=t.id AND af.estado='listo' AND af.escaneo='limpio' AND af.eliminado_en IS NULL ORDER BY f.orden LIMIT 1) AS portada_archivo_id";

/** Consultas de lectura agregadas: catálogo público no expone secretos ni documentos. */
export class PostgresQueries implements Consultas {
  async pricingAreas(): Promise<Registro[]> {
    const rows = await this.manager.query<
      Registro[]
    >(`SELECT a.id AS area_id,a.nombre AS area_nombre,
      COALESCE(t.precio_minuto_online,c.precio_minuto_online) AS precio_minuto_online,
      COALESCE(t.precio_minuto_presencial,c.precio_minuto_presencial) AS precio_minuto_presencial
      FROM areas_tutoria a LEFT JOIN tarifas_tutoria t ON t.area_id=a.id CROSS JOIN configuracion_comercial c
      WHERE a.activo AND c.id=1 ORDER BY a.nombre LIMIT 200`);
    return rows.map(camelRow);
  }
  async notifyTutors(
    areaId: number,
    excludedUser: number,
    title: string,
    data: Registro,
  ): Promise<void> {
    await this.manager.query(
      `INSERT INTO notificaciones(usuario_id,tipo,titulo,datos)
      SELECT DISTINCT h.tutor_id,'solicitud_tutoria',$3,$4::jsonb
      FROM habilitaciones_tutor h JOIN usuarios u ON u.id=h.tutor_id
      LEFT JOIN perfiles_usuario p ON p.usuario_id=u.id
      WHERE h.area_id=$1 AND h.tutor_id<>$2 AND h.estado='vigente' AND h.valida_desde<=now()
      AND (h.valida_hasta IS NULL OR h.valida_hasta>now()) AND u.estado='activo' AND u.eliminado_en IS NULL
      AND COALESCE(p.notificaciones_activas,true)`,
      [areaId, excludedUser, title.slice(0, 180), JSON.stringify(data)],
    );
  }
  offers(userId: number, p: Paginacion & Registro): Promise<Pagina> {
    const values: unknown[] = [userId];
    let where =
      p.bandeja === 'recibidas'
        ? 'o.vendedor_id=$1'
        : p.bandeja === 'enviadas'
          ? 'o.comprador_id=$1'
          : '(o.comprador_id=$1 OR o.vendedor_id=$1)';
    if (p.estado) {
      values.push(p.estado);
      where += ` AND o.estado=$${values.length}`;
    }
    const join = ` FROM ofertas_market o JOIN anuncios_market a ON a.id=o.anuncio_id
      JOIN usuarios buyer ON buyer.id=o.comprador_id JOIN usuarios seller ON seller.id=o.vendedor_id
      LEFT JOIN resenas_interaccion r ON r.oferta_id=o.id AND r.autor_id=$1 WHERE ${where}`;
    return this.page(
      'SELECT o.*,a.titulo AS anuncio_titulo,buyer.nombre AS comprador_nombre,seller.nombre AS vendedor_nombre,r.id AS resena_propia_id' +
        join +
        ' ORDER BY o.id DESC',
      'SELECT COUNT(*)::int AS total' + join,
      values,
      p,
    );
  }
  tutoringRequests(userId: number, p: Paginacion & Registro): Promise<Pagina> {
    const values: unknown[] = [userId];
    let where =
      p.vista === 'disponibles'
        ? `s.estado='publicada' AND s.alumno_id<>$1 AND EXISTS(
      SELECT 1 FROM habilitaciones_tutor h WHERE h.tutor_id=$1 AND h.area_id=s.area_id AND h.estado='vigente' AND h.valida_desde<=now() AND (h.valida_hasta IS NULL OR h.valida_hasta>now()))
      AND NOT EXISTS(SELECT 1 FROM solicitudes_ignoradas ig WHERE ig.solicitud_id=s.id AND ig.tutor_id=$1)`
        : p.vista === 'impartidas'
          ? 's.tutor_id=$1'
          : 's.alumno_id=$1';
    for (const [key, column] of [
      ['estado', 's.estado'],
      ['areaId', 's.area_id'],
      ['universidad', 's.universidad'],
      ['carrera', 's.carrera'],
      ['anioEstudio', 's.anio_estudio'],
    ] as const) {
      if (p[key] !== undefined && p[key] !== '') {
        values.push(p[key]);
        where += ` AND ${column}=$${values.length}`;
      }
    }
    if (p.q) {
      values.push('%' + String(p.q) + '%');
      where += ` AND (s.tema ILIKE $${values.length} OR s.materia ILIKE $${values.length})`;
    }
    const join = ` FROM solicitudes_apoyo s JOIN usuarios student ON student.id=s.alumno_id
      LEFT JOIN usuarios tutor ON tutor.id=s.tutor_id JOIN areas_tutoria a ON a.id=s.area_id
      LEFT JOIN resenas_interaccion r ON r.solicitud_id=s.id AND r.autor_id=$1
      LEFT JOIN pagos_demo p ON p.concepto='tutoria_solicitud' AND p.recurso_id=s.id AND p.usuario_id=s.alumno_id
      WHERE ${where}`;
    return this.page(
      `SELECT s.*,student.nombre AS alumno_nombre,tutor.nombre AS tutor_nombre,a.nombre AS area_nombre,r.id AS resena_propia_id,
       p.id IS NOT NULL AS pago_demo_confirmado,
       CASE WHEN s.alumno_id=$1 THEN p.id END AS pago_demo_id,
       CASE WHEN s.alumno_id=$1 THEN p.creado_en END AS pago_demo_fecha` +
        join +
        ' ORDER BY s.id DESC',
      'SELECT COUNT(*)::int AS total' + join,
      values,
      p,
    );
  }
  async reputation(userId: number): Promise<Registro> {
    const [row] = await this.manager.query<Registro[]>(
      'SELECT COUNT(*)::int AS resenas,COALESCE(ROUND(AVG(puntuacion),2),0)::text AS puntuacion FROM resenas_interaccion WHERE receptor_id=$1 AND visible',
      [userId],
    );
    return row;
  }
  reputationReviews(userId: number, p: Paginacion): Promise<Pagina> {
    const from =
      ' FROM resenas_interaccion r JOIN usuarios u ON u.id=r.autor_id WHERE r.receptor_id=$1 AND r.visible';
    return this.page(
      "SELECT r.id,r.puntuacion,r.comentario,r.creado_en,u.nombre AS autor_nombre,CASE WHEN r.oferta_id IS NOT NULL THEN 'Market' ELSE 'Tutoría' END AS contexto" +
        from +
        ' ORDER BY r.id DESC',
      'SELECT COUNT(*)::int AS total' + from,
      [userId],
      p,
    );
  }
  campaigns(p: Paginacion): Promise<Pagina> {
    const where = ` FROM campanas_publicitarias c
      JOIN empresas e ON e.id=c.empresa_id
      JOIN usuarios u ON u.id=e.propietario_id AND u.estado='activo' AND u.eliminado_en IS NULL
      JOIN suscripciones_empresa s ON s.id=c.suscripcion_id
      JOIN archivos f ON f.id=c.banner_archivo_id
      WHERE c.estado='activa' AND e.estado='aprobada' AND s.estado='activa'
      AND s.vence_en>now() AND c.inicia_en<=now() AND c.termina_en>now()
      AND f.estado='listo' AND f.escaneo='limpio' AND f.eliminado_en IS NULL`;
    return this.page(
      `SELECT c.id,c.titulo,c.descripcion,c.banner_archivo_id,c.enlace,e.nombre AS empresa_nombre` +
        where +
        ' ORDER BY c.id DESC',
      'SELECT COUNT(*)::int AS total' + where,
      [],
      p,
    );
  }
  adminConversations(p: Paginacion & Registro): Promise<Pagina> {
    return new AdministracionQueries(this.manager).conversations(p);
  }
  constructor(private readonly manager: EntityManager) {}
  workspace(section: string, query: Paginacion & Registro) {
    return new GestionQueries(this.manager).list(section, query);
  }
  courseInspection(id: string) {
    return new GestionQueries(this.manager).course(id);
  }
  enrollments(userId: number, p: Paginacion, state?: string): Promise<Pagina> {
    const values: unknown[] = [userId];
    let where = ' WHERE i.alumno_id=$1';
    if (state) {
      values.push(state);
      where += ' AND i.estado=$2';
    }
    return this.page(
      `SELECT i.*, t.titulo AS curso_titulo, t.modalidad, u.nombre AS tutor_nombre,
              t.portada_archivo_id, COALESCE((${courseAccess}),false) AS curso_disponible,
              progreso.total_lecciones, progreso.completadas,
              (SELECT r.id FROM resenas_interaccion r WHERE r.inscripcion_id=i.id AND r.autor_id=$1) AS resena_propia_id
         FROM inscripciones_tutoria i
         JOIN tutorias t ON t.id=i.tutoria_id
         JOIN usuarios u ON u.id=t.tutor_id
         JOIN areas_tutoria a ON a.id=t.area_id
         LEFT JOIN habilitaciones_tutor h ON h.id=t.habilitacion_id
         CROSS JOIN LATERAL (
           SELECT COUNT(*)::int AS total_lecciones,
                  COUNT(pr.leccion_id) FILTER (WHERE pr.completada_en IS NOT NULL)::int AS completadas
           FROM lecciones_tutoria l
           LEFT JOIN progreso_lecciones pr ON pr.leccion_id=l.id AND pr.inscripcion_id=i.id
           WHERE l.tutoria_id=t.id AND l.publicada AND l.archivada_en IS NULL
         ) progreso` +
        where +
        ' ORDER BY i.id DESC',
      'SELECT COUNT(*)::int AS total FROM inscripciones_tutoria i' + where,
      values,
      p,
    );
  }
  async courseDuration(
    id: string,
    publishedOnly = false,
  ): Promise<number | null> {
    const rows: { minutes: number | null }[] = await this.manager.query(
      `SELECT ${courseDuration('$1', publishedOnly)} AS minutes`,
      [id],
    );
    return rows[0].minutes;
  }
  ownedCourses(userId: number, p: Paginacion): Promise<Pagina> {
    const where = ' WHERE t.tutor_id=$1 AND t.eliminada_en IS NULL';
    return this.page(
      `SELECT t.*, a.nombre AS area_nombre,
              (SELECT COUNT(*)::int FROM inscripciones_tutoria i
                WHERE i.tutoria_id=t.id AND i.estado IN ('activa','completada')) AS alumnos
         FROM tutorias t JOIN areas_tutoria a ON a.id=t.area_id` +
        where +
        ' ORDER BY t.id DESC',
      'SELECT COUNT(*)::int AS total FROM tutorias t' + where,
      [userId],
      p,
    );
  }
  adminUsers(query: Paginacion & Registro) {
    return new AdministracionQueries(this.manager).users(query);
  }
  adminUserSummary(userId: number) {
    return new AdministracionQueries(this.manager).userSummary(userId);
  }
  adminPublications(
    kind: 'courses' | 'listings',
    query: Paginacion & Registro,
  ) {
    return new AdministracionQueries(this.manager).publications(kind, query);
  }
  private async page(
    sql: string,
    count: string,
    values: unknown[],
    p: Paginacion,
  ): Promise<Pagina> {
    const [items, totals] = await Promise.all([
      this.manager.query<Registro[]>(
        sql +
          ' LIMIT $' +
          (values.length + 1) +
          ' OFFSET $' +
          (values.length + 2),
        [...values, p.limit, (p.page - 1) * p.limit],
      ),
      this.manager.query<{ total: number }[]>(count, values),
    ]);
    return {
      items: items.map(camelRow),
      total: Number(totals[0].total),
      page: p.page,
      limit: p.limit,
    };
  }
  async catalog(
    kind: 'courses' | 'listings',
    p: Paginacion & Registro,
  ): Promise<Pagina> {
    const courses = kind === 'courses';
    const values: unknown[] = [];
    let where = courses ? courseAccess : listingAccess;
    if (p.q) {
      values.push(p.q);
      where +=
        " AND to_tsvector('spanish',coalesce(t.titulo,'') || ' ' || coalesce(t.descripcion,'')) @@ websearch_to_tsquery('spanish',$" +
        values.length +
        ')';
    }
    if (p.areaId || p.categoriaId) {
      values.push(p.areaId ?? p.categoriaId);
      where +=
        ' AND t.' +
        (courses ? 'area_id' : 'categoria_id') +
        '=$' +
        values.length;
    }
    if (p.tutorId || p.vendedorId) {
      values.push(p.tutorId ?? p.vendedorId);
      where +=
        ' AND t.' +
        (courses ? 'tutor_id' : 'vendedor_id') +
        '=$' +
        values.length;
    }
    if (!courses && p.estado) {
      values.push(p.estado);
      where += ' AND t.estado=$' + values.length;
    }
    if (!courses && p.tipoPublicacion) {
      values.push(p.tipoPublicacion);
      where += ' AND t.tipo_publicacion=$' + values.length;
    }
    for (const key of ['universidad', 'carrera'] as const)
      if (p[key]) {
        values.push('%' + String(p[key]) + '%');
        where += ` AND perfil.${key} ILIKE $${values.length}`;
      }
    if (p.anioEstudio) {
      values.push(p.anioEstudio);
      where += ' AND perfil.anio_estudio=$' + values.length;
    }
    if (p.materia) {
      values.push('%' + String(p.materia) + '%');
      where += courses
        ? ` AND (a.nombre ILIKE $${values.length} OR t.titulo ILIKE $${values.length})`
        : ` AND (t.atributos->>'asignatura' ILIKE $${values.length} OR t.titulo ILIKE $${values.length})`;
    }
    const join =
      (courses ? courseJoin : listingJoin) +
      ' LEFT JOIN perfiles_usuario perfil ON perfil.usuario_id=u.id';
    const fields = courses ? courseFields : listingFields;
    if (!courses && p.favoritesOf) {
      values.push(p.favoritesOf);
      where +=
        ' AND EXISTS(SELECT 1 FROM favoritos_anuncio fa WHERE fa.anuncio_id=t.id AND fa.usuario_id=$' +
        values.length +
        ')';
    }
    const order =
      p.sort === 'popular'
        ? courses
          ? 'alumnos DESC,t.id DESC'
          : '(SELECT COUNT(*) FROM favoritos_anuncio fa WHERE fa.anuncio_id=t.id) DESC,t.id DESC'
        : 't.id DESC';
    return this.page(
      'SELECT ' + fields + join + ' WHERE ' + where + ' ORDER BY ' + order,
      'SELECT COUNT(*)::int AS total' + join + ' WHERE ' + where,
      values,
      p,
    );
  }
  async publicCourse(id: string): Promise<CursoPublico | undefined> {
    const [row] = await this.manager.query<Registro[]>(
      'SELECT ' +
        courseFields +
        courseJoin +
        ' WHERE ' +
        courseAccess +
        ' AND t.id=$1',
      [id],
    );
    return row ? (camelRow(row) as CursoPublico) : undefined;
  }
  async publicListing(id: string): Promise<AnuncioPublico | undefined> {
    const [row] = await this.manager.query<Registro[]>(
      'SELECT ' +
        listingFields +
        listingJoin +
        ' WHERE ' +
        listingAccess +
        ' AND t.id=$1',
      [id],
    );
    return row ? (camelRow(row) as AnuncioPublico) : undefined;
  }
  conversations(userId: number, p: Paginacion & Registro): Promise<Pagina> {
    const values: unknown[] = [userId];
    const join = ` FROM conversaciones c JOIN participantes_conversacion p ON p.conversacion_id=c.id
      JOIN usuarios u ON u.id=CASE WHEN c.propietario_id=$1 THEN c.consultante_id ELSE c.propietario_id END
      LEFT JOIN perfiles_usuario up ON up.usuario_id=u.id
      LEFT JOIN anuncios_market a ON a.id=c.anuncio_id
      LEFT JOIN solicitudes_apoyo s ON s.id=c.solicitud_apoyo_id
      LEFT JOIN tutorias t ON t.id=COALESCE(c.tutoria_id,s.curso_id)
      LEFT JOIN lecturas_conversacion lc ON lc.conversacion_id=c.id AND lc.usuario_id=$1
      LEFT JOIN LATERAL (SELECT m.contenido,m.archivo_id,m.eliminado_en FROM mensajes m WHERE m.conversacion_id=c.id ORDER BY m.id DESC LIMIT 1) last ON TRUE`;
    let where = ' WHERE p.usuario_id=$1 AND p.salio_en IS NULL';
    if (!p.incluirArchivadas)
      where += ` AND p.archivada_en IS NULL AND c.estado='abierta' AND u.estado='activo' AND u.eliminado_en IS NULL
      AND ((c.tipo='market' AND a.estado IN ('publicado','reservado') AND a.eliminado_en IS NULL)
        OR (c.solicitud_apoyo_id IS NOT NULL AND s.estado='aceptada')
        OR (c.tutoria_id IS NOT NULL AND EXISTS(SELECT 1 FROM inscripciones_tutoria i WHERE i.tutoria_id=c.tutoria_id AND i.alumno_id=c.consultante_id AND i.estado='activa')))`;
    if (p.conversacionId !== undefined) {
      values.push(p.conversacionId);
      where += ` AND c.id=$${values.length}`;
    }
    if (p.q) {
      values.push('%' + String(p.q) + '%');
      where += ` AND (u.nombre ILIKE $${values.length} OR COALESCE(a.titulo,s.tema,t.titulo,'') ILIKE $${values.length})`;
    }
    if (p.tipo) {
      values.push(p.tipo);
      where += ` AND c.tipo=$${values.length}`;
    }
    const unread =
      '(SELECT COUNT(*)::int FROM mensajes m WHERE m.conversacion_id=c.id AND m.autor_id<>$1 AND m.eliminado_en IS NULL AND m.id>COALESCE(lc.ultimo_mensaje_id,0))';
    if (p.noLeidos) where += ` AND ${unread}>0`;
    return this.page(
      `SELECT c.id,c.tipo,c.anuncio_id,COALESCE(c.tutoria_id,s.curso_id) AS tutoria_id,c.solicitud_apoyo_id,c.estado,c.ultimo_mensaje_en,u.id AS interlocutor_id,u.nombre AS interlocutor_nombre,
      up.avatar_archivo_id AS interlocutor_avatar_id,COALESCE(a.titulo,s.tema,t.titulo) AS recurso_titulo,
      LEFT(COALESCE(a.descripcion,s.descripcion,NULLIF(t.resumen,''),t.descripcion,''),1000) AS recurso_descripcion,
      COALESCE(a.precio_base,s.precio,${visibleCoursePrice}) AS recurso_precio_base,
      COALESCE(a.descuento_porcentaje,${visibleCourseDiscount}) AS recurso_descuento_porcentaje,
      COALESCE(a.moneda,s.moneda,t.moneda) AS recurso_moneda,
      COALESCE(a.estado::text,s.estado,t.estado::text) AS recurso_estado,
      CASE WHEN c.tipo='market' THEN a.tipo_precio::text WHEN COALESCE(s.precio,${visibleCoursePrice})=0 THEN 'gratis' ELSE 'fijo' END AS recurso_tipo_precio,
      COALESCE((SELECT i.archivo_id FROM imagenes_anuncio i JOIN archivos f ON f.id=i.archivo_id
        WHERE i.anuncio_id=a.id AND f.estado='listo' AND f.escaneo='limpio' AND f.eliminado_en IS NULL ORDER BY i.orden LIMIT 1),t.portada_archivo_id) AS recurso_imagen_id,
      CASE WHEN last.eliminado_en IS NOT NULL THEN 'Mensaje eliminado' WHEN last.archivo_id IS NOT NULL THEN COALESCE(last.contenido,'Archivo adjunto') ELSE last.contenido END AS ultimo_mensaje,
      ${unread} AS no_leidos,p.silenciada` +
        join +
        where +
        ' ORDER BY c.ultimo_mensaje_en DESC NULLS LAST,c.id DESC',
      'SELECT COUNT(*)::int AS total' + join + where,
      values,
      p,
    );
  }
  students(courseId: string, p: Paginacion & Registro): Promise<Pagina> {
    const values: unknown[] = [courseId];
    let join =
      ' FROM inscripciones_tutoria i JOIN usuarios u ON u.id=i.alumno_id WHERE i.tutoria_id=$1';
    if (p.estado !== undefined) {
      values.push(p.estado);
      join += ' AND i.estado=$2';
    }
    return this.page(
      'SELECT i.id,i.alumno_id,i.estado,i.creado_en,u.nombre,(SELECT r.id FROM resenas_interaccion r JOIN tutorias t ON t.id=i.tutoria_id WHERE r.inscripcion_id=i.id AND r.autor_id=t.tutor_id) AS resena_propia_id,(SELECT COUNT(*)::int FROM progreso_lecciones pl JOIN lecciones_tutoria l ON l.id=pl.leccion_id WHERE pl.inscripcion_id=i.id AND pl.completada_en IS NOT NULL AND l.publicada AND l.archivada_en IS NULL) AS completadas' +
        join +
        ' ORDER BY i.id DESC',
      'SELECT COUNT(*)::int AS total' + join,
      values,
      p,
    );
  }
  async dashboard(): Promise<Registro> {
    const [row] = await this.manager.query<Registro[]>(
      "SELECT (SELECT COUNT(*)::int FROM usuarios WHERE eliminado_en IS NULL) AS usuarios,(SELECT COUNT(*)::int FROM solicitudes_tutor WHERE estado IN ('enviada','en_revision')) AS solicitudes_pendientes,(SELECT COUNT(*)::int FROM tutorias WHERE eliminada_en IS NULL) AS cursos,(SELECT COUNT(*)::int FROM anuncios_market WHERE eliminado_en IS NULL) AS anuncios,(SELECT COUNT(*)::int FROM denuncias WHERE estado IN ('pendiente','en_revision')) AS denuncias_pendientes,(SELECT COUNT(*)::int FROM conversaciones) AS conversaciones",
    );
    return camelRow(row);
  }
  async analytics(days: number): Promise<Registro> {
    const daily = await this.manager.query<Registro[]>(
      "SELECT to_char(d.dia,'YYYY-MM-DD') AS dia," +
        "(SELECT COUNT(*)::int FROM usuarios u WHERE u.creado_en>=d.dia AND u.creado_en<d.dia+interval '1 day') AS usuarios_registrados," +
        "(SELECT COUNT(*)::int FROM tutorias t WHERE t.creado_en>=d.dia AND t.creado_en<d.dia+interval '1 day') AS cursos_creados," +
        "(SELECT COUNT(*)::int FROM anuncios_market a WHERE a.creado_en>=d.dia AND a.creado_en<d.dia+interval '1 day') AS anuncios_creados," +
        "(SELECT COUNT(*)::int FROM inscripciones_tutoria i WHERE i.creado_en>=d.dia AND i.creado_en<d.dia+interval '1 day') AS inscripciones_creadas," +
        "(SELECT COUNT(*)::int FROM anuncios_market a WHERE a.vendido_en>=d.dia AND a.vendido_en<d.dia+interval '1 day') AS ventas_declaradas " +
        "FROM generate_series(date_trunc('day',CURRENT_TIMESTAMP)-($1::int-1)*interval '1 day',date_trunc('day',CURRENT_TIMESTAMP),interval '1 day') d(dia) ORDER BY d.dia",
      [days],
    );
    const top = await this.manager.query<Registro[]>(
      'SELECT t.id,t.titulo,u.id AS tutor_id,u.nombre AS tutor_nombre,COUNT(i.id)::int AS alumnos ' +
        "FROM tutorias t JOIN usuarios u ON u.id=t.tutor_id LEFT JOIN inscripciones_tutoria i ON i.tutoria_id=t.id AND i.estado IN ('activa','completada') " +
        'WHERE t.eliminada_en IS NULL GROUP BY t.id,u.id ORDER BY alumnos DESC,t.id DESC LIMIT 10',
    );
    return {
      timezone: 'UTC',
      actividad: daily.map(camelRow),
      cursosDemandados: top.map(camelRow),
      ...(await new AdministracionQueries(this.manager).dashboardExtras()),
      nota: 'Ventas declaradas por vendedores; no representan pagos verificados ni ingresos de UniRed.',
    };
  }
}

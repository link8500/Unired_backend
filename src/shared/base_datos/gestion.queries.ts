// Archivo: src/shared/base_datos/gestion.queries.ts
// Obtiene las colecciones y datos que utilizan las vistas de gestión administrativa.

import { EntityManager } from 'typeorm';
import {
  Pagina,
  Paginacion,
  Registro,
} from '../../core/dominio/comun/contratos';
import { camelRow } from './postgres.database';

/** Vistas operativas de lectura. No selecciona conversaciones, notas privadas,
 * contenido de lecciones ni enlaces de reuniones. */
export class GestionQueries {
  constructor(private readonly manager: EntityManager) {}
  async list(section: string, p: Paginacion & Registro): Promise<Pagina> {
    const values: unknown[] = [];
    let fields: string,
      from: string,
      where = 'TRUE',
      search: string,
      order: string;
    switch (section) {
      case 'applications':
        fields =
          's.*,u.nombre,u.email,a.nombre AS area_nombre,r.nombre AS revisor_nombre,(SELECT COUNT(*)::int FROM documentos_solicitud d WHERE d.solicitud_id=s.id) AS documentos';
        from =
          ' FROM solicitudes_tutor s JOIN usuarios u ON u.id=s.tutor_id JOIN areas_tutoria a ON a.id=s.area_id LEFT JOIN usuarios r ON r.id=s.asignada_a';
        search = 'u.nombre';
        order = 's.creado_en DESC,s.id DESC';
        if (p.estado) {
          values.push(p.estado);
          where += ` AND s.estado::text=$${values.length}`;
        }
        break;
      case 'tutors':
        fields = `h.*,u.nombre,u.email,p.ciudad,p.universidad,a.nombre AS area_nombre,
          CASE WHEN h.estado='vigente' AND h.valida_hasta<=CURRENT_TIMESTAMP THEN 'vencida' ELSE h.estado::text END AS vigencia,
          (SELECT COUNT(*)::int FROM tutorias t WHERE t.tutor_id=h.tutor_id AND t.area_id=h.area_id AND t.eliminada_en IS NULL) AS cursos`;
        from =
          ' FROM habilitaciones_tutor h JOIN usuarios u ON u.id=h.tutor_id LEFT JOIN perfiles_usuario p ON p.usuario_id=u.id JOIN areas_tutoria a ON a.id=h.area_id';
        search = 'u.nombre';
        order = 'h.valida_hasta ASC NULLS LAST,h.id DESC';
        if (p.estado === 'por_vencer')
          where +=
            " AND h.estado='vigente' AND h.valida_hasta>CURRENT_TIMESTAMP AND h.valida_hasta<=CURRENT_TIMESTAMP+interval '30 days'";
        else if (p.estado === 'vencida')
          where +=
            " AND h.estado='vigente' AND h.valida_hasta<=CURRENT_TIMESTAMP";
        else if (p.estado) {
          values.push(p.estado);
          where += ` AND h.estado::text=$${values.length}`;
          if (p.estado === 'vigente')
            where +=
              ' AND (h.valida_hasta IS NULL OR h.valida_hasta>CURRENT_TIMESTAMP)';
        }
        break;
      case 'sessions':
        fields =
          "s.id,s.tutoria_id,s.titulo,s.inicio_en,s.fin_en,s.capacidad,s.estado,t.titulo AS curso,u.nombre AS tutor_nombre,(SELECT COUNT(*)::int FROM reservas_sesion r WHERE r.sesion_id=s.id AND r.estado='confirmada') AS reservas";
        from =
          ' FROM sesiones_tutoria s JOIN tutorias t ON t.id=s.tutoria_id JOIN usuarios u ON u.id=t.tutor_id';
        search = 's.titulo';
        order = 's.inicio_en DESC,s.id DESC';
        if (p.estado) {
          values.push(p.estado);
          where += ` AND s.estado::text=$${values.length}`;
        }
        break;
      case 'participation':
        fields = `t.id,t.titulo,u.nombre AS tutor_nombre,t.modalidad,t.estado,
          (SELECT COUNT(*)::int FROM inscripciones_tutoria i WHERE i.tutoria_id=t.id AND i.estado='activa') AS activos,
          (SELECT COUNT(*)::int FROM inscripciones_tutoria i WHERE i.tutoria_id=t.id AND i.estado='completada') AS completados,
          (SELECT COUNT(*)::int FROM lecciones_tutoria l WHERE l.tutoria_id=t.id AND l.archivada_en IS NULL AND l.publicada) AS lecciones,
          (SELECT ROUND(AVG(r.puntuacion),1)::text FROM resenas_tutoria r WHERE r.tutoria_id=t.id AND r.estado='visible') AS puntuacion`;
        from = ' FROM tutorias t JOIN usuarios u ON u.id=t.tutor_id';
        where = 't.eliminada_en IS NULL';
        search = 't.titulo';
        order = 't.id DESC';
        break;
      case 'reviews':
        fields =
          'r.inscripcion_id AS id,r.tutoria_id,r.puntuacion,r.comentario,r.estado,r.creado_en,t.titulo AS curso,u.nombre AS autor_nombre';
        from =
          ' FROM resenas_tutoria r JOIN tutorias t ON t.id=r.tutoria_id JOIN inscripciones_tutoria i ON i.id=r.inscripcion_id JOIN usuarios u ON u.id=i.alumno_id';
        search = 't.titulo';
        order = 'r.creado_en DESC,r.inscripcion_id DESC';
        if (p.estado) {
          values.push(p.estado);
          where += ` AND r.estado::text=$${values.length}`;
        }
        break;
      case 'peer-reviews':
        fields =
          "r.id,r.puntuacion,r.comentario,CASE WHEN r.visible THEN 'visible' ELSE 'oculta' END AS estado,r.creado_en,u.nombre AS autor_nombre,v.nombre AS receptor_nombre,COALESCE(a.titulo,s.tema,t.titulo) AS contexto";
        from =
          ' FROM resenas_interaccion r JOIN usuarios u ON u.id=r.autor_id JOIN usuarios v ON v.id=r.receptor_id LEFT JOIN ofertas_market o ON o.id=r.oferta_id LEFT JOIN anuncios_market a ON a.id=o.anuncio_id LEFT JOIN solicitudes_apoyo s ON s.id=r.solicitud_id LEFT JOIN inscripciones_tutoria i ON i.id=r.inscripcion_id LEFT JOIN tutorias t ON t.id=i.tutoria_id';
        search = "COALESCE(a.titulo,s.tema,t.titulo,'')";
        order = 'r.creado_en DESC,r.id DESC';
        if (p.estado) {
          values.push(p.estado === 'visible');
          where += ` AND r.visible=$${values.length}`;
        }
        break;
      case 'market-updates':
        fields =
          'n.id,n.anuncio_id,n.contenido,n.creado_en,n.oculta_en,a.titulo AS articulo,u.nombre AS vendedor_nombre';
        from =
          ' FROM actualizaciones_anuncio n JOIN anuncios_market a ON a.id=n.anuncio_id JOIN usuarios u ON u.id=a.vendedor_id';
        search = 'a.titulo';
        order = 'n.creado_en DESC,n.id DESC';
        if (p.estado === 'visible') where += ' AND n.oculta_en IS NULL';
        if (p.estado === 'oculta') where += ' AND n.oculta_en IS NOT NULL';
        break;
      default:
        throw new Error('Vista interna no reconocida.');
    }
    if (p.q) {
      values.push(`%${p.q}%`);
      where += ` AND ${search} ILIKE $${values.length}`;
    }
    const base = `${from} WHERE ${where}`;
    const [rows, count] = await Promise.all([
      this.manager.query<Registro[]>(
        `SELECT ${fields}${base} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, p.limit, (p.page - 1) * p.limit],
      ),
      this.manager.query<{ total: number }[]>(
        `SELECT COUNT(*)::int AS total${base}`,
        values,
      ),
    ]);
    return {
      items: rows.map(camelRow),
      total: count[0].total,
      page: p.page,
      limit: p.limit,
    };
  }
  async course(id: string): Promise<Registro> {
    const [courses, sections, lessons, sessions] = await Promise.all([
      this.manager.query<Registro[]>(
        'SELECT t.*,u.nombre AS tutor_nombre,a.nombre AS area_nombre FROM tutorias t JOIN usuarios u ON u.id=t.tutor_id JOIN areas_tutoria a ON a.id=t.area_id WHERE t.id=$1 AND t.eliminada_en IS NULL',
        [id],
      ),
      this.manager.query<Registro[]>(
        'SELECT id,titulo,orden FROM secciones_tutoria WHERE tutoria_id=$1 AND archivada_en IS NULL ORDER BY orden',
        [id],
      ),
      this.manager.query<Registro[]>(
        'SELECT id,seccion_id,titulo,tipo,orden,publicada,vista_previa FROM lecciones_tutoria WHERE tutoria_id=$1 AND archivada_en IS NULL ORDER BY orden',
        [id],
      ),
      this.manager.query<Registro[]>(
        'SELECT id,titulo,inicio_en,fin_en,estado,capacidad FROM sesiones_tutoria WHERE tutoria_id=$1 ORDER BY inicio_en',
        [id],
      ),
    ]);
    return courses[0]
      ? {
          ...camelRow(courses[0]),
          secciones: sections.map(camelRow),
          lecciones: lessons.map(camelRow),
          sesiones: sessions.map(camelRow),
        }
      : {};
  }
}

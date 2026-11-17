// Archivo: src/shared/base_datos/administracion.queries.ts
// Construye consultas de paneles, métricas y resúmenes autorizados para administración.

import { EntityManager } from 'typeorm';
import {
  Pagina,
  Paginacion,
  Registro,
} from '../../core/dominio/comun/contratos';
import { camelRow } from './postgres.database';

/** Proyecciones administrativas acotadas. Los historiales se autorizan en el caso de uso. */
export class AdministracionQueries {
  constructor(private readonly manager: EntityManager) {}

  conversations(p: Paginacion & Registro): Promise<Pagina> {
    const values: unknown[] = [];
    let where = 'TRUE';
    for (const [field, sql] of [
      ['tipo', 'c.tipo'],
      ['conversacionId', 'c.id'],
    ]) {
      if (p[field] === undefined) continue;
      values.push(p[field]);
      where += ` AND ${sql}=$${values.length}`;
    }
    if (p.usuarioId) {
      values.push(p.usuarioId);
      where += ` AND (c.consultante_id=$${values.length} OR c.propietario_id=$${values.length})`;
    }
    if (p.q) {
      values.push(`%${p.q}%`);
      where += ` AND (buyer.nombre ILIKE $${values.length} OR owner.nombre ILIKE $${values.length} OR COALESCE(a.titulo,s.tema,t.titulo,'') ILIKE $${values.length})`;
    }
    return this.page(
      `SELECT c.id,c.tipo,c.estado,c.anuncio_id,c.tutoria_id,c.consultante_id,c.propietario_id,c.ultimo_mensaje_en,
       buyer.nombre AS consultante_nombre,owner.nombre AS propietario_nombre,
       COALESCE(a.titulo,s.tema,t.titulo) AS recurso_titulo,
       (SELECT COUNT(*)::int FROM mensajes m WHERE m.conversacion_id=c.id) AS mensajes`,
      ` FROM conversaciones c JOIN usuarios buyer ON buyer.id=c.consultante_id
        JOIN usuarios owner ON owner.id=c.propietario_id LEFT JOIN anuncios_market a ON a.id=c.anuncio_id
        LEFT JOIN solicitudes_apoyo s ON s.id=c.solicitud_apoyo_id
        LEFT JOIN tutorias t ON t.id=COALESCE(c.tutoria_id,s.curso_id) WHERE ${where}`,
      values,
      p,
      'c.ultimo_mensaje_en DESC NULLS LAST,c.id DESC',
    );
  }

  private async page(
    select: string,
    from: string,
    values: unknown[],
    p: Paginacion,
    order: string,
  ): Promise<Pagina> {
    const [rows, count] = await Promise.all([
      this.manager.query<Registro[]>(
        `${select}${from} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, p.limit, (p.page - 1) * p.limit],
      ),
      this.manager.query<{ total: number }[]>(
        `SELECT COUNT(*)::int AS total${from}`,
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

  users(p: Paginacion & Registro): Promise<Pagina> {
    const values: unknown[] = [];
    let where = 'u.eliminado_en IS NULL';
    if (p.q) {
      values.push(`%${p.q}%`);
      where += ` AND (u.nombre ILIKE $${values.length} OR u.email ILIKE $${values.length} OR u.id::text ILIKE $${values.length})`;
    }
    if (p.estado) {
      values.push(p.estado);
      where += ` AND u.estado=$${values.length}`;
    }
    if (p.rol === 'tutor')
      where +=
        " AND EXISTS(SELECT 1 FROM habilitaciones_tutor h WHERE h.tutor_id=u.id AND h.estado='vigente' AND h.valida_desde<=CURRENT_TIMESTAMP AND (h.valida_hasta IS NULL OR h.valida_hasta>CURRENT_TIMESTAMP))";
    else if (p.rol) {
      values.push(p.rol);
      where += ` AND EXISTS(SELECT 1 FROM usuario_roles r WHERE r.usuario_id=u.id AND r.rol_codigo=$${values.length})`;
    }
    // Ordenaciones cerradas: jamás se interpola un identificador procedente de HTTP.
    const order =
      p.sort === 'nombre'
        ? 'u.nombre ASC,u.id DESC'
        : p.sort === 'publicaciones'
          ? 'publicaciones DESC,u.id DESC'
          : 'u.id DESC';
    return this.page(
      `SELECT u.id,u.nombre,u.email,u.estado,u.creado_en,u.email_verificado_en,p.ciudad,p.pais,p.universidad,p.carrera,p.avatar_archivo_id,
      ARRAY(SELECT r.rol_codigo FROM usuario_roles r WHERE r.usuario_id=u.id ORDER BY r.rol_codigo) AS roles,
      (SELECT COUNT(*)::int FROM tutorias t WHERE t.tutor_id=u.id AND t.eliminada_en IS NULL) AS tutorias,
      (SELECT COUNT(*)::int FROM anuncios_market a WHERE a.vendedor_id=u.id AND a.eliminado_en IS NULL) AS publicaciones,
      EXISTS(SELECT 1 FROM habilitaciones_tutor h WHERE h.tutor_id=u.id AND h.estado='vigente' AND h.valida_desde<=CURRENT_TIMESTAMP AND (h.valida_hasta IS NULL OR h.valida_hasta>CURRENT_TIMESTAMP)) AS tutor_verificado`,
      ` FROM usuarios u LEFT JOIN perfiles_usuario p ON p.usuario_id=u.id WHERE ${where}`,
      values,
      p,
      order,
    );
  }

  async userSummary(userId: number): Promise<Registro> {
    const [listings, courses, grants, audit, totals] = await Promise.all([
      this.manager.query<Registro[]>(
        `SELECT a.id,a.titulo,a.estado,a.precio_base,a.moneda,a.creado_en,
        (SELECT i.archivo_id FROM imagenes_anuncio i WHERE i.anuncio_id=a.id ORDER BY i.orden LIMIT 1) AS portada_archivo_id
        FROM anuncios_market a WHERE a.vendedor_id=$1 AND a.eliminado_en IS NULL ORDER BY a.id DESC LIMIT 6`,
        [userId],
      ),
      this.manager.query<Registro[]>(
        `SELECT id,titulo,estado,precio_base,moneda,portada_archivo_id FROM tutorias WHERE tutor_id=$1 AND eliminada_en IS NULL ORDER BY id DESC LIMIT 6`,
        [userId],
      ),
      this.manager.query<Registro[]>(
        `SELECT h.id,h.estado,h.valida_desde,h.valida_hasta,a.nombre AS area FROM habilitaciones_tutor h JOIN areas_tutoria a ON a.id=h.area_id WHERE h.tutor_id=$1 ORDER BY h.id DESC LIMIT 10`,
        [userId],
      ),
      this.manager.query<Registro[]>(
        `SELECT id,accion,entidad,entidad_id,creado_en FROM eventos_auditoria WHERE actor_id=$1 OR (entidad='usuario' AND entidad_id=$1::text) ORDER BY id DESC LIMIT 10`,
        [userId],
      ),
      this.manager.query<Registro[]>(
        `SELECT
        (SELECT COUNT(*)::int FROM anuncios_market WHERE vendedor_id=$1 AND eliminado_en IS NULL) AS publicaciones,
        (SELECT COUNT(*)::int FROM tutorias WHERE tutor_id=$1 AND eliminada_en IS NULL) AS tutorias,
        (SELECT COUNT(*)::int FROM inscripciones_tutoria WHERE alumno_id=$1 AND estado IN ('activa','completada')) AS inscripciones,
        (SELECT COUNT(*)::int FROM sesiones_usuario WHERE usuario_id=$1 AND revocada_en IS NULL AND expira_en>CURRENT_TIMESTAMP) AS sesiones_activas`,
        [userId],
      ),
    ]);
    return {
      resumen: camelRow(totals[0]),
      publicaciones: listings.map(camelRow),
      tutorias: courses.map(camelRow),
      acreditaciones: grants.map(camelRow),
      actividad: audit.map(camelRow),
    };
  }

  publications(
    kind: 'courses' | 'listings',
    p: Paginacion & Registro,
  ): Promise<Pagina> {
    const course = kind === 'courses';
    const table = course ? 'tutorias' : 'anuncios_market';
    const owner = course ? 'tutor_id' : 'vendedor_id';
    const category = course ? 'areas_tutoria' : 'categorias_market';
    const fk = course ? 'area_id' : 'categoria_id';
    const values: unknown[] = [];
    let where = `t.${course ? 'eliminada_en' : 'eliminado_en'} IS NULL`;
    if (p.q) {
      values.push(`%${p.q}%`);
      where += ` AND (t.titulo ILIKE $${values.length} OR u.nombre ILIKE $${values.length})`;
    }
    if (p.estado) {
      values.push(p.estado);
      where += ` AND t.estado=$${values.length}`;
    }
    if (p.propietarioId) {
      values.push(p.propietarioId);
      where += ` AND t.${owner}=$${values.length}`;
    }
    return this.page(
      `SELECT t.*,u.nombre AS ${course ? 'tutor_nombre' : 'vendedor_nombre'},a.nombre AS ${course ? 'area_nombre' : 'categoria_nombre'}`,
      ` FROM ${table} t JOIN usuarios u ON u.id=t.${owner} JOIN ${category} a ON a.id=t.${fk} WHERE ${where}`,
      values,
      p,
      't.id DESC',
    );
  }

  async dashboardExtras(): Promise<Registro> {
    const [states, courses, tutors, pending] = await Promise.all([
      this.manager.query<Registro[]>(
        'SELECT estado,COUNT(*)::int AS total FROM usuarios WHERE eliminado_en IS NULL GROUP BY estado',
      ),
      this.manager.query<Registro[]>(
        'SELECT estado,COUNT(*)::int AS total FROM tutorias WHERE eliminada_en IS NULL GROUP BY estado',
      ),
      this.manager.query<
        Registro[]
      >(`SELECT u.id,u.nombre,p.avatar_archivo_id,COUNT(DISTINCT t.id)::int AS cursos,COUNT(i.id)::int AS alumnos
        FROM usuarios u JOIN tutorias t ON t.tutor_id=u.id AND t.eliminada_en IS NULL
        LEFT JOIN perfiles_usuario p ON p.usuario_id=u.id
        LEFT JOIN inscripciones_tutoria i ON i.tutoria_id=t.id AND i.estado IN ('activa','completada')
        WHERE u.eliminado_en IS NULL AND u.estado='activo' GROUP BY u.id,p.avatar_archivo_id ORDER BY alumnos DESC,u.id DESC LIMIT 8`),
      this.manager.query<
        Registro[]
      >(`SELECT s.id,s.estado,s.creado_en,u.nombre,a.nombre AS area
        FROM solicitudes_tutor s JOIN usuarios u ON u.id=s.tutor_id JOIN areas_tutoria a ON a.id=s.area_id
        WHERE s.estado IN ('enviada','en_revision') ORDER BY s.creado_en ASC LIMIT 5`),
    ]);
    return {
      estadosUsuarios: states,
      estadosCursos: courses,
      tutoresDemandados: tutors.map(camelRow),
      solicitudesRecientes: pending.map(camelRow),
    };
  }
}

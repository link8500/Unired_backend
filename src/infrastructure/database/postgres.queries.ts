import { EntityManager } from 'typeorm';
import { Page, Pagination, Queries, Row } from '../../domain/common/contracts';
import { camelRow } from './postgres.database';
import { PublicCourse, PublicListing } from '../../domain/common/models';

const courseAccess =
  "t.estado = 'publicada' AND t.eliminada_en IS NULL AND u.estado = 'activo' AND u.eliminado_en IS NULL AND a.activo AND h.estado = 'vigente' AND h.valida_desde <= CURRENT_TIMESTAMP AND (h.valida_hasta IS NULL OR h.valida_hasta > CURRENT_TIMESTAMP)";
const courseJoin =
  ' FROM tutorias t JOIN usuarios u ON u.id=t.tutor_id JOIN areas_tutoria a ON a.id=t.area_id JOIN habilitaciones_tutor h ON h.id=t.habilitacion_id';
const courseFields =
  "t.id,t.tutor_id,t.area_id,t.titulo,t.descripcion,t.nivel,t.modalidad,t.precio_base,t.descuento_porcentaje,t.moneda,t.portada_archivo_id,t.publicada_en,u.nombre AS tutor_nombre,a.nombre AS area_nombre,(SELECT COUNT(*)::int FROM inscripciones_tutoria i WHERE i.tutoria_id=t.id AND i.estado IN ('activa','completada')) AS alumnos,(SELECT ROUND(AVG(r.puntuacion),2)::text FROM resenas_tutoria r WHERE r.tutoria_id=t.id AND r.estado='visible') AS puntuacion";
const listingJoin =
  ' FROM anuncios_market t JOIN usuarios u ON u.id=t.vendedor_id JOIN categorias_market a ON a.id=t.categoria_id';
const listingAccess =
  "t.estado IN ('publicado','reservado','vendido') AND t.eliminado_en IS NULL AND u.estado='activo' AND u.eliminado_en IS NULL AND a.activo";
const listingFields =
  "t.id,t.vendedor_id,t.categoria_id,t.titulo,t.descripcion,t.condicion,t.estado,t.tipo_precio,t.precio_base,t.descuento_porcentaje,t.moneda,t.ciudad,t.publicado_en,t.vendido_en,u.nombre AS vendedor_nombre,a.nombre AS categoria_nombre,(SELECT f.archivo_id::text FROM imagenes_anuncio f JOIN archivos af ON af.id=f.archivo_id WHERE f.anuncio_id=t.id AND af.estado='listo' AND af.escaneo='limpio' AND af.eliminado_en IS NULL ORDER BY f.orden LIMIT 1) AS portada_archivo_id";

/** Consultas de lectura agregadas: catálogo público no expone secretos ni documentos. */
export class PostgresQueries implements Queries {
  constructor(private readonly manager: EntityManager) {}
  private async page(
    sql: string,
    count: string,
    values: unknown[],
    p: Pagination,
  ): Promise<Page> {
    const [items, totals] = await Promise.all([
      this.manager.query<Row[]>(
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
    p: Pagination & Row,
  ): Promise<Page> {
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
    const join = courses ? courseJoin : listingJoin;
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
  async publicCourse(id: string): Promise<PublicCourse | undefined> {
    const [row] = await this.manager.query<Row[]>(
      'SELECT ' +
        courseFields +
        courseJoin +
        ' WHERE ' +
        courseAccess +
        ' AND t.id=$1',
      [id],
    );
    return row ? (camelRow(row) as PublicCourse) : undefined;
  }
  async publicListing(id: string): Promise<PublicListing | undefined> {
    const [row] = await this.manager.query<Row[]>(
      'SELECT ' +
        listingFields +
        listingJoin +
        ' WHERE ' +
        listingAccess +
        ' AND t.id=$1',
      [id],
    );
    return row ? (camelRow(row) as PublicListing) : undefined;
  }
  conversations(userId: number, p: Pagination): Promise<Page> {
    const join =
      ' FROM conversaciones c JOIN participantes_conversacion p ON p.conversacion_id=c.id JOIN usuarios u ON u.id=CASE WHEN c.propietario_id=$1 THEN c.consultante_id ELSE c.propietario_id END';
    const where =
      ' WHERE p.usuario_id=$1 AND p.archivada_en IS NULL AND p.salio_en IS NULL';
    return this.page(
      'SELECT c.id,c.tipo,c.anuncio_id,c.tutoria_id,c.estado,c.ultimo_mensaje_en,u.id AS interlocutor_id,u.nombre AS interlocutor_nombre' +
        join +
        where +
        ' ORDER BY c.ultimo_mensaje_en DESC NULLS LAST,c.id DESC',
      'SELECT COUNT(*)::int AS total' + join + where,
      [userId],
      p,
    );
  }
  students(courseId: string, p: Pagination): Promise<Page> {
    const join =
      ' FROM inscripciones_tutoria i JOIN usuarios u ON u.id=i.alumno_id WHERE i.tutoria_id=$1';
    return this.page(
      'SELECT i.id,i.alumno_id,i.estado,i.creado_en,u.nombre,(SELECT COUNT(*)::int FROM progreso_lecciones pl JOIN lecciones_tutoria l ON l.id=pl.leccion_id WHERE pl.inscripcion_id=i.id AND pl.completada_en IS NOT NULL AND l.publicada AND l.archivada_en IS NULL) AS completadas' +
        join +
        ' ORDER BY i.id DESC',
      'SELECT COUNT(*)::int AS total' + join,
      [courseId],
      p,
    );
  }
  async dashboard(): Promise<Row> {
    const [row] = await this.manager.query<Row[]>(
      "SELECT (SELECT COUNT(*)::int FROM usuarios WHERE eliminado_en IS NULL) AS usuarios,(SELECT COUNT(*)::int FROM solicitudes_tutor WHERE estado IN ('enviada','en_revision')) AS solicitudes_pendientes,(SELECT COUNT(*)::int FROM tutorias WHERE eliminada_en IS NULL) AS cursos,(SELECT COUNT(*)::int FROM anuncios_market WHERE eliminado_en IS NULL) AS anuncios,(SELECT COUNT(*)::int FROM denuncias WHERE estado IN ('pendiente','en_revision')) AS denuncias_pendientes,(SELECT COUNT(*)::int FROM conversaciones) AS conversaciones",
    );
    return camelRow(row);
  }
  async analytics(days: number): Promise<Row> {
    const daily = await this.manager.query<Row[]>(
      "SELECT to_char(d.dia,'YYYY-MM-DD') AS dia," +
        "(SELECT COUNT(*)::int FROM usuarios u WHERE u.creado_en>=d.dia AND u.creado_en<d.dia+interval '1 day') AS usuarios_registrados," +
        "(SELECT COUNT(*)::int FROM tutorias t WHERE t.creado_en>=d.dia AND t.creado_en<d.dia+interval '1 day') AS cursos_creados," +
        "(SELECT COUNT(*)::int FROM anuncios_market a WHERE a.creado_en>=d.dia AND a.creado_en<d.dia+interval '1 day') AS anuncios_creados," +
        "(SELECT COUNT(*)::int FROM inscripciones_tutoria i WHERE i.creado_en>=d.dia AND i.creado_en<d.dia+interval '1 day') AS inscripciones_creadas," +
        "(SELECT COUNT(*)::int FROM anuncios_market a WHERE a.vendido_en>=d.dia AND a.vendido_en<d.dia+interval '1 day') AS ventas_declaradas " +
        "FROM generate_series(date_trunc('day',CURRENT_TIMESTAMP)-($1::int-1)*interval '1 day',date_trunc('day',CURRENT_TIMESTAMP),interval '1 day') d(dia) ORDER BY d.dia",
      [days],
    );
    const top = await this.manager.query<Row[]>(
      'SELECT t.id,t.titulo,u.id AS tutor_id,u.nombre AS tutor_nombre,COUNT(i.id)::int AS alumnos ' +
        "FROM tutorias t JOIN usuarios u ON u.id=t.tutor_id LEFT JOIN inscripciones_tutoria i ON i.tutoria_id=t.id AND i.estado IN ('activa','completada') " +
        'WHERE t.eliminada_en IS NULL GROUP BY t.id,u.id ORDER BY alumnos DESC,t.id DESC LIMIT 10',
    );
    return {
      timezone: 'UTC',
      actividad: daily.map(camelRow),
      cursosDemandados: top.map(camelRow),
      nota: 'Ventas declaradas por vendedores; no representan pagos verificados ni ingresos de UniRed.',
    };
  }
}

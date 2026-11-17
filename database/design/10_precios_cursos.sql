-- Estandariza el precio publicado; preserva contenido, cuentas e inscripciones.
-- Los cursos son online: los minutos proceden de videos, texto y sesiones.
WITH precios AS (
 SELECT t.id,COALESCE(r.precio_minuto_online,c.precio_minuto_online)*COALESCE((SELECT NULLIF(CEIL((
    COALESCE((SELECT SUM(CASE
      WHEN l.tipo='video' AND v.estado='listo' AND v.escaneo='limpio'
        AND v.eliminado_en IS NULL THEN COALESCE(v.duracion_segundos,0)
      WHEN l.tipo='texto' THEN CARDINALITY(regexp_split_to_array(
        NULLIF(BTRIM(l.contenido_texto, E' \t\r\n'),''),'[[:space:]]+'))*0.25
      ELSE 0 END)
      FROM lecciones_tutoria l
      JOIN secciones_tutoria s ON s.id=l.seccion_id AND s.archivada_en IS NULL
      LEFT JOIN archivos v ON v.id=l.video_archivo_id
      WHERE l.tutoria_id=t.id AND l.archivada_en IS NULL
      AND l.publicada),0)
    + COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (ss.fin_en-ss.inicio_en)))
      FROM sesiones_tutoria ss WHERE ss.tutoria_id=t.id AND ss.estado<>'cancelada'),0)
  )/60),0)::int),0) AS total
 FROM tutorias t CROSS JOIN configuracion_comercial c
 LEFT JOIN tarifas_tutoria r ON r.area_id=t.area_id
 WHERE c.id=1
)
UPDATE tutorias t SET precio_base=p.total,descuento_porcentaje=0,moneda='NIO',version_lock=t.version_lock+1
FROM precios p WHERE t.id=p.id AND (t.precio_base,t.descuento_porcentaje,t.moneda) IS DISTINCT FROM (p.total,0::numeric,'NIO'::char(3));

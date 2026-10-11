-- PostgreSQL 16: consultas de referencia, no script psql.
-- Cada consulta utiliza $1, $2... y se ejecuta por separado con un array enlazado.
-- actor_id SIEMPRE se obtiene de la sesión autenticada; no del body del cliente.
-- Ninguna consulta reemplaza autorización por recurso.

-- 1. Catálogo educativo aprobado
-- Parámetros: ninguno
SELECT t.id, t.titulo, t.descripcion, t.nivel, t.modalidad,
       t.precio_base, t.descuento_porcentaje, t.moneda,
       ROUND(t.precio_base * (1 - t.descuento_porcentaje / 100), 2) AS precio_final,
       u.nombre AS tutor, a.nombre AS area
FROM tutorias t
JOIN usuarios u ON u.id = t.tutor_id
JOIN areas_tutoria a ON a.id = t.area_id
JOIN habilitaciones_tutor h ON h.id = t.habilitacion_id
JOIN revisiones_tutor rv ON rv.id = h.revision_id AND rv.decision = 'aprobada'
WHERE t.estado = 'publicada' AND t.eliminada_en IS NULL AND u.estado = 'activo'
  AND h.estado = 'vigente'
  AND h.valida_desde <= CURRENT_TIMESTAMP
  AND (h.valida_hasta IS NULL OR h.valida_hasta > CURRENT_TIMESTAMP)
ORDER BY t.publicada_en DESC, t.id DESC
LIMIT 24;

-- 2. Mis cursos y progreso
-- Parámetros: actor_id
SELECT i.id AS inscripcion_id, t.id AS tutoria_id, t.titulo, i.estado,
       COUNT(l.id) AS total_lecciones,
       COALESCE(SUM((p.completada_en IS NOT NULL)::int), 0) AS completadas,
       CASE WHEN COUNT(l.id) = 0 THEN 0
            ELSE ROUND(100.0 * COALESCE(SUM((p.completada_en IS NOT NULL)::int), 0) / COUNT(l.id), 1)
       END AS porcentaje_progreso
FROM inscripciones_tutoria i
JOIN tutorias t ON t.id = i.tutoria_id
LEFT JOIN secciones_tutoria s ON s.tutoria_id = t.id AND s.archivada_en IS NULL
LEFT JOIN lecciones_tutoria l ON l.seccion_id = s.id AND l.publicada = TRUE AND l.archivada_en IS NULL
LEFT JOIN progreso_lecciones p ON p.inscripcion_id = i.id AND p.leccion_id = l.id
WHERE i.alumno_id = $1 AND i.estado IN ('activa','completada')
GROUP BY i.id, t.id, t.titulo, i.estado
ORDER BY i.id DESC;

-- 3. Seguimiento del tutor
-- Parámetros: curso_id, actor_id
SELECT i.id AS inscripcion_id, u.nombre AS alumno,
       COUNT(l.id) AS total_lecciones,
       COALESCE(SUM((p.completada_en IS NOT NULL)::int), 0) AS completadas,
       i.ultimo_acceso_en
FROM tutorias t
JOIN inscripciones_tutoria i ON i.tutoria_id = t.id AND i.estado IN ('activa','completada')
JOIN usuarios u ON u.id = i.alumno_id
LEFT JOIN secciones_tutoria s ON s.tutoria_id = t.id AND s.archivada_en IS NULL
LEFT JOIN lecciones_tutoria l ON l.seccion_id = s.id AND l.publicada = TRUE AND l.archivada_en IS NULL
LEFT JOIN progreso_lecciones p ON p.inscripcion_id = i.id AND p.leccion_id = l.id
WHERE t.id = $1 AND t.tutor_id = $2
GROUP BY i.id, u.nombre, i.ultimo_acceso_en
ORDER BY i.id DESC;

-- 4. Cola de acreditación
-- Parámetros: actor_id
SELECT s.id, s.tutor_id, u.nombre, a.nombre AS area, s.estado, s.asignada_a, s.creado_en
FROM solicitudes_tutor s
JOIN usuarios u ON u.id = s.tutor_id
JOIN areas_tutoria a ON a.id = s.area_id
WHERE s.estado IN ('enviada','en_revision','correcciones')
  AND EXISTS (
    SELECT 1 FROM usuario_roles ur
    WHERE ur.usuario_id = $1 AND ur.rol_codigo IN ('administrador','revisor_tutores')
  )
ORDER BY s.creado_en, s.id
LIMIT 50;

-- 5. Feed de anuncios
-- Parámetros: cursor_fecha, cursor_id
SELECT a.id, a.titulo, a.condicion, a.estado, a.tipo_precio,
       a.precio_base, a.descuento_porcentaje, a.moneda, a.ciudad, a.publicado_en,
       u.nombre AS vendedor
FROM anuncios_market a
JOIN usuarios u ON u.id = a.vendedor_id
WHERE a.estado IN ('publicado','reservado') AND a.eliminado_en IS NULL AND u.estado = 'activo'
  AND ($1::timestamptz IS NULL OR a.publicado_en < $1::timestamptz
       OR (a.publicado_en = $1::timestamptz AND a.id < $2))
ORDER BY a.publicado_en DESC, a.id DESC
LIMIT 24;

-- 6. Novedades del anuncio
-- Parámetros: anuncio_id
SELECT n.id, n.contenido, n.creado_en
FROM actualizaciones_anuncio n
JOIN anuncios_market a ON a.id = n.anuncio_id
JOIN usuarios u ON u.id = a.vendedor_id
WHERE a.id = $1 AND n.oculta_en IS NULL
  AND a.estado IN ('publicado','reservado','vendido')
  AND a.eliminado_en IS NULL AND u.estado = 'activo'
ORDER BY n.creado_en DESC, n.id DESC
LIMIT 30;

-- 7. Mis conversaciones
-- Parámetros: actor_id
SELECT c.id, c.tipo, c.anuncio_id, c.tutoria_id, c.estado, c.ultimo_mensaje_en
FROM conversaciones c
JOIN participantes_conversacion pc ON pc.conversacion_id = c.id
WHERE pc.usuario_id = $1 AND pc.salio_en IS NULL AND pc.archivada_en IS NULL
ORDER BY c.ultimo_mensaje_en DESC, c.id DESC
LIMIT 30;

-- 8. Mensajes privados
-- Parámetros: conversacion_id, actor_id, cursor_id
SELECT m.id, m.autor_id, m.tipo,
       CASE WHEN m.eliminado_en IS NULL THEN m.contenido ELSE NULL END AS contenido,
       CASE WHEN m.eliminado_en IS NULL THEN m.archivo_id ELSE NULL END AS archivo_id,
       m.creado_en, m.eliminado_en
FROM mensajes m
WHERE m.conversacion_id = $1
  AND EXISTS (
    SELECT 1 FROM participantes_conversacion pc
    WHERE pc.conversacion_id = m.conversacion_id AND pc.usuario_id = $2 AND pc.salio_en IS NULL
  )
  AND ($3::bigint IS NULL OR m.id < $3::bigint)
ORDER BY m.id DESC
LIMIT 50;

-- 9. Retroalimentación del alumno
-- Parámetros: actor_id, curso_id
SELECT sa.id, sa.comentario, sa.creado_en
FROM seguimiento_alumnos sa
JOIN inscripciones_tutoria i ON i.id = sa.inscripcion_id
WHERE i.alumno_id = $1 AND sa.tutoria_id = $2
  AND sa.visibilidad = 'alumno_y_tutor'
ORDER BY sa.creado_en DESC, sa.id DESC
LIMIT 50;

-- 10. Valoraciones de cursos
-- Parámetros: ninguno
SELECT r.tutoria_id, ROUND(AVG(r.puntuacion), 2) AS promedio, COUNT(*) AS total
FROM resenas_tutoria r
JOIN tutorias t ON t.id = r.tutoria_id
WHERE r.estado = 'visible' AND t.estado = 'publicada' AND t.eliminada_en IS NULL
GROUP BY r.tutoria_id;

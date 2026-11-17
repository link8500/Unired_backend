-- Negociaciones y solicitudes de ayuda. No hay carrito ni cobros reales.
ALTER TABLE anuncios_market ADD COLUMN tipo_publicacion varchar(20) NOT NULL DEFAULT 'venta' CHECK(tipo_publicacion IN ('venta','compra','intercambio'));
CREATE TABLE ofertas_market (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anuncio_id bigint NOT NULL REFERENCES anuncios_market(id),
  comprador_id integer NOT NULL REFERENCES usuarios(id),
  vendedor_id integer NOT NULL REFERENCES usuarios(id),
  cliente_id uuid NOT NULL,
  tipo varchar(20) NOT NULL CHECK(tipo IN ('compra','intercambio')),
  importe numeric(12,2) NOT NULL CHECK(importe>=0),
  moneda char(3) NOT NULL,
  mensaje varchar(2000) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','aceptada','rechazada','cancelada','finalizada')),
  conversacion_id bigint REFERENCES conversaciones(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  resuelta_en timestamptz,
  CHECK(comprador_id<>vendedor_id),
  UNIQUE(comprador_id,cliente_id)
);
CREATE UNIQUE INDEX oferta_abierta_por_persona_idx ON ofertas_market(anuncio_id,comprador_id) WHERE estado IN ('pendiente','aceptada');
CREATE INDEX ofertas_vendedor_idx ON ofertas_market(vendedor_id,id DESC);
CREATE INDEX ofertas_comprador_idx ON ofertas_market(comprador_id,id DESC);
CREATE TABLE tarifas_tutoria (
  area_id integer PRIMARY KEY REFERENCES areas_tutoria(id),
  precio_minuto_online numeric(12,2) CHECK(precio_minuto_online>=0),
  precio_minuto_presencial numeric(12,2) CHECK(precio_minuto_presencial>=0),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE solicitudes_apoyo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alumno_id integer NOT NULL REFERENCES usuarios(id),
  tutor_id integer REFERENCES usuarios(id),
  area_id integer NOT NULL REFERENCES areas_tutoria(id),
  materia varchar(180) NOT NULL,
  tema varchar(180) NOT NULL,
  descripcion varchar(5000) NOT NULL,
  universidad varchar(180),
  carrera varchar(180),
  anio_estudio integer,
  modalidad varchar(20) NOT NULL CHECK(modalidad IN ('online','presencial')),
  duracion_minutos integer NOT NULL CHECK(duracion_minutos BETWEEN 15 AND 480),
  precio numeric(12,2) NOT NULL CHECK(precio>=0),
  comision numeric(12,2) NOT NULL CHECK(comision>=0),
  moneda char(3) NOT NULL DEFAULT 'NIO',
  estado varchar(20) NOT NULL DEFAULT 'publicada' CHECK(estado IN ('publicada','aceptada','cancelada','finalizada')),
  curso_id bigint REFERENCES tutorias(id),
  inscripcion_otorgada_id bigint REFERENCES inscripciones_tutoria(id),
  conversacion_id bigint REFERENCES conversaciones(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  aceptada_en timestamptz,
  cerrada_en timestamptz,
  CHECK(alumno_id<>tutor_id),
  CHECK((estado='publicada' AND tutor_id IS NULL) OR estado<>'publicada'),
  UNIQUE(id,tutor_id,alumno_id)
);
CREATE INDEX solicitudes_alumno_idx ON solicitudes_apoyo(alumno_id,id DESC);
CREATE INDEX solicitudes_tutor_idx ON solicitudes_apoyo(tutor_id,id DESC);
CREATE INDEX solicitudes_disponibles_idx ON solicitudes_apoyo(area_id,creado_en DESC) WHERE estado='publicada';
CREATE TABLE solicitudes_ignoradas (
  solicitud_id bigint NOT NULL REFERENCES solicitudes_apoyo(id),
  tutor_id integer NOT NULL REFERENCES usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(solicitud_id,tutor_id)
);
ALTER TABLE conversaciones ADD COLUMN solicitud_apoyo_id bigint;
ALTER TABLE conversaciones ADD CONSTRAINT conversacion_solicitud_fk FOREIGN KEY(solicitud_apoyo_id,propietario_id,consultante_id) REFERENCES solicitudes_apoyo(id,tutor_id,alumno_id);
ALTER TABLE conversaciones ADD CONSTRAINT conversacion_solicitud_uq UNIQUE(solicitud_apoyo_id);
ALTER TABLE conversaciones DROP CONSTRAINT ck_conversacion_contexto;
ALTER TABLE conversaciones ADD CONSTRAINT ck_conversacion_contexto CHECK(
  (tipo='market' AND anuncio_id IS NOT NULL AND tutoria_id IS NULL AND solicitud_apoyo_id IS NULL) OR
  (tipo='tutoria' AND anuncio_id IS NULL AND num_nonnulls(tutoria_id,solicitud_apoyo_id)=1)
);
CREATE TABLE resenas_interaccion (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  autor_id integer NOT NULL REFERENCES usuarios(id),
  receptor_id integer NOT NULL REFERENCES usuarios(id),
  oferta_id bigint REFERENCES ofertas_market(id),
  solicitud_id bigint REFERENCES solicitudes_apoyo(id),
  inscripcion_id bigint REFERENCES inscripciones_tutoria(id),
  puntuacion integer NOT NULL CHECK(puntuacion BETWEEN 1 AND 5),
  comentario varchar(2000) NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK(autor_id<>receptor_id),
  CHECK(num_nonnulls(oferta_id,solicitud_id,inscripcion_id)=1),
  UNIQUE(autor_id,oferta_id),UNIQUE(autor_id,solicitud_id),UNIQUE(autor_id,inscripcion_id)
);
CREATE INDEX reputacion_usuario_idx ON resenas_interaccion(receptor_id) WHERE visible;

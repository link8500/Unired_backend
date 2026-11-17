-- Gestión comercial de demostración. Nunca almacena datos de tarjetas ni representa dinero real.
CREATE TABLE configuracion_comercial (
  id bigint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  comision_porcentaje numeric(5,2) NOT NULL DEFAULT 10 CHECK (comision_porcentaje BETWEEN 0 AND 100),
  precio_destacado numeric(12,2) NOT NULL DEFAULT 50 CHECK (precio_destacado>=0),
  dias_destacado integer NOT NULL DEFAULT 7 CHECK (dias_destacado BETWEEN 1 AND 365),
  precio_minuto_online numeric(12,2) NOT NULL DEFAULT 3 CHECK (precio_minuto_online>=0),
  precio_minuto_presencial numeric(12,2) NOT NULL DEFAULT 4 CHECK (precio_minuto_presencial>=0),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO configuracion_comercial (id) VALUES (1);
CREATE TABLE empresas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  propietario_id integer NOT NULL REFERENCES usuarios(id),
  nombre varchar(180) NOT NULL,
  razon_social varchar(200) NOT NULL,
  ruc varchar(40) NOT NULL,
  email_comercial varchar(254) NOT NULL,
  telefono varchar(30) NOT NULL,
  sitio_web varchar(500),
  descripcion varchar(5000) NOT NULL,
  ciudad varchar(120) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada','suspendida')),
  motivo_revision varchar(2000),
  revisada_por integer REFERENCES usuarios(id),
  revisada_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ruc)
);
CREATE INDEX empresas_propietario_idx ON empresas(propietario_id,id DESC);
CREATE INDEX empresas_revision_idx ON empresas(estado,id DESC);
CREATE TABLE planes_empresa (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo varchar(40) NOT NULL UNIQUE,
  nombre varchar(120) NOT NULL,
  descripcion varchar(1000) NOT NULL,
  precio_mensual numeric(12,2) NOT NULL CHECK (precio_mensual>=0),
  max_campanas integer NOT NULL CHECK (max_campanas BETWEEN 1 AND 100),
  activo boolean NOT NULL DEFAULT true
);
INSERT INTO planes_empresa(codigo,nombre,descripcion,precio_mensual,max_campanas) VALUES
  ('inicio','Inicio','Para comenzar a dar a conocer tu empresa.',199,1),
  ('crecimiento','Crecimiento','Más espacio para tus campañas y novedades.',499,3),
  ('comunidad','Comunidad','Para una presencia constante en la comunidad.',899,6);
CREATE TABLE pagos_demo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES usuarios(id),
  cliente_id uuid NOT NULL,
  concepto varchar(40) NOT NULL CHECK (concepto IN ('suscripcion_empresa','recarga_tutor','destacar_anuncio','destacar_curso')),
  recurso_id bigint,
  importe numeric(12,2) NOT NULL CHECK (importe>0),
  moneda char(3) NOT NULL DEFAULT 'NIO' CHECK (moneda='NIO'),
  estado varchar(20) NOT NULL DEFAULT 'simulado' CHECK (estado='simulado'),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(usuario_id,cliente_id)
);
CREATE TABLE suscripciones_empresa (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES empresas(id),
  plan_id bigint NOT NULL REFERENCES planes_empresa(id),
  pago_id bigint NOT NULL UNIQUE REFERENCES pagos_demo(id),
  estado varchar(20) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','cancelada')),
  inicia_en timestamptz NOT NULL DEFAULT now(),
  vence_en timestamptz NOT NULL,
  cancelada_en timestamptz,
  CHECK(vence_en>inicia_en)
);
CREATE UNIQUE INDEX una_suscripcion_activa_empresa_idx ON suscripciones_empresa(empresa_id) WHERE estado='activa';
CREATE TABLE campanas_publicitarias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES empresas(id),
  suscripcion_id bigint NOT NULL REFERENCES suscripciones_empresa(id),
  titulo varchar(180) NOT NULL,
  descripcion varchar(2000) NOT NULL,
  banner_archivo_id bigint NOT NULL REFERENCES archivos(id),
  enlace varchar(500) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'borrador' CHECK(estado IN ('borrador','activa','pausada','finalizada','bloqueada')),
  inicia_en timestamptz NOT NULL,
  termina_en timestamptz NOT NULL,
  motivo_moderacion varchar(2000),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK(termina_en>inicia_en)
);
CREATE INDEX campanas_empresa_idx ON campanas_publicitarias(empresa_id,id DESC);
CREATE INDEX campanas_publicas_idx ON campanas_publicitarias(estado,inicia_en,termina_en);
CREATE TABLE carteras_tutor (
  usuario_id integer PRIMARY KEY REFERENCES usuarios(id),
  saldo_demo numeric(12,2) NOT NULL DEFAULT 0 CHECK(saldo_demo>=0),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE movimientos_cartera (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES usuarios(id),
  pago_id bigint UNIQUE REFERENCES pagos_demo(id),
  tipo varchar(30) NOT NULL CHECK (tipo IN ('recarga_demo','comision_demo')),
  importe numeric(12,2) NOT NULL CHECK(importe<>0),
  descripcion varchar(250) NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimientos_usuario_idx ON movimientos_cartera(usuario_id,id DESC);
CREATE TABLE destacados_publicacion (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  propietario_id integer NOT NULL REFERENCES usuarios(id),
  anuncio_id bigint REFERENCES anuncios_market(id),
  tutoria_id bigint REFERENCES tutorias(id),
  pago_id bigint NOT NULL UNIQUE REFERENCES pagos_demo(id),
  inicia_en timestamptz NOT NULL DEFAULT now(),
  termina_en timestamptz NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','bloqueado')),
  CHECK(num_nonnulls(anuncio_id,tutoria_id)=1),
  CHECK(termina_en>inicia_en)
);
CREATE INDEX destacados_anuncio_idx ON destacados_publicacion(anuncio_id,termina_en) WHERE estado='activo';
CREATE INDEX destacados_tutoria_idx ON destacados_publicacion(tutoria_id,termina_en) WHERE estado='activo';

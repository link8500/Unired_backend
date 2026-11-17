-- Solo se conservan identificadores externos. No se almacenan tokens de Google/Facebook.
CREATE TABLE identidades_externas (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 usuario_id integer NOT NULL REFERENCES usuarios(id),
 proveedor varchar(20) NOT NULL CHECK(proveedor IN ('google','facebook')),
 sujeto_proveedor varchar(200) NOT NULL,
 correo_proveedor varchar(254),
 creado_en timestamptz NOT NULL DEFAULT now(),
 actualizado_en timestamptz NOT NULL DEFAULT now(),
 UNIQUE(proveedor,sujeto_proveedor),UNIQUE(usuario_id,proveedor)
);
CREATE TABLE flujos_acceso_social (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 proveedor varchar(20) NOT NULL CHECK(proveedor IN ('google','facebook')),
 estado_hash bytea NOT NULL UNIQUE CHECK(octet_length(estado_hash)=32),
 reto_cliente varchar(43) NOT NULL,
 nonce varchar(128) NOT NULL,
 origen_frontend varchar(400) NOT NULL,
 usuario_vinculacion_id integer REFERENCES usuarios(id),
 sesion_vinculacion_id uuid REFERENCES sesiones_usuario(id),
 sujeto_proveedor varchar(200),nombre_proveedor varchar(180),correo_proveedor varchar(254),
 correo_verificado boolean NOT NULL DEFAULT false,
 codigo_hash bytea UNIQUE,
 callback_usado_en timestamptz,
 canjeado_en timestamptz,
 intentos_confirmacion integer NOT NULL DEFAULT 0 CHECK(intentos_confirmacion BETWEEN 0 AND 5),
 expira_en timestamptz NOT NULL,
 creado_en timestamptz NOT NULL DEFAULT now(),
 CHECK((usuario_vinculacion_id IS NULL)=(sesion_vinculacion_id IS NULL)),
 CHECK(codigo_hash IS NULL OR octet_length(codigo_hash)=32)
);
CREATE INDEX flujo_social_caducidad_idx ON flujos_acceso_social(expira_en);

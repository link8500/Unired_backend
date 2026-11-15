-- Ampliación aditiva. No reemplaza cursos, expedientes, anuncios ni sus propietarios.
ALTER TABLE tutorias
  ADD COLUMN resumen VARCHAR(500) NULL,
  ADD COLUMN idioma VARCHAR(60) NOT NULL DEFAULT 'Español',
  ADD COLUMN objetivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN requisitos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN dirigido_a VARCHAR(1500) NULL,
  ADD COLUMN duracion_estimada_minutos INTEGER NULL,
  ADD CONSTRAINT ck_curso_objetivos CHECK (jsonb_typeof(objetivos)='array' AND jsonb_array_length(objetivos)<=20),
  ADD CONSTRAINT ck_curso_requisitos CHECK (jsonb_typeof(requisitos)='array' AND jsonb_array_length(requisitos)<=20),
  ADD CONSTRAINT ck_curso_duracion_estimada CHECK (duracion_estimada_minutos BETWEEN 1 AND 100000);

ALTER TABLE anuncios_market
  ADD COLUMN marca VARCHAR(100) NULL,
  ADD COLUMN modelo VARCHAR(120) NULL,
  ADD COLUMN zona_entrega VARCHAR(180) NULL,
  ADD COLUMN detalle_entrega VARCHAR(1500) NULL,
  ADD COLUMN formas_entrega JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT ck_anuncio_formas_entrega CHECK (jsonb_typeof(formas_entrega)='array' AND jsonb_array_length(formas_entrega)<=4);

ALTER TABLE solicitudes_tutor
  ADD COLUMN formacion_academica VARCHAR(3000) NULL,
  ADD COLUMN experiencia_docente VARCHAR(3000) NULL,
  ADD COLUMN especialidades JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT ck_solicitud_especialidades CHECK (jsonb_typeof(especialidades)='array' AND jsonb_array_length(especialidades)<=20);

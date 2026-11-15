-- Extensión aditiva de autoría. La referencia interna no aparece en el catálogo público.
ALTER TABLE anuncios_market
  ADD COLUMN atributos JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN etiquetas JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN disponibilidad VARCHAR(30) NOT NULL DEFAULT 'unico',
  ADD COLUMN referencia_privada VARCHAR(100) NULL,
  ADD CONSTRAINT ck_anuncio_atributos CHECK (jsonb_typeof(atributos)='object'),
  ADD CONSTRAINT ck_anuncio_etiquetas CHECK (jsonb_typeof(etiquetas)='array' AND jsonb_array_length(etiquetas)<=20),
  ADD CONSTRAINT ck_anuncio_disponibilidad CHECK (disponibilidad IN ('unico','varias_unidades'));

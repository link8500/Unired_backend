-- Evolución aditiva: conserva los perfiles, cuentas y migraciones anteriores.
-- No replica datos de prueba ni adivina universidad, residencia o empleo.
ALTER TABLE perfiles_usuario
  ADD COLUMN pais VARCHAR(80) NULL,
  ADD COLUMN departamento VARCHAR(120) NULL,
  ADD COLUMN universidad VARCHAR(180) NULL,
  ADD COLUMN sede VARCHAR(180) NULL,
  ADD COLUMN carrera VARCHAR(180) NULL,
  ADD COLUMN anio_estudio SMALLINT NULL,
  ADD COLUMN trabaja BOOLEAN NULL,
  ADD COLUMN ocupacion VARCHAR(160) NULL,
  ADD CONSTRAINT ck_perfil_anio_estudio CHECK (anio_estudio IS NULL OR anio_estudio BETWEEN 1 AND 15),
  ADD CONSTRAINT ck_perfil_ocupacion CHECK (ocupacion IS NULL OR trabaja IS TRUE);

COMMENT ON COLUMN perfiles_usuario.trabaja IS 'NULL: no indicado; TRUE: trabaja; FALSE: no trabaja.';
COMMENT ON COLUMN perfiles_usuario.universidad IS 'Dato personal privado; no separa comunidades ni concede permisos.';
COMMENT ON COLUMN perfiles_usuario.carrera IS 'Carrera declarada; no sustituye la acreditación del tutor.';

/** Modelos persistidos del negocio, sin decoradores ni dependencias de NestJS.
 * PostgreSQL conserva BIGINT/NUMERIC como cadenas para evitar pérdida de precisión.
 * JSON de entrada y proyecciones adicionales permanecen unknown hasta validarlos.
 */
export type DataRow = Record<string, unknown>;
export interface Usuarios extends DataRow {
  id: number;
  nombre: string;
  email: string;
  edad: number | null;
  estado: string;
  emailVerificadoEn: Date | null;
  eliminadoEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface Roles extends DataRow {
  codigo: string;
  nombre: string;
}

export interface UsuarioRoles extends DataRow {
  usuarioId: number;
  rolCodigo: string;
  asignadoPor: number | null;
  creadoEn: Date;
}

export interface CredencialesUsuario extends DataRow {
  usuarioId: number;
  passwordHash: string;
  cambiadaEn: Date;
}

export interface SesionesUsuario extends DataRow {
  id: string;
  usuarioId: number;
  refreshTokenHash: Buffer;
  expiraEn: Date;
  revocadaEn: Date | null;
  creadoEn: Date;
}

export interface TokensCuenta extends DataRow {
  id: string;
  usuarioId: number;
  proposito: string;
  tokenHash: Buffer;
  expiraEn: Date;
  usadoEn: Date | null;
  creadoEn: Date;
}

export interface Archivos extends DataRow {
  id: string;
  propietarioId: number;
  proposito: string;
  storageBucket: string;
  proveedor: string;
  extension: string;
  anchoPx: number | null;
  altoPx: number | null;
  storageKey: string;
  nombreOriginal: string;
  mimeDetectado: string;
  tamanoBytes: string;
  sha256: Buffer;
  estado: string;
  escaneo: string;
  procesamiento: string;
  duracionSegundos: number | null;
  eliminadoEn: Date | null;
  creadoEn: Date;
}

export interface PerfilesUsuario extends DataRow {
  usuarioId: number;
  presentacion: string | null;
  telefono: string | null;
  telefonoPublico: boolean;
  areaProfesional: string | null;
  ciudad: string | null;
  avatarArchivoId: string | null;
  bannerArchivoId: string | null;
  notificacionesActivas: boolean;
  actualizadoEn: Date;
}

export interface AreasTutoria extends DataRow {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  requisitosDocumentales: string[];
}

export interface SolicitudesTutor extends DataRow {
  id: string;
  tutorId: number;
  areaId: number;
  estado: string;
  asignadaA: number | null;
  versionLock: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface DocumentosSolicitud extends DataRow {
  id: string;
  solicitudId: string;
  tutorId: number;
  archivoId: string;
  grupoDocumento: string;
  version: number;
  tipo: string;
  descripcion: string | null;
  creadoEn: Date;
}

export interface EnviosSolicitud extends DataRow {
  id: string;
  solicitudId: string;
  numero: number;
  enviadoEn: Date;
}

export interface EnvioDocumentos extends DataRow {
  envioId: string;
  documentoId: string;
  solicitudId: string;
}

export interface RevisionesTutor extends DataRow {
  id: string;
  envioId: string;
  solicitudId: string;
  revisorId: number;
  decision: string;
  motivo: string;
  creadoEn: Date;
}

export interface HabilitacionesTutor extends DataRow {
  id: string;
  tutorId: number;
  areaId: number;
  solicitudId: string;
  revisionId: string;
  estado: string;
  validaDesde: Date;
  validaHasta: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface Tutorias extends DataRow {
  id: string;
  tutorId: number;
  areaId: number;
  habilitacionId: string | null;
  titulo: string;
  descripcion: string;
  nivel: string;
  modalidad: string;
  estado: string;
  precioBase: string;
  descuentoPorcentaje: string;
  moneda: string;
  portadaArchivoId: string | null;
  versionLock: number;
  publicadaEn: Date | null;
  eliminadaEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface SeccionesTutoria extends DataRow {
  id: string;
  tutoriaId: string;
  titulo: string;
  orden: number;
  archivadaEn: Date | null;
}

export interface LeccionesTutoria extends DataRow {
  id: string;
  tutoriaId: string;
  seccionId: string;
  tutorId: number;
  titulo: string;
  tipo: string;
  contenidoTexto: string | null;
  videoArchivoId: string | null;
  orden: number;
  vistaPrevia: boolean;
  publicada: boolean;
  archivadaEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface RecursosLeccion extends DataRow {
  id: string;
  leccionId: string;
  tutoriaId: string;
  tutorId: number;
  archivoId: string;
  titulo: string;
}

export interface InscripcionesTutoria extends DataRow {
  id: string;
  tutoriaId: string;
  alumnoId: number;
  estado: string;
  activadaEn: Date | null;
  completadaEn: Date | null;
  ultimoAccesoEn: Date | null;
  creadoEn: Date;
}

export interface ProgresoLecciones extends DataRow {
  inscripcionId: string;
  leccionId: string;
  tutoriaId: string;
  posicionSegundos: number;
  completadaEn: Date | null;
  actualizadoEn: Date;
}

export interface SeguimientoAlumnos extends DataRow {
  id: string;
  inscripcionId: string;
  tutoriaId: string;
  tutorId: number;
  visibilidad: string;
  comentario: string;
  creadoEn: Date;
}

export interface PreguntasLeccion extends DataRow {
  id: string;
  tutoriaId: string;
  leccionId: string;
  inscripcionId: string;
  alumnoId: number;
  titulo: string;
  contenido: string;
  estado: string;
  creadoEn: Date;
}

export interface RespuestasPregunta extends DataRow {
  id: string;
  preguntaId: string;
  autorId: number;
  contenido: string;
  ocultaEn: Date | null;
  creadoEn: Date;
}

export interface SesionesTutoria extends DataRow {
  id: string;
  tutoriaId: string;
  titulo: string;
  inicioEn: Date;
  finEn: Date;
  capacidad: number;
  estado: string;
  enlaceReunion: string | null;
  creadoEn: Date;
}

export interface ReservasSesion extends DataRow {
  sesionId: string;
  inscripcionId: string;
  tutoriaId: string;
  estado: string;
  creadoEn: Date;
}

export interface ResenasTutoria extends DataRow {
  inscripcionId: string;
  tutoriaId: string;
  puntuacion: number;
  comentario: string | null;
  estado: string;
  creadoEn: Date;
}

export interface CategoriasMarket extends DataRow {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export interface AnunciosMarket extends DataRow {
  id: string;
  vendedorId: number;
  categoriaId: number;
  titulo: string;
  descripcion: string;
  condicion: string;
  estado: string;
  tipoPrecio: string;
  precioBase: string | null;
  descuentoPorcentaje: string;
  moneda: string;
  ciudad: string | null;
  versionLock: number;
  publicadoEn: Date | null;
  vendidoEn: Date | null;
  eliminadoEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface ImagenesAnuncio extends DataRow {
  anuncioId: string;
  vendedorId: number;
  archivoId: string;
  orden: number;
}

export interface ActualizacionesAnuncio extends DataRow {
  id: string;
  anuncioId: string;
  vendedorId: number;
  contenido: string;
  ocultaEn: Date | null;
  creadoEn: Date;
}

export interface FavoritosAnuncio extends DataRow {
  usuarioId: number;
  anuncioId: string;
  creadoEn: Date;
}

export interface Conversaciones extends DataRow {
  id: string;
  tipo: string;
  anuncioId: string | null;
  tutoriaId: string | null;
  consultanteId: number;
  propietarioId: number;
  estado: string;
  ultimoMensajeEn: Date | null;
  creadoEn: Date;
}

export interface ParticipantesConversacion extends DataRow {
  conversacionId: string;
  usuarioId: number;
  archivadaEn: Date | null;
  silenciada: boolean;
  salioEn: Date | null;
  creadoEn: Date;
}

export interface Mensajes extends DataRow {
  id: string;
  conversacionId: string;
  autorId: number;
  clienteId: string;
  tipo: string;
  contenido: string | null;
  archivoId: string | null;
  eliminadoEn: Date | null;
  creadoEn: Date;
}

export interface LecturasConversacion extends DataRow {
  conversacionId: string;
  usuarioId: number;
  ultimoMensajeId: string;
  leidoEn: Date;
}

export interface BloqueosUsuario extends DataRow {
  bloqueadorId: number;
  bloqueadoId: number;
  creadoEn: Date;
}

export interface Denuncias extends DataRow {
  id: string;
  denuncianteId: number;
  anuncioId: string | null;
  tutoriaId: string | null;
  mensajeId: string | null;
  usuarioReportadoId: number | null;
  motivo: string;
  detalle: string | null;
  estado: string;
  asignadaA: number | null;
  creadoEn: Date;
}

export interface Notificaciones extends DataRow {
  id: string;
  usuarioId: number;
  tipo: string;
  titulo: string;
  datos: unknown;
  leidaEn: Date | null;
  creadoEn: Date;
}

export interface EventosAuditoria extends DataRow {
  id: string;
  actorId: number | null;
  accion: string;
  entidad: string;
  entidadId: string;
  resumen: unknown;
  correlacionId: string | null;
  creadoEn: Date;
}

export interface VariantesArchivo extends DataRow {
  id: string;
  archivoId: string;
  nombre: string;
  tipo: string;
  storageKey: string;
  mimeDetectado: string;
  tamanoBytes: string;
  anchoPx: number | null;
  altoPx: number | null;
  duracionSegundos: number | null;
  estado: string;
  creadoEn: Date;
}

export interface GaleriaTutoria extends DataRow {
  tutoriaId: string;
  tutorId: number;
  archivoId: string;
  tipo: string;
  orden: number;
}

export interface CorreosSalida extends DataRow {
  id: string;
  destinatario: string;
  asunto: string;
  cuerpoCifrado: unknown;
  intentos: number;
  siguienteIntentoEn: Date;
  enviadoEn: Date | null;
  creadoEn: Date;
}
export interface EntityMap {
  usuarios: Usuarios;
  roles: Roles;
  usuario_roles: UsuarioRoles;
  credenciales_usuario: CredencialesUsuario;
  sesiones_usuario: SesionesUsuario;
  tokens_cuenta: TokensCuenta;
  archivos: Archivos;
  perfiles_usuario: PerfilesUsuario;
  areas_tutoria: AreasTutoria;
  solicitudes_tutor: SolicitudesTutor;
  documentos_solicitud: DocumentosSolicitud;
  envios_solicitud: EnviosSolicitud;
  envio_documentos: EnvioDocumentos;
  revisiones_tutor: RevisionesTutor;
  habilitaciones_tutor: HabilitacionesTutor;
  tutorias: Tutorias;
  secciones_tutoria: SeccionesTutoria;
  lecciones_tutoria: LeccionesTutoria;
  recursos_leccion: RecursosLeccion;
  inscripciones_tutoria: InscripcionesTutoria;
  progreso_lecciones: ProgresoLecciones;
  seguimiento_alumnos: SeguimientoAlumnos;
  preguntas_leccion: PreguntasLeccion;
  respuestas_pregunta: RespuestasPregunta;
  sesiones_tutoria: SesionesTutoria;
  reservas_sesion: ReservasSesion;
  resenas_tutoria: ResenasTutoria;
  categorias_market: CategoriasMarket;
  anuncios_market: AnunciosMarket;
  imagenes_anuncio: ImagenesAnuncio;
  actualizaciones_anuncio: ActualizacionesAnuncio;
  favoritos_anuncio: FavoritosAnuncio;
  conversaciones: Conversaciones;
  participantes_conversacion: ParticipantesConversacion;
  mensajes: Mensajes;
  lecturas_conversacion: LecturasConversacion;
  bloqueos_usuario: BloqueosUsuario;
  denuncias: Denuncias;
  notificaciones: Notificaciones;
  eventos_auditoria: EventosAuditoria;
  variantes_archivo: VariantesArchivo;
  galeria_tutoria: GaleriaTutoria;
  correos_salida: CorreosSalida;
}
export type EntityName = keyof EntityMap;
export type PublicCourse = Pick<
  Tutorias,
  | 'id'
  | 'tutorId'
  | 'areaId'
  | 'titulo'
  | 'descripcion'
  | 'nivel'
  | 'modalidad'
  | 'precioBase'
  | 'descuentoPorcentaje'
  | 'moneda'
  | 'portadaArchivoId'
  | 'publicadaEn'
> &
  DataRow;
export type PublicListing = Pick<
  AnunciosMarket,
  | 'id'
  | 'vendedorId'
  | 'categoriaId'
  | 'titulo'
  | 'descripcion'
  | 'condicion'
  | 'estado'
  | 'tipoPrecio'
  | 'precioBase'
  | 'descuentoPorcentaje'
  | 'moneda'
  | 'ciudad'
  | 'publicadoEn'
  | 'vendidoEn'
> &
  DataRow;

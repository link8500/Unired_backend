// Archivo: src/core/dominio/comun/entidades.ts
// Define las estructuras de datos del negocio y el mapa entre entidades y registros de persistencia.

/** Modelos persistidos del negocio, sin decoradores ni dependencias de NestJS.
 * PostgreSQL conserva BIGINT/NUMERIC como cadenas para evitar pérdida de precisión.
 * JSON de entrada y proyecciones adicionales permanecen unknown hasta validarlos.
 */
export type RegistroEntidad = Record<string, unknown>;
export interface Usuarios extends RegistroEntidad {
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

export interface Roles extends RegistroEntidad {
  codigo: string;
  nombre: string;
}

export interface UsuarioRoles extends RegistroEntidad {
  usuarioId: number;
  rolCodigo: string;
  asignadoPor: number | null;
  creadoEn: Date;
}

export interface CredencialesUsuario extends RegistroEntidad {
  usuarioId: number;
  passwordHash: string;
  cambiadaEn: Date;
}

export interface SesionesUsuario extends RegistroEntidad {
  id: string;
  usuarioId: number;
  refreshTokenHash: Buffer;
  expiraEn: Date;
  revocadaEn: Date | null;
  creadoEn: Date;
}

export interface TokensCuenta extends RegistroEntidad {
  id: string;
  usuarioId: number;
  proposito: string;
  tokenHash: Buffer;
  expiraEn: Date;
  usadoEn: Date | null;
  creadoEn: Date;
}

export interface Archivos extends RegistroEntidad {
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

export interface PerfilesUsuario extends RegistroEntidad {
  usuarioId: number;
  presentacion: string | null;
  telefono: string | null;
  telefonoPublico: boolean;
  areaProfesional: string | null;
  ciudad: string | null;
  pais: string | null;
  departamento: string | null;
  universidad: string | null;
  sede: string | null;
  carrera: string | null;
  anioEstudio: number | null;
  trabaja: boolean | null;
  ocupacion: string | null;
  avatarArchivoId: string | null;
  bannerArchivoId: string | null;
  notificacionesActivas: boolean;
  actualizadoEn: Date;
}

export interface AreasTutoria extends RegistroEntidad {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  requisitosDocumentales: string[];
}

export interface SolicitudesTutor extends RegistroEntidad {
  formacionAcademica: string | null;
  experienciaDocente: string | null;
  especialidades: string[];
  id: string;
  tutorId: number;
  areaId: number;
  estado: string;
  asignadaA: number | null;
  versionLock: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface DocumentosSolicitud extends RegistroEntidad {
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

export interface EnviosSolicitud extends RegistroEntidad {
  id: string;
  solicitudId: string;
  numero: number;
  enviadoEn: Date;
}

export interface EnvioDocumentos extends RegistroEntidad {
  envioId: string;
  documentoId: string;
  solicitudId: string;
}

export interface RevisionesTutor extends RegistroEntidad {
  id: string;
  envioId: string;
  solicitudId: string;
  revisorId: number;
  decision: string;
  motivo: string;
  creadoEn: Date;
}

export interface HabilitacionesTutor extends RegistroEntidad {
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

export interface Tutorias extends RegistroEntidad {
  resumen: string | null;
  idioma: string;
  objetivos: string[];
  requisitos: string[];
  dirigidoA: string | null;
  duracionEstimadaMinutos: number | null;
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

export interface SeccionesTutoria extends RegistroEntidad {
  id: string;
  tutoriaId: string;
  titulo: string;
  orden: number;
  archivadaEn: Date | null;
}

export interface LeccionesTutoria extends RegistroEntidad {
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

export interface RecursosLeccion extends RegistroEntidad {
  id: string;
  leccionId: string;
  tutoriaId: string;
  tutorId: number;
  archivoId: string;
  titulo: string;
}

export interface InscripcionesTutoria extends RegistroEntidad {
  id: string;
  tutoriaId: string;
  alumnoId: number;
  estado: string;
  activadaEn: Date | null;
  completadaEn: Date | null;
  ultimoAccesoEn: Date | null;
  creadoEn: Date;
}

export interface ProgresoLecciones extends RegistroEntidad {
  inscripcionId: string;
  leccionId: string;
  tutoriaId: string;
  posicionSegundos: number;
  completadaEn: Date | null;
  actualizadoEn: Date;
}

export interface SeguimientoAlumnos extends RegistroEntidad {
  id: string;
  inscripcionId: string;
  tutoriaId: string;
  tutorId: number;
  visibilidad: string;
  comentario: string;
  creadoEn: Date;
}

export interface PreguntasLeccion extends RegistroEntidad {
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

export interface RespuestasPregunta extends RegistroEntidad {
  id: string;
  preguntaId: string;
  autorId: number;
  contenido: string;
  ocultaEn: Date | null;
  creadoEn: Date;
}

export interface SesionesTutoria extends RegistroEntidad {
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

export interface ReservasSesion extends RegistroEntidad {
  sesionId: string;
  inscripcionId: string;
  tutoriaId: string;
  estado: string;
  creadoEn: Date;
}

export interface ResenasTutoria extends RegistroEntidad {
  inscripcionId: string;
  tutoriaId: string;
  puntuacion: number;
  comentario: string | null;
  estado: string;
  creadoEn: Date;
}

export interface CategoriasMarket extends RegistroEntidad {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export interface AnunciosMarket extends RegistroEntidad {
  atributos: Record<string, string>;
  etiquetas: string[];
  disponibilidad: string;
  referenciaPrivada: string | null;
  marca: string | null;
  modelo: string | null;
  zonaEntrega: string | null;
  detalleEntrega: string | null;
  formasEntrega: string[];
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

export interface ImagenesAnuncio extends RegistroEntidad {
  anuncioId: string;
  vendedorId: number;
  archivoId: string;
  orden: number;
}

export interface ActualizacionesAnuncio extends RegistroEntidad {
  id: string;
  anuncioId: string;
  vendedorId: number;
  contenido: string;
  ocultaEn: Date | null;
  creadoEn: Date;
}

export interface FavoritosAnuncio extends RegistroEntidad {
  usuarioId: number;
  anuncioId: string;
  creadoEn: Date;
}

export interface Conversaciones extends RegistroEntidad {
  id: string;
  tipo: string;
  anuncioId: string | null;
  tutoriaId: string | null;
  solicitudApoyoId: string | null;
  consultanteId: number;
  propietarioId: number;
  estado: string;
  ultimoMensajeEn: Date | null;
  creadoEn: Date;
}

export interface ParticipantesConversacion extends RegistroEntidad {
  conversacionId: string;
  usuarioId: number;
  archivadaEn: Date | null;
  silenciada: boolean;
  salioEn: Date | null;
  creadoEn: Date;
}

export interface Mensajes extends RegistroEntidad {
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

export interface LecturasConversacion extends RegistroEntidad {
  conversacionId: string;
  usuarioId: number;
  ultimoMensajeId: string;
  leidoEn: Date;
}

export interface BloqueosUsuario extends RegistroEntidad {
  bloqueadorId: number;
  bloqueadoId: number;
  creadoEn: Date;
}

export interface Denuncias extends RegistroEntidad {
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

export interface Notificaciones extends RegistroEntidad {
  id: string;
  usuarioId: number;
  tipo: string;
  titulo: string;
  datos: unknown;
  leidaEn: Date | null;
  creadoEn: Date;
}

export interface EventosAuditoria extends RegistroEntidad {
  id: string;
  actorId: number | null;
  accion: string;
  entidad: string;
  entidadId: string;
  resumen: unknown;
  correlacionId: string | null;
  creadoEn: Date;
}

export interface VariantesArchivo extends RegistroEntidad {
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

export interface GaleriaTutoria extends RegistroEntidad {
  tutoriaId: string;
  tutorId: number;
  archivoId: string;
  tipo: string;
  orden: number;
}

export interface CorreosSalida extends RegistroEntidad {
  id: string;
  destinatario: string;
  asunto: string;
  cuerpoCifrado: unknown;
  intentos: number;
  siguienteIntentoEn: Date;
  enviadoEn: Date | null;
  creadoEn: Date;
}
export interface IdentidadesExternas extends RegistroEntidad {
  id: string;
  usuarioId: number;
  proveedor: string;
  sujetoProveedor: string;
  correoProveedor: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}
export interface FlujosAccesoSocial extends RegistroEntidad {
  id: string;
  proveedor: string;
  estadoHash: Buffer;
  retoCliente: string;
  nonce: string;
  origenFrontend: string;
  usuarioVinculacionId: number | null;
  sesionVinculacionId: string | null;
  sujetoProveedor: string | null;
  nombreProveedor: string | null;
  correoProveedor: string | null;
  correoVerificado: boolean;
  codigoHash: Buffer | null;
  callbackUsadoEn: Date | null;
  canjeadoEn: Date | null;
  intentosConfirmacion: number;
  expiraEn: Date;
  creadoEn: Date;
}
export interface MapaEntidades {
  identidades_externas: IdentidadesExternas;
  flujos_acceso_social: FlujosAccesoSocial;
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
export interface Empresa extends RegistroEntidad {
  id: string;
  propietarioId: number;
  nombre: string;
  razonSocial: string;
  ruc: string;
  emailComercial: string;
  telefono: string;
  sitioWeb: string | null;
  descripcion: string;
  ciudad: string;
  estado: string;
  motivoRevision: string | null;
}
export interface PlanEmpresa extends RegistroEntidad {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  precioMensual: string;
  maxCampanas: number;
  activo: boolean;
}
export interface SuscripcionEmpresa extends RegistroEntidad {
  id: string;
  empresaId: string;
  planId: string;
  pagoId: string;
  estado: string;
  iniciaEn: Date;
  venceEn: Date;
  canceladaEn: Date | null;
}
export interface CampanaPublicitaria extends RegistroEntidad {
  id: string;
  empresaId: string;
  suscripcionId: string;
  titulo: string;
  descripcion: string;
  bannerArchivoId: string;
  enlace: string;
  estado: string;
  iniciaEn: Date;
  terminaEn: Date;
}
export interface PagoDemo extends RegistroEntidad {
  id: string;
  usuarioId: number;
  clienteId: string;
  concepto: string;
  recursoId: string | null;
  importe: string;
  moneda: string;
  estado: string;
  creadoEn: Date;
}
export interface CarteraTutor extends RegistroEntidad {
  usuarioId: number;
  saldoDemo: string;
  actualizadoEn: Date;
}
export interface MovimientoCartera extends RegistroEntidad {
  id: string;
  usuarioId: number;
  pagoId: string | null;
  tipo: string;
  importe: string;
  descripcion: string;
  creadoEn: Date;
}
export interface DestacadoPublicacion extends RegistroEntidad {
  id: string;
  propietarioId: number;
  anuncioId: string | null;
  tutoriaId: string | null;
  pagoId: string;
  iniciaEn: Date;
  terminaEn: Date;
  estado: string;
}
export interface ConfiguracionComercial extends RegistroEntidad {
  id: string;
  comisionPorcentaje: string;
  precioDestacado: string;
  diasDestacado: number;
  precioMinutoOnline: string;
  precioMinutoPresencial: string;
  tutoriasGratuitas: boolean;
  actualizadoEn: Date;
}
export interface MapaEntidades {
  empresas: Empresa;
  planes_empresa: PlanEmpresa;
  suscripciones_empresa: SuscripcionEmpresa;
  campanas_publicitarias: CampanaPublicitaria;
  pagos_demo: PagoDemo;
  carteras_tutor: CarteraTutor;
  movimientos_cartera: MovimientoCartera;
  destacados_publicacion: DestacadoPublicacion;
  configuracion_comercial: ConfiguracionComercial;
  ofertas_market: OfertaMarket;
  solicitudes_apoyo: SolicitudApoyo;
  solicitudes_ignoradas: SolicitudIgnorada;
  resenas_interaccion: ResenaInteraccion;
  tarifas_tutoria: TarifaTutoria;
}
export interface OfertaMarket extends RegistroEntidad {
  id: string;
  anuncioId: string;
  compradorId: number;
  vendedorId: number;
  clienteId: string;
  tipo: string;
  importe: string;
  moneda: string;
  mensaje: string;
  estado: string;
  conversacionId: string | null;
  creadoEn: Date;
}
export interface SolicitudApoyo extends RegistroEntidad {
  id: string;
  alumnoId: number;
  tutorId: number | null;
  areaId: number;
  materia: string;
  tema: string;
  descripcion: string;
  universidad: string | null;
  carrera: string | null;
  anioEstudio: number | null;
  modalidad: string;
  duracionMinutos: number;
  precio: string;
  requierePagoDemo: boolean;
  comision: string;
  moneda: string;
  estado: string;
  cursoId: string | null;
  inscripcionOtorgadaId: string | null;
  conversacionId: string | null;
}
export interface SolicitudIgnorada extends RegistroEntidad {
  solicitudId: string;
  tutorId: number;
  creadoEn: Date;
}
export interface ResenaInteraccion extends RegistroEntidad {
  id: string;
  autorId: number;
  receptorId: number;
  ofertaId: string | null;
  solicitudId: string | null;
  inscripcionId: string | null;
  puntuacion: number;
  comentario: string;
  visible: boolean;
  creadoEn: Date;
}
export interface TarifaTutoria extends RegistroEntidad {
  areaId: number;
  precioMinutoOnline: string | null;
  precioMinutoPresencial: string | null;
  actualizadoEn: Date;
}
export type NombreEntidad = keyof MapaEntidades;
export type CursoPublico = Pick<
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
  RegistroEntidad;
export type AnuncioPublico = Pick<
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
  RegistroEntidad;

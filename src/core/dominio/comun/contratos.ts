// Archivo: src/core/dominio/comun/contratos.ts
// Define los puertos de base de datos, transacciones, contraseñas, tokens, correo y archivos binarios.

/** El núcleo conoce contratos, nunca adaptadores de almacenamiento ni decoradores. */
import {
  MapaEntidades,
  NombreEntidad,
  CursoPublico,
  AnuncioPublico,
} from './entidades';
export type Registro = Record<string, unknown>;
export interface Actor {
  id: number;
  roles: string[];
  estado: string;
  sessionId: string;
}
export interface Pagina<T = Registro> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export interface Paginacion {
  page: number;
  limit: number;
  q?: string;
}
export type ValorPrimitivo = string | number | boolean | Date | Buffer | null;
export type Condicion =
  | ValorPrimitivo
  | {
      op: 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'ne' | 'like';
      value: ValorPrimitivo | ValorPrimitivo[];
    };
export type Filtros = Record<string, Condicion>;
export interface OpcionesBusqueda {
  limit?: number;
  offset?: number;
  order?: Record<string, 'ASC' | 'DESC'>;
  lock?: boolean;
  fields?: string[];
}
export interface AlmacenDatos {
  find<K extends NombreEntidad>(
    entity: K,
    where?: Filtros | Filtros[],
    options?: OpcionesBusqueda,
  ): Promise<MapaEntidades[K][]>;
  one<K extends NombreEntidad>(
    entity: K,
    where: Filtros | Filtros[],
    options?: OpcionesBusqueda,
  ): Promise<MapaEntidades[K] | undefined>;
  count(entity: NombreEntidad, where?: Filtros | Filtros[]): Promise<number>;
  insert<K extends NombreEntidad>(
    entity: K,
    values: Registro,
  ): Promise<MapaEntidades[K]>;
  update<K extends NombreEntidad>(
    entity: K,
    where: Filtros,
    values: Registro,
  ): Promise<MapaEntidades[K][]>;
  remove(entity: NombreEntidad, where: Filtros): Promise<void>;
}
export interface Consultas {
  adminConversations(query: Paginacion & Registro): Promise<Pagina>;
  catalog(
    kind: 'courses' | 'listings',
    query: Paginacion & Registro,
  ): Promise<Pagina>;
  publicCourse(id: string): Promise<CursoPublico | undefined>;
  publicListing(id: string): Promise<AnuncioPublico | undefined>;
  conversations(userId: number, query: Paginacion & Registro): Promise<Pagina>;
  students(courseId: string, query: Paginacion & Registro): Promise<Pagina>;
  enrollments(
    userId: number,
    query: Paginacion,
    state?: string,
  ): Promise<Pagina>;
  courseDuration(id: string): Promise<number | null>;
  ownedCourses(userId: number, query: Paginacion): Promise<Pagina>;
  dashboard(): Promise<Registro>;
  analytics(days: number): Promise<Registro>;
  workspace(section: string, query: Paginacion & Registro): Promise<Pagina>;
  courseInspection(courseId: string): Promise<Registro>;
  adminUsers(query: Paginacion & Registro): Promise<Pagina>;
  adminUserSummary(userId: number): Promise<Registro>;
  adminPublications(
    kind: 'courses' | 'listings',
    query: Paginacion & Registro,
  ): Promise<Pagina>;
}
export interface Transaccion {
  store: AlmacenDatos;
  queries: Consultas;
}
export interface BaseDatos {
  read: Transaccion;
  transaction<T>(work: (tx: Transaccion) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}
export interface Contrasenas {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}
export interface Tokens {
  random(): string;
  digest(token: string): Buffer;
  uuid(): string;
  access(userId: number, sessionId: string): Promise<string>;
  verifyAccess(token: string): Promise<{ sub: number; sid: string }>;
  fileAccess(
    userId: number,
    sessionId: string,
    fileId: string,
  ): Promise<string>;
  verifyFileAccess(
    token: string,
  ): Promise<{ sub: number; sid: string; fileId: string }>;
}
export interface Correo {
  enqueue(
    store: AlmacenDatos,
    to: string,
    subject: string,
    text: string,
  ): Promise<void>;
}
export interface ArchivoGuardado {
  key: string;
  bytes: number;
  sha256: Buffer;
}
export interface AlmacenamientoBinario {
  readonly provider: 'local' | 's3';
  readonly bucket: string;
  put(
    path: string,
    folder: string,
    extension: string,
    maxBytes: number,
  ): Promise<ArchivoGuardado>;
  inspect(key: string): Promise<{
    mime: string;
    width?: number;
    height?: number;
    duration?: number;
  }>;
  scan(key: string): Promise<void>;
  probeVideo(key: string): Promise<{ duration: number }>;
  size(key: string): Promise<number>;
  read(
    key: string,
    range: { start: number; end: number },
  ): Promise<AsyncIterable<Uint8Array>>;
  release(key: string): Promise<void>;
  remove(key: string): Promise<void>;
  thumbnail(
    key: string,
    folder: string,
  ): Promise<ArchivoGuardado & { width: number; height: number }>;
  limited<T>(work: () => Promise<T>, key: string): Promise<T>;
}

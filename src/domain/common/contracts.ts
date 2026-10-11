/** El núcleo conoce contratos, nunca adaptadores de almacenamiento ni decoradores. */
import { EntityMap, EntityName, PublicCourse, PublicListing } from './models';
export type Row = Record<string, unknown>;
export interface Actor {
  id: number;
  roles: string[];
  estado: string;
  sessionId: string;
}
export interface Page<T = Row> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export interface Pagination {
  page: number;
  limit: number;
  q?: string;
}
export type Primitive = string | number | boolean | Date | Buffer | null;
export type Condition =
  | Primitive
  | {
      op: 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'ne' | 'like';
      value: Primitive | Primitive[];
    };
export type Where = Record<string, Condition>;
export interface FindOptions {
  limit?: number;
  offset?: number;
  order?: Record<string, 'ASC' | 'DESC'>;
  lock?: boolean;
  fields?: string[];
}
export interface Store {
  find<K extends EntityName>(
    entity: K,
    where?: Where | Where[],
    options?: FindOptions,
  ): Promise<EntityMap[K][]>;
  one<K extends EntityName>(
    entity: K,
    where: Where | Where[],
    options?: FindOptions,
  ): Promise<EntityMap[K] | undefined>;
  count(entity: EntityName, where?: Where | Where[]): Promise<number>;
  insert<K extends EntityName>(entity: K, values: Row): Promise<EntityMap[K]>;
  update<K extends EntityName>(
    entity: K,
    where: Where,
    values: Row,
  ): Promise<EntityMap[K][]>;
  remove(entity: EntityName, where: Where): Promise<void>;
}
export interface Queries {
  catalog(kind: 'courses' | 'listings', query: Pagination & Row): Promise<Page>;
  publicCourse(id: string): Promise<PublicCourse | undefined>;
  publicListing(id: string): Promise<PublicListing | undefined>;
  conversations(userId: number, query: Pagination): Promise<Page>;
  students(courseId: string, query: Pagination): Promise<Page>;
  dashboard(): Promise<Row>;
  analytics(days: number): Promise<Row>;
}
export interface Transaction {
  store: Store;
  queries: Queries;
}
export interface Database {
  read: Transaction;
  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}
export interface Passwords {
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
export interface Mail {
  enqueue(
    store: Store,
    to: string,
    subject: string,
    text: string,
  ): Promise<void>;
}
export interface StoredFile {
  key: string;
  bytes: number;
  sha256: Buffer;
}
export interface BinaryStorage {
  put(
    path: string,
    folder: string,
    extension: string,
    maxBytes: number,
  ): Promise<StoredFile>;
  inspect(key: string): Promise<{
    mime: string;
    width?: number;
    height?: number;
    duration?: number;
  }>;
  scan(key: string): Promise<void>;
  probeVideo(key: string): Promise<{ duration: number }>;
  absolute(key: string): string;
  remove(key: string): Promise<void>;
  thumbnail(
    key: string,
    folder: string,
  ): Promise<StoredFile & { width: number; height: number }>;
  limited<T>(work: () => Promise<T>, key: string): Promise<T>;
}

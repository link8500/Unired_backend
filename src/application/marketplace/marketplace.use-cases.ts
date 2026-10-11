import { Actor, Row } from '../../domain/common/contracts';
import { ensure, missing } from '../../domain/common/errors';
import * as v from '../../domain/common/validation';
import { price } from '../../domain/policies/prices';
import { BaseUseCases } from '../shared/base.use-cases';

/** Anuncios entre personas: el servidor obtiene al vendedor de la sesión. */
export class MarketplaceUseCases extends BaseUseCases {
  categories() {
    return this.db.read.store.find(
      'categorias_market',
      { activo: true },
      { order: { nombre: 'ASC' }, limit: 200 },
    );
  }
  catalog(query: Row) {
    return this.db.read.queries.catalog('listings', {
      ...v.pagination(query),
      ...(query.categoriaId === undefined
        ? {}
        : { categoriaId: v.userId(query.categoriaId) }),
      ...(query.vendedorId === undefined
        ? {}
        : { vendedorId: v.userId(query.vendedorId) }),
      ...(query.estado === undefined
        ? {}
        : {
            estado: v.choice(
              query.estado,
              ['publicado', 'reservado', 'vendido'],
              'estado',
            ),
          }),
      sort:
        query.sort === undefined
          ? 'recent'
          : v.choice(query.sort, ['recent', 'popular'], 'sort'),
    });
  }
  async details(resourceId: unknown): Promise<Row> {
    const listing = await this.db.read.queries.publicListing(v.id(resourceId));
    if (!listing) missing('Anuncio no disponible.');
    const [images, updates] = await Promise.all([
      this.db.read.store.find(
        'imagenes_anuncio',
        { anuncioId: listing.id },
        { order: { orden: 'ASC' }, limit: 20 },
      ),
      this.db.read.store.find(
        'actualizaciones_anuncio',
        { anuncioId: listing.id, ocultaEn: null },
        { order: { id: 'DESC' }, limit: 50 },
      ),
    ]);
    return { ...listing, imagenes: images, novedades: updates };
  }
  mine(actor: Actor, query: Row) {
    return this.page(
      this.db.read.store,
      'anuncios_market',
      { vendedorId: actor.id, eliminadoEn: null },
      v.pagination(query),
    );
  }
  async ownDetails(actor: Actor, resourceId: unknown): Promise<Row> {
    const listing = await this.owned(
      this.db.read.store,
      'anuncios_market',
      resourceId,
      actor,
      'vendedorId',
      false,
    );
    return {
      ...listing,
      imagenes: await this.db.read.store.find(
        'imagenes_anuncio',
        { anuncioId: listing.id },
        { order: { orden: 'ASC' }, limit: 20 },
      ),
      novedades: await this.db.read.store.find(
        'actualizaciones_anuncio',
        { anuncioId: listing.id },
        { order: { id: 'DESC' }, limit: 100 },
      ),
    };
  }
  async create(actor: Actor, input: unknown): Promise<Row> {
    const body = v.object(input, [
      'categoriaId',
      'titulo',
      'descripcion',
      'condicion',
      'tipoPrecio',
      'precioBase',
      'descuentoPorcentaje',
      'moneda',
      'ciudad',
    ]);
    const categoryId = v.userId(body.categoriaId);
    const data = {
      categoriaId: categoryId,
      vendedorId: actor.id,
      titulo: v.text(body.titulo, 'titulo', 220),
      descripcion: v.text(body.descripcion, 'descripcion', 20000),
      condicion: v.choice(
        body.condicion ?? 'usado',
        ['nuevo', 'como_nuevo', 'usado'],
        'condicion',
      ),
      ciudad:
        body.ciudad === undefined ? null : v.text(body.ciudad, 'ciudad', 120),
      ...price(body, true),
    };
    return this.db.transaction(async (tx) => {
      ensure(
        await tx.store.one('categorias_market', {
          id: categoryId,
          activo: true,
        }),
        'Categoría no disponible.',
      );
      const listing = await tx.store.insert('anuncios_market', data);
      await this.audit(tx, actor, 'anuncio.creado', 'anuncio', listing.id);
      return listing;
    });
  }
  async update(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, [
      'versionLock',
      'titulo',
      'descripcion',
      'condicion',
      'tipoPrecio',
      'precioBase',
      'descuentoPorcentaje',
      'moneda',
      'ciudad',
    ]);
    return this.db.transaction(async (tx) => {
      const listing = await this.owned(
        tx.store,
        'anuncios_market',
        resourceId,
        actor,
        'vendedorId',
      );
      ensure(
        !['bloqueado', 'archivado'].includes(listing.estado),
        'Este anuncio no admite cambios.',
        409,
      );
      ensure(
        listing.versionLock === v.integer(body.versionLock, 'versionLock', 1),
        'El anuncio cambió.',
        409,
      );
      const editable = { ...body };
      delete editable.versionLock;
      const fields = v.pickDefined(editable, {
        titulo: (x) => v.text(x, 'titulo', 220),
        descripcion: (x) => v.text(x, 'descripcion', 20000),
        condicion: (x) =>
          v.choice(x, ['nuevo', 'como_nuevo', 'usado'], 'condicion'),
        tipoPrecio: (x) =>
          v.choice(
            x,
            ['fijo', 'negociable', 'gratis', 'a_consultar'],
            'tipoPrecio',
          ),
        precioBase: (x) => (x === null ? null : v.money(x, 'precioBase')),
        descuentoPorcentaje: (x) => v.money(x, 'descuentoPorcentaje', 9000n),
        moneda: (x) => v.text(x, 'moneda', 3, 3),
        ciudad: (x) => (x === null ? null : v.text(x, 'ciudad', 120)),
      });
      const pricing = price({ ...listing, ...fields }, true);
      const [result] = await tx.store.update(
        'anuncios_market',
        { id: listing.id },
        { ...fields, ...pricing, versionLock: listing.versionLock + 1 },
      );
      await this.audit(tx, actor, 'anuncio.actualizado', 'anuncio', listing.id);
      return result;
    });
  }
  async addImage(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['archivoId', 'orden']);
    return this.db.transaction(async (tx) => {
      const listing = await this.owned(
        tx.store,
        'anuncios_market',
        resourceId,
        actor,
        'vendedorId',
      );
      ensure(
        !['bloqueado', 'archivado'].includes(listing.estado),
        'Este anuncio no admite cambios.',
        409,
      );
      ensure(
        (await tx.store.count('imagenes_anuncio', { anuncioId: listing.id })) <
          20,
        'Máximo 20 imágenes por anuncio.',
      );
      const file = await this.file(
        tx.store,
        body.archivoId,
        actor,
        'imagen_anuncio',
      );
      return tx.store.insert('imagenes_anuncio', {
        anuncioId: listing.id,
        vendedorId: actor.id,
        archivoId: file.id,
        orden: v.integer(body.orden, 'orden', 1, 20),
      });
    });
  }
  async removeImage(
    actor: Actor,
    resourceId: unknown,
    fileId: unknown,
  ): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const listing = await this.owned(
        tx.store,
        'anuncios_market',
        resourceId,
        actor,
        'vendedorId',
      );
      ensure(
        !['bloqueado', 'archivado'].includes(listing.estado),
        'Este anuncio no admite cambios.',
        409,
      );
      if (['publicado', 'reservado', 'vendido'].includes(listing.estado))
        ensure(
          (await tx.store.count('imagenes_anuncio', {
            anuncioId: listing.id,
          })) > 1,
          'El anuncio público debe conservar una imagen.',
          409,
        );
      await tx.store.remove('imagenes_anuncio', {
        anuncioId: listing.id,
        archivoId: v.id(fileId),
      });
      return { mensaje: 'Imagen desvinculada.' };
    });
  }
  async state(actor: Actor, resourceId: unknown, input: unknown): Promise<Row> {
    const body = v.object(input, ['estado', 'versionLock']);
    const state = v.choice(
      body.estado,
      ['publicado', 'reservado', 'vendido', 'archivado'],
      'estado',
    );
    const transitions: Record<string, string[]> = {
      borrador: ['publicado', 'archivado'],
      publicado: ['reservado', 'vendido', 'archivado'],
      reservado: ['publicado', 'vendido', 'archivado'],
      vendido: ['archivado'],
    };
    return this.db.transaction(async (tx) => {
      const listing = await this.owned(
        tx.store,
        'anuncios_market',
        resourceId,
        actor,
        'vendedorId',
      );
      ensure(
        listing.versionLock === v.integer(body.versionLock, 'versionLock', 1),
        'El anuncio cambió.',
        409,
      );
      ensure(
        transitions[listing.estado]?.includes(state),
        'Cambio de estado no permitido.',
        409,
      );
      if (state === 'publicado') {
        ensure(
          await tx.store.one('categorias_market', {
            id: listing.categoriaId,
            activo: true,
          }),
          'Categoría no disponible.',
        );
        const images = await tx.store.find(
          'imagenes_anuncio',
          { anuncioId: listing.id },
          { limit: 20 },
        );
        ensure(images.length, 'Adjunta al menos una imagen antes de publicar.');
        for (const image of images)
          await this.file(tx.store, image.archivoId, actor, 'imagen_anuncio');
      }
      const [result] = await tx.store.update(
        'anuncios_market',
        { id: listing.id },
        {
          estado: state,
          publicadoEn:
            state === 'publicado'
              ? (listing.publicadoEn ?? new Date())
              : listing.publicadoEn,
          vendidoEn: state === 'vendido' ? new Date() : listing.vendidoEn,
          versionLock: listing.versionLock + 1,
        },
      );
      await this.audit(tx, actor, 'anuncio.' + state, 'anuncio', listing.id);
      return result;
    });
  }
  async updatePost(
    actor: Actor,
    resourceId: unknown,
    input: unknown,
    updateId?: unknown,
  ): Promise<Row> {
    const body = v.object(input, ['contenido']);
    return this.db.transaction(async (tx) => {
      const listing = await this.owned(
        tx.store,
        'anuncios_market',
        resourceId,
        actor,
        'vendedorId',
      );
      ensure(
        !['bloqueado', 'archivado'].includes(listing.estado),
        'Este anuncio no admite novedades.',
        409,
      );
      const content = v.text(body.contenido, 'contenido', 10000);
      if (!updateId)
        return tx.store.insert('actualizaciones_anuncio', {
          anuncioId: listing.id,
          vendedorId: actor.id,
          contenido: content,
        });
      const post = await this.resource(
        tx.store,
        'actualizaciones_anuncio',
        updateId,
        true,
      );
      ensure(
        post.anuncioId === listing.id &&
          post.vendedorId === actor.id &&
          !post.ocultaEn,
        'Novedad no disponible.',
        403,
      );
      return (
        await tx.store.update(
          'actualizaciones_anuncio',
          { id: post.id },
          { contenido: content },
        )
      )[0];
    });
  }
  async removePost(
    actor: Actor,
    resourceId: unknown,
    updateId: unknown,
  ): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const listing = await this.owned(
        tx.store,
        'anuncios_market',
        resourceId,
        actor,
        'vendedorId',
      );
      const post = await this.resource(
        tx.store,
        'actualizaciones_anuncio',
        updateId,
        true,
      );
      ensure(
        post.anuncioId === listing.id && post.vendedorId === actor.id,
        'Novedad de otro anuncio.',
        403,
      );
      await tx.store.update(
        'actualizaciones_anuncio',
        { id: post.id },
        { ocultaEn: new Date() },
      );
      return { mensaje: 'Novedad ocultada.' };
    });
  }
  favorites(actor: Actor, query: Row) {
    return this.db.read.queries.catalog('listings', {
      ...v.pagination(query),
      favoritesOf: actor.id,
    });
  }
  async favorite(
    actor: Actor,
    resourceId: unknown,
    add: boolean,
  ): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const listing = await this.resource(
        tx.store,
        'anuncios_market',
        resourceId,
        true,
      );
      ensure(
        await tx.queries.publicListing(listing.id),
        'Anuncio no disponible.',
        404,
      );
      const key = { usuarioId: actor.id, anuncioId: listing.id };
      if (add) {
        if (!(await tx.store.one('favoritos_anuncio', key)))
          await tx.store.insert('favoritos_anuncio', key);
      } else await tx.store.remove('favoritos_anuncio', key);
      return { favorito: add };
    });
  }
}

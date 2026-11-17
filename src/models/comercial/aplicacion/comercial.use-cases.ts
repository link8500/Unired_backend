// Archivo: src/models/comercial/aplicacion/comercial.use-cases.ts
// Afiliación empresarial, publicidad, planes y operaciones explícitamente simuladas.
import {
  Actor,
  BaseDatos,
  Registro,
  Transaccion,
} from '../../../core/dominio/comun/contratos';
import { Empresa } from '../../../core/dominio/comun/entidades';
import { ensure } from '../../../core/dominio/comun/errores';
import * as v from '../../../core/dominio/comun/validaciones';
import { role, validGrant } from '../../../core/dominio/politicas/acceso';
import {
  centavos,
  importe,
} from '../../../core/dominio/politicas/importes-comerciales';
import { CasosUsoBase } from '../../../core/aplicacion/casos-uso-base';
import { cotizarMinutos } from '../../../core/aplicacion/cotizacion-tutoria';

export class ComercialUseCases extends CasosUsoBase {
  constructor(db: BaseDatos) {
    super(db);
  }
  async config() {
    const value = await this.db.read.store.one('configuracion_comercial', {
      id: '1',
    });
    ensure(value, 'Configuración comercial no disponible.', 503);
    return { ...value, simulado: true, moneda: 'NIO' };
  }
  async updateConfig(actor: Actor, input: unknown) {
    role(actor, 'administrador');
    const body = v.object(input, [
      'comisionPorcentaje',
      'precioDestacado',
      'diasDestacado',
      'precioMinutoOnline',
      'precioMinutoPresencial',
    ]);
    const fields = v.pickDefined(body, {
      comisionPorcentaje: (x) => v.money(x, 'comisionPorcentaje', 10000n),
      precioDestacado: (x) => v.money(x, 'precioDestacado', 10000000n),
      diasDestacado: (x) => v.integer(x, 'diasDestacado', 1, 365),
      precioMinutoOnline: (x) => v.money(x, 'precioMinutoOnline', 1000000n),
      precioMinutoPresencial: (x) =>
        v.money(x, 'precioMinutoPresencial', 1000000n),
    });
    return this.db.transaction(async (tx) => {
      const [result] = await tx.store.update(
        'configuracion_comercial',
        { id: '1' },
        { ...fields, actualizadoEn: new Date() },
      );
      await this.audit(
        tx,
        actor,
        'comercial.configurada',
        'configuracion_comercial',
        '1',
        fields,
      );
      return { ...result, simulado: true };
    });
  }
  plans() {
    return this.db.read.store.find(
      'planes_empresa',
      { activo: true },
      { order: { id: 'ASC' }, limit: 50 },
    );
  }
  companies(actor: Actor, query: Registro, admin = false) {
    if (admin) role(actor, 'administrador');
    return this.page(
      this.db.read.store,
      'empresas',
      admin ? {} : { propietarioId: actor.id },
      v.pagination(query),
    );
  }
  async requestCompany(actor: Actor, input: unknown) {
    const body = v.object(input, [
      'nombre',
      'razonSocial',
      'ruc',
      'emailComercial',
      'telefono',
      'sitioWeb',
      'descripcion',
      'ciudad',
    ]);
    const phone = v.text(body.telefono, 'telefono', 30, 7);
    ensure(
      /^[+\d\s().-]+$/.test(phone) &&
        /^\d{7,15}$/.test(phone.replace(/\D/g, '')),
      'Teléfono comercial inválido.',
    );
    const site = body.sitioWeb ? this.publicUrl(body.sitioWeb) : null;
    const data = {
      propietarioId: actor.id,
      nombre: v.text(body.nombre, 'nombre', 180, 2),
      razonSocial: v.text(body.razonSocial, 'razonSocial', 200, 2),
      ruc: v.text(body.ruc, 'ruc', 40, 3),
      emailComercial: v.email(body.emailComercial),
      telefono: phone,
      sitioWeb: site,
      descripcion: v.text(body.descripcion, 'descripcion', 5000, 10),
      ciudad: v.text(body.ciudad, 'ciudad', 120, 2),
    };
    return this.db.transaction(async (tx) => {
      await tx.store.one('usuarios', { id: actor.id }, { lock: true });
      ensure(
        (await tx.store.count('empresas', { propietarioId: actor.id })) < 10,
        'Has alcanzado el límite de solicitudes empresariales.',
        409,
      );
      const company = await tx.store.insert('empresas', data);
      await this.audit(tx, actor, 'empresa.solicitada', 'empresa', company.id);
      return company;
    });
  }
  async reviewCompany(actor: Actor, id: unknown, input: unknown) {
    role(actor, 'administrador');
    const body = v.object(input, ['estado', 'motivo']);
    const state = v.choice(
      body.estado,
      ['aprobada', 'rechazada', 'suspendida'],
      'estado',
    );
    const reason = v.text(body.motivo, 'motivo', 2000, 5);
    return this.db.transaction(async (tx) => {
      const company = await this.resource(tx.store, 'empresas', id, true);
      const [result] = await tx.store.update(
        'empresas',
        { id: company.id },
        {
          estado: state,
          motivoRevision: reason,
          revisadaPor: actor.id,
          revisadaEn: new Date(),
        },
      );
      if (state !== 'aprobada')
        await tx.store.update(
          'campanas_publicitarias',
          { empresaId: company.id, estado: 'activa' },
          { estado: 'pausada' },
        );
      await this.notify(
        tx,
        company.propietarioId,
        'empresa',
        'Tu solicitud empresarial fue revisada',
        { empresaId: company.id, estado: state, motivo: reason },
      );
      await this.audit(tx, actor, 'empresa.' + state, 'empresa', company.id, {
        motivo: reason,
      });
      return result;
    });
  }
  private company(
    tx: Transaccion,
    actor: Actor,
    id: unknown,
  ): Promise<Empresa> {
    return this.owned(tx.store, 'empresas', id, actor, 'propietarioId');
  }
  async companyDetails(actor: Actor, id: unknown) {
    const company = await this.company(this.db.read, actor, id);
    return {
      ...company,
      suscripciones: await this.db.read.store.find(
        'suscripciones_empresa',
        { empresaId: company.id },
        { order: { id: 'DESC' }, limit: 30 },
      ),
      campanas: await this.db.read.store.find(
        'campanas_publicitarias',
        { empresaId: company.id },
        { order: { id: 'DESC' }, limit: 100 },
      ),
    };
  }
  private publicUrl(value: unknown): string {
    const text = v.text(value, 'enlace', 500);
    try {
      const url = new URL(text);
      ensure(
        url.protocol === 'https:' && !url.username && !url.password,
        'Usa un enlace HTTPS público sin credenciales.',
      );
      return url.href;
    } catch {
      ensure(false, 'Escribe un enlace HTTPS completo.');
    }
  }
  async saveCampaign(
    actor: Actor,
    companyId: unknown,
    input: unknown,
    campaignId?: unknown,
  ) {
    const body = v.object(input, [
      'titulo',
      'descripcion',
      'bannerArchivoId',
      'enlace',
      'iniciaEn',
      'terminaEn',
      'estado',
    ]);
    const state = v.choice(
      body.estado,
      ['borrador', 'activa', 'pausada', 'finalizada'],
      'estado',
    );
    const start = v.date(body.iniciaEn, 'iniciaEn'),
      end = v.date(body.terminaEn, 'terminaEn');
    ensure(
      end > start && end > new Date(),
      'La fecha final debe ser posterior al inicio y al momento actual.',
    );
    return this.db.transaction(async (tx) => {
      const company = await this.company(tx, actor, companyId);
      ensure(
        company.estado === 'aprobada',
        'La empresa debe estar aprobada para gestionar campañas.',
        403,
      );
      const subscription = await tx.store.one(
        'suscripciones_empresa',
        {
          empresaId: company.id,
          estado: 'activa',
          venceEn: { op: 'gt', value: new Date() },
        },
        { lock: true },
      );
      ensure(
        subscription,
        'Activa un plan de demostración antes de crear campañas.',
        409,
      );
      const plan = await this.resource(
        tx.store,
        'planes_empresa',
        subscription.planId,
      );
      ensure(
        end <= new Date(subscription.venceEn),
        'La campaña debe terminar dentro de la vigencia del plan.',
      );
      const banner = await this.file(
        tx.store,
        body.bannerArchivoId,
        actor,
        'imagen_anuncio',
      );
      const data = {
        empresaId: company.id,
        suscripcionId: subscription.id,
        titulo: v.text(body.titulo, 'titulo', 180, 3),
        descripcion: v.text(body.descripcion, 'descripcion', 2000, 10),
        bannerArchivoId: banner.id,
        enlace: this.publicUrl(body.enlace),
        estado: state,
        iniciaEn: start,
        terminaEn: end,
      };
      if (campaignId !== undefined) {
        const campaign = await this.resource(
          tx.store,
          'campanas_publicitarias',
          campaignId,
          true,
        );
        ensure(
          campaign.empresaId === company.id && campaign.estado !== 'bloqueada',
          'Campaña no editable.',
          403,
        );
        if (state === 'activa' && campaign.estado !== 'activa')
          ensure(
            (await tx.store.count('campanas_publicitarias', {
              empresaId: company.id,
              estado: 'activa',
              terminaEn: { op: 'gt', value: new Date() },
            })) < plan.maxCampanas,
            'El plan alcanzó su límite de campañas activas.',
            409,
          );
        const [result] = await tx.store.update(
          'campanas_publicitarias',
          { id: campaign.id },
          data,
        );
        await this.audit(tx, actor, 'campana.editada', 'campana', campaign.id);
        return result;
      }
      ensure(
        (await tx.store.count('campanas_publicitarias', {
          empresaId: company.id,
          estado: { op: 'in', value: ['borrador', 'activa', 'pausada'] },
          terminaEn: { op: 'gt', value: new Date() },
        })) < plan.maxCampanas,
        'El plan alcanzó su límite de campañas. Finaliza una campaña o cambia de plan.',
        409,
      );
      const result = await tx.store.insert('campanas_publicitarias', data);
      await this.audit(tx, actor, 'campana.creada', 'campana', result.id);
      return result;
    });
  }
  async cancelSubscription(actor: Actor, companyId: unknown) {
    return this.db.transaction(async (tx) => {
      const company = await this.company(tx, actor, companyId);
      await tx.store.update(
        'suscripciones_empresa',
        { empresaId: company.id, estado: 'activa' },
        { estado: 'cancelada', canceladaEn: new Date() },
      );
      await tx.store.update(
        'campanas_publicitarias',
        { empresaId: company.id, estado: 'activa' },
        { estado: 'pausada' },
      );
      await this.audit(
        tx,
        actor,
        'suscripcion.cancelada',
        'empresa',
        company.id,
      );
      return {
        mensaje: 'Plan cancelado. No habrá renovaciones ni cargos reales.',
        simulado: true,
      };
    });
  }
  adminCampaigns(actor: Actor, query: Registro) {
    role(actor, 'administrador');
    return this.page(
      this.db.read.store,
      'campanas_publicitarias',
      {},
      v.pagination(query),
    );
  }
  async moderateCampaign(actor: Actor, id: unknown, input: unknown) {
    role(actor, 'administrador');
    const body = v.object(input, ['motivo']);
    return this.db.transaction(async (tx) => {
      const campaign = await this.resource(
        tx.store,
        'campanas_publicitarias',
        id,
        true,
      );
      const [result] = await tx.store.update(
        'campanas_publicitarias',
        { id: campaign.id },
        {
          estado: 'bloqueada',
          motivoModeracion: v.text(body.motivo, 'motivo', 2000, 5),
        },
      );
      await this.audit(tx, actor, 'campana.bloqueada', 'campana', campaign.id, {
        motivo: body.motivo,
      });
      return result;
    });
  }
  publicCampaigns(query: Registro) {
    return this.db.read.queries.campaigns(v.pagination(query));
  }
  async highlights() {
    const rows = await this.db.read.store.find(
      'destacados_publicacion',
      { estado: 'activo', terminaEn: { op: 'gt', value: new Date() } },
      { order: { id: 'DESC' }, limit: 30 },
    );
    const items: Registro[] = [];
    const included = new Set<string>();
    for (const row of rows) {
      const course = !!row.tutoriaId;
      const key =
        (course ? 'curso:' : 'anuncio:') +
        String(row.tutoriaId ?? row.anuncioId);
      if (included.has(key)) continue;
      const item = course
        ? await this.db.read.queries.publicCourse(row.tutoriaId!)
        : await this.db.read.queries.publicListing(row.anuncioId!);
      if (item) {
        items.push({ tipo: course ? 'curso' : 'anuncio', ...item });
        included.add(key);
      }
    }
    return { items, total: items.length, page: 1, limit: 30 };
  }
  async wallet(actor: Actor) {
    const wallet = await this.db.read.store.one('carteras_tutor', {
      usuarioId: actor.id,
    });
    const movements = await this.db.read.store.find(
      'movimientos_cartera',
      { usuarioId: actor.id },
      { order: { id: 'DESC' }, limit: 50 },
    );
    return {
      saldoDemo: wallet?.saldoDemo ?? '0.00',
      moneda: 'NIO',
      simulado: true,
      movimientos: movements,
    };
  }
  payments(actor: Actor, query: Registro) {
    return this.page(
      this.db.read.store,
      'pagos_demo',
      { usuarioId: actor.id },
      v.pagination(query),
    );
  }
  async quote(input: unknown) {
    const body = v.object(input, ['areaId', 'modalidad', 'duracionMinutos']);
    const area = await this.resource(
      this.db.read.store,
      'areas_tutoria',
      body.areaId,
    );
    ensure(area.activo, 'Área no disponible.');
    const modality = v.choice(
      body.modalidad,
      ['online', 'presencial'],
      'modalidad',
    );
    const minutes = v.integer(body.duracionMinutos, 'duracionMinutos', 15, 480);
    return cotizarMinutos(this.db.read, area.id, modality, minutes);
  }
  /** Nunca recibe tarjeta, fecha, CVV ni marca bancaria. Solo la intención de demo. */
  rates() {
    return this.db.read.queries.pricingAreas();
  }
  async saveRate(actor: Actor, areaId: unknown, input: unknown) {
    role(actor, 'administrador');
    const body = v.object(input, [
      'precioMinutoOnline',
      'precioMinutoPresencial',
    ]);
    const fields = v.pickDefined(body, {
      precioMinutoOnline: (x) =>
        x === null ? null : v.money(x, 'precioMinutoOnline', 1000000n),
      precioMinutoPresencial: (x) =>
        x === null ? null : v.money(x, 'precioMinutoPresencial', 1000000n),
    });
    return this.db.transaction(async (tx) => {
      const area = await this.resource(tx.store, 'areas_tutoria', areaId, true);
      const current = await tx.store.one('tarifas_tutoria', {
        areaId: area.id,
      });
      const result = current
        ? (
            await tx.store.update(
              'tarifas_tutoria',
              { areaId: area.id },
              { ...fields, actualizadoEn: new Date() },
            )
          )[0]
        : await tx.store.insert('tarifas_tutoria', {
            areaId: area.id,
            ...fields,
          });
      await this.audit(
        tx,
        actor,
        'tarifa.actualizada',
        'area_tutoria',
        area.id,
        fields,
      );
      return result;
    });
  }
  /** La autorización bancaria no forma parte de esta demostración. */
  async payDemo(actor: Actor, input: unknown) {
    const body = v.object(input, [
      'clienteId',
      'concepto',
      'recursoId',
      'planId',
      'importe',
    ]);
    const nonce = v.uuid(body.clienteId);
    const concept = v.choice(
      body.concepto,
      [
        'suscripcion_empresa',
        'recarga_tutor',
        'destacar_anuncio',
        'destacar_curso',
      ],
      'concepto',
    );
    return this.db.transaction(async (tx) => {
      await tx.store.one('usuarios', { id: actor.id }, { lock: true });
      const existing = await tx.store.one('pagos_demo', {
        usuarioId: actor.id,
        clienteId: nonce,
      });
      if (existing) {
        ensure(
          existing.concepto === concept &&
            String(existing.recursoId ?? '') === String(body.recursoId ?? ''),
          'La operación ya se usó para otra compra.',
          409,
        );
        if (concept === 'recarga_tutor')
          ensure(
            existing.importe === v.money(body.importe, 'importe'),
            'El importe ya fue confirmado con otro valor.',
            409,
          );
        if (concept === 'suscripcion_empresa')
          ensure(
            (
              await tx.store.one('suscripciones_empresa', {
                pagoId: existing.id,
              })
            )?.planId === v.id(body.planId),
            'El plan no coincide con la compra original.',
            409,
          );
        return {
          pago: existing,
          mensaje: 'Compra simulada realizada. No se efectuó ningún cobro.',
          simulado: true,
        };
      }
      const config = await this.resource(
        tx.store,
        'configuracion_comercial',
        '1',
      );
      let amount = config.precioDestacado;
      const resourceId =
        concept === 'recarga_tutor' ? null : v.id(body.recursoId);
      let company: Empresa | undefined;
      let planId: string | undefined;
      if (concept === 'suscripcion_empresa') {
        company = await this.company(tx, actor, resourceId);
        ensure(
          company.estado === 'aprobada',
          'La empresa aún no está aprobada.',
          403,
        );
        const plan = await this.resource(
          tx.store,
          'planes_empresa',
          body.planId,
        );
        ensure(plan.activo, 'Plan no disponible.', 409);
        planId = plan.id;
        amount = plan.precioMensual;
        const active = await tx.store.one(
          'suscripciones_empresa',
          { empresaId: company.id, estado: 'activa' },
          { lock: true },
        );
        ensure(
          !active || new Date(active.venceEn) <= new Date(),
          'La empresa ya tiene un plan activo. Cancélalo antes de cambiarlo.',
          409,
        );
        if (active)
          await tx.store.update(
            'suscripciones_empresa',
            { id: active.id },
            { estado: 'cancelada', canceladaEn: new Date() },
          );
      } else if (concept === 'recarga_tutor') {
        const grants = await tx.store.find(
          'habilitaciones_tutor',
          { tutorId: actor.id, estado: 'vigente' },
          { limit: 100 },
        );
        ensure(
          grants.some((g) => validGrant(g, actor.id, g.areaId)),
          'La cartera está disponible para tutores acreditados.',
          403,
        );
        amount = v.money(body.importe, 'importe', 100000000n);
      } else {
        const course = concept === 'destacar_curso';
        const item = course
          ? await tx.queries.publicCourse(resourceId!)
          : await tx.queries.publicListing(resourceId!);
        ensure(
          item && Number(item[course ? 'tutorId' : 'vendedorId']) === actor.id,
          'Solo puedes destacar tus publicaciones visibles.',
          403,
        );
      }
      ensure(centavos(amount) > 0n, 'El importe debe ser mayor a cero.');
      if (body.importe !== undefined)
        ensure(
          v.money(body.importe, 'importe') === amount,
          'El precio cambió. Actualiza el resumen antes de confirmar.',
          409,
        );
      const payment = await tx.store.insert('pagos_demo', {
        usuarioId: actor.id,
        clienteId: nonce,
        concepto: concept,
        recursoId: resourceId,
        importe: amount,
      });
      if (company && planId)
        await tx.store.insert('suscripciones_empresa', {
          empresaId: company.id,
          planId,
          pagoId: payment.id,
          venceEn: new Date(Date.now() + 30 * 86400000),
        });
      else if (concept === 'recarga_tutor') {
        let wallet = await tx.store.one(
          'carteras_tutor',
          { usuarioId: actor.id },
          { lock: true },
        );
        if (!wallet)
          wallet = await tx.store.insert('carteras_tutor', {
            usuarioId: actor.id,
          });
        await tx.store.update(
          'carteras_tutor',
          { usuarioId: actor.id },
          {
            saldoDemo: importe(centavos(wallet.saldoDemo) + centavos(amount)),
            actualizadoEn: new Date(),
          },
        );
        await tx.store.insert('movimientos_cartera', {
          usuarioId: actor.id,
          pagoId: payment.id,
          tipo: 'recarga_demo',
          importe: amount,
          descripcion: 'Recarga simulada · sin dinero real',
        });
      } else if (concept !== 'suscripcion_empresa') {
        await tx.store.insert('destacados_publicacion', {
          propietarioId: actor.id,
          ...(concept === 'destacar_curso'
            ? { tutoriaId: resourceId }
            : { anuncioId: resourceId }),
          pagoId: payment.id,
          terminaEn: new Date(Date.now() + config.diasDestacado * 86400000),
        });
      }
      await this.audit(tx, actor, 'pago.simulado', 'pago_demo', payment.id, {
        concepto: concept,
        importe: amount,
      });
      return {
        pago: payment,
        mensaje: 'Compra simulada realizada. No se efectuó ningún cobro.',
        simulado: true,
      };
    });
  }
}

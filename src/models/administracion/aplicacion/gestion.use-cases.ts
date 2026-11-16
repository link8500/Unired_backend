// Archivo: src/models/administracion/aplicacion/gestion.use-cases.ts
// Consulta y administra las colecciones de los submódulos administrativos a través de sus definiciones de gestión.

import {
  Actor,
  Registro,
  Filtros,
} from '../../../core/dominio/comun/contratos';
import { missing } from '../../../core/dominio/comun/errores';
import * as v from '../../../core/dominio/comun/validaciones';
import { role } from '../../../core/dominio/politicas/acceso';
import { CasosUsoBase } from '../../../core/aplicacion/casos-uso-base';

const states: Record<string, readonly string[]> = {
  applications: [
    'borrador',
    'enviada',
    'en_revision',
    'correcciones',
    'aprobada',
    'rechazada',
    'retirada',
  ],
  tutors: ['vigente', 'suspendida', 'revocada', 'vencida', 'por_vencer'],
  sessions: ['programada', 'cancelada', 'finalizada'],
  reviews: ['visible', 'oculta'],
  'market-updates': ['visible', 'oculta'],
  participation: [],
};
export class GestionUseCases extends CasosUsoBase {
  list(actor: Actor, section: unknown, query: Registro) {
    const name = v.choice(section, Object.keys(states), 'vista');
    role(
      actor,
      ...(['applications', 'tutors'].includes(name)
        ? ['revisor_tutores', 'administrador']
        : ['moderador', 'administrador']),
    );
    return this.db.read.queries.workspace(name, {
      ...v.pagination(query),
      ...(query.estado === undefined
        ? {}
        : { estado: v.choice(query.estado, states[name], 'estado') }),
    });
  }
  async course(actor: Actor, resourceId: unknown) {
    role(actor, 'moderador', 'administrador');
    const result = await this.db.read.queries.courseInspection(
      v.id(resourceId),
    );
    if (!result.id) missing();
    return result;
  }
  async visibility(
    actor: Actor,
    kind: 'review' | 'update',
    resourceId: unknown,
    input: unknown,
  ) {
    role(actor, 'moderador', 'administrador');
    const body = v.object(input, ['estado', 'motivo']);
    const state = v.choice(body.estado, ['visible', 'oculta'], 'estado');
    const reason = v.text(body.motivo, 'motivo', 2000, 5);
    const id = v.id(resourceId);
    return this.db.transaction(async (tx) => {
      const table =
        kind === 'review' ? 'resenas_tutoria' : 'actualizaciones_anuncio';
      const where: Filtros = kind === 'review' ? { inscripcionId: id } : { id };
      const current = await tx.store.one(table, where, { lock: true });
      if (!current) missing();
      const [result] = await tx.store.update(
        table,
        where,
        kind === 'review'
          ? { estado: state }
          : { ocultaEn: state === 'oculta' ? new Date() : null },
      );
      await this.audit(tx, actor, `${kind}.${state}`, table, id, {
        motivo: reason,
      });
      return result;
    });
  }
}

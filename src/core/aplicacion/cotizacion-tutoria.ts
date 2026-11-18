// Archivo: src/core/aplicacion/cotizacion-tutoria.ts
// Una misma regla de precio para cursos y acompañamiento, con centavos enteros.
import { Transaccion } from '../dominio/comun/contratos';
import { ensure } from '../dominio/comun/errores';
import {
  centavos,
  importe,
  comision,
} from '../dominio/politicas/importes-comerciales';

export async function cotizarMinutos(
  tx: Transaccion,
  areaId: number,
  modalidad: 'online' | 'presencial',
  minutos: number,
  { gratuita = false } = {},
) {
  ensure(
    Number.isSafeInteger(minutos) && minutos >= 0 && minutos <= 1000000,
    'Duración no válida.',
  );
  const config = await tx.store.one('configuracion_comercial', { id: 1 });
  ensure(config, 'Las tarifas todavía no están configuradas.', 503);
  const tarifa = gratuita
    ? null
    : await tx.store.one('tarifas_tutoria', { areaId });
  const porMinuto = gratuita
    ? '0.00'
    : modalidad === 'online'
      ? (tarifa?.precioMinutoOnline ?? config.precioMinutoOnline)
      : (tarifa?.precioMinutoPresencial ?? config.precioMinutoPresencial);
  const totalCentavos = centavos(porMinuto) * BigInt(minutos);
  ensure(
    totalCentavos <= 999999999999n,
    'La duración y la tarifa producen un importe demasiado alto.',
  );
  const total = importe(totalCentavos);
  return {
    areaId,
    modalidad,
    duracionMinutos: minutos,
    precioMinuto: porMinuto,
    total,
    comision: comision(total, config.comisionPorcentaje),
    moneda: 'NIO',
    simulado: true,
  };
}

export async function cotizarCurso(
  tx: Transaccion,
  curso: { id: string; areaId: number; gratuita?: boolean },
) {
  // El navegador no puede imponer la duración: procede del material publicado
  // y de las sesiones programadas en la base de datos.
  const minutos = (await tx.queries.courseDuration(curso.id, true)) ?? 0;
  return {
    ...(await cotizarMinutos(tx, curso.areaId, 'online', minutos, {
      gratuita: curso.gratuita,
    })),
    pendienteContenido: minutos === 0,
  };
}

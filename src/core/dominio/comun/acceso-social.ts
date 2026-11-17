// Contratos del acceso externo: el núcleo no conoce Google, HTTP ni sus SDK.
export const proveedoresSociales = ['google', 'facebook'] as const;
export type ProveedorSocial = (typeof proveedoresSociales)[number];
export interface IdentidadSocial {
  proveedor: ProveedorSocial;
  sujeto: string;
  nombre: string;
  email: string | null;
  emailVerificado: boolean;
}
export interface ContextoSocial {
  estado: string;
  nonce: string;
  callback: string;
}
export interface ProveedoresAccesoSocial {
  habilitados(): Record<ProveedorSocial, boolean>;
  autorizacion(proveedor: ProveedorSocial, contexto: ContextoSocial): string;
  verificar(
    proveedor: ProveedorSocial,
    codigo: string,
    contexto: ContextoSocial,
  ): Promise<IdentidadSocial>;
}
export interface ConfiguracionAccesoSocial {
  apiPublica: string;
  origenesPermitidos: string[];
  desarrollo: boolean;
}

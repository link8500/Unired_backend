/** Etiqueta orientativa. El agente no acredita identidad ni se usa para autorizar. */
export function describirDispositivo(
  agente: string | undefined,
): string | null {
  const ua = agente?.slice(0, 512);
  if (!ua) return null;
  const dispositivo =
    /iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile\//i.test(ua))
      ? 'iPad'
      : /iPhone|iPod/i.test(ua)
        ? 'iPhone'
        : /Android/i.test(ua)
          ? /Mobile/i.test(ua)
            ? 'Android'
            : 'tablet Android'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /CrOS/i.test(ua)
              ? 'ChromeOS'
              : /Macintosh|Mac OS/i.test(ua)
                ? 'macOS'
                : /Linux/i.test(ua)
                  ? 'Linux'
                  : null;
  const navegador = /Edg(?:e|A|iOS)?\//i.test(ua)
    ? 'Edge'
    : /OPR\/|OPiOS\//i.test(ua)
      ? 'Opera'
      : /SamsungBrowser\//i.test(ua)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//i.test(ua)
          ? 'Firefox'
          : /Chrome\/|Chromium\/|CriOS\//i.test(ua)
            ? 'Chrome'
            : /Safari\//i.test(ua)
              ? 'Safari'
              : null;
  return navegador && dispositivo
    ? `${navegador} en ${dispositivo}`
    : (dispositivo ?? navegador);
}

/**
 * Vibration API — Patrones diferenciados para alertas de emergencia.
 * 
 * Patrones (milisegundos: [vibrar, pausa, vibrar, ...]):
 * - EVACUACION: 2 pulsos cortos rápidos (urgencia alta)
 * - REPLICA:    3 pulsos largos (peligro inminente)
 * - INFO:       1 pulso medio (información general)
 */

export const PATRONES_VIBRACION = {
  evacuacion: [200, 100, 200] as number[],
  replica: [500, 200, 500, 200, 500] as number[],
  info: [400] as number[],
} as const;

export type TipoAlerta = keyof typeof PATRONES_VIBRACION;

/**
 * Vibra el dispositivo según el tipo de alerta.
 * Falla silenciosamente si el navegador no soporta Vibration API.
 */
export function vibrarAlerta(tipo: TipoAlerta): boolean {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return false;
  }

  const patron = PATRONES_VIBRACION[tipo];
  if (!patron) return false;

  try {
    return navigator.vibrate([...patron]);
  } catch {
    return false;
  }
}

/**
 * Cancela cualquier vibración en curso.
 */
export function cancelarVibracion(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(0);
  }
}

/**
 * Retorna el patrón de vibración como array de números para usar
 * en la opción `vibrate` de showNotification().
 */
export function obtenerPatron(tipo: TipoAlerta): number[] {
  return [...(PATRONES_VIBRACION[tipo] || PATRONES_VIBRACION.info)];
}

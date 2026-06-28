// Utilidades de búsqueda unificada para dondeestan.org

/** Mapa de caracteres acentuados → sin acento */
const ACENTOS: Record<string, string> = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
  'ü': 'u', 'ñ': 'n',
  'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u',
  'Ü': 'u', 'Ñ': 'n',
};

/**
 * Normaliza texto para matching fuzzy:
 * minúsculas, sin acentos, sin espacios extra
 */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => ACENTOS[c] || c)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detecta el tipo de búsqueda según el patrón del query
 */
export function detectarTipoQuery(q: string): 'cedula' | 'nombre' | 'descripcion' {
  const trimmed = q.trim();
  if (/^\d+$/.test(trimmed)) return 'cedula';

  const palabras = trimmed.split(/\s+/);
  // 1-2 palabras sin dígitos → nombre
  if (palabras.length <= 2 && !/\d/.test(trimmed)) return 'nombre';

  return 'descripcion';
}

/**
 * Genera variantes fuzzy de un nombre para LIKE matching.
 * Aplica sustituciones fonéticas comunes del español venezolano.
 */
export function generarVariantesFuzzy(nombre: string): string[] {
  const original = nombre.trim();
  const sinAcentos = normalizarTexto(original);
  const variantes = new Set<string>([original, sinAcentos]);

  // Sustituciones fonéticas comunes en español
  const sustituciones: [RegExp, string][] = [
    [/z/g, 's'],   // zapata → sapata
    [/s/g, 'z'],   // salazar → zalazar
    [/c(?=[ei])/g, 's'],  // cecilia → sesilia
    [/s(?=[ei])/g, 'c'],  // sebastian → cebasitian
    [/v/g, 'b'],   // valverde → balberde
    [/b/g, 'v'],   // barboza → varvoza
    [/ll/g, 'y'],  // castillo → castiyo
    [/y/g, 'll'],  // yolanda → llolanda
    [/j/g, 'g'],   // jimenez → gimenez
    [/g(?=[ei])/g, 'j'],  // gerardo → jerardo
    [/gü/g, 'gu'], // güero → guero
    [/gu(?=[ei])/g, 'gü'], // guerrero → güerrero
    [/h/g, ''],    // hernandez → ernandez
  ];

  // Aplicar cada sustitución sobre el texto normalizado
  for (const [patron, reemplazo] of sustituciones) {
    const variante = sinAcentos.replace(patron, reemplazo);
    if (variante !== sinAcentos) {
      variantes.add(variante);
    }
  }

  return [...variantes];
}

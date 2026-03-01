/**
 * lib/phone.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilitários de normalização de número de telefone brasileiro.
 *
 * Problema: o lead é salvo com formatos variados:
 *   "(31) 98800-1111"  →  banco
 *   "+5531988001111"   →  webhook da IA
 *
 * Solução: normalizar TUDO para somente dígitos sem código de país.
 * Exemplos de entrada → saída esperada:
 *   "+55 (31) 98800-1111"  →  "31988001111"
 *   "5531988001111"        →  "31988001111"
 *   "(31)98800-1111"       →  "31988001111"
 *   "31988001111"          →  "31988001111"
 *   "988001111"            →  "988001111"   (sem DDD — aceito)
 */

/**
 * Remove tudo que não é dígito e descarta o +55 inicial se presente.
 * Retorna string somente com dígitos, sem código de país.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return ''

  // 1. Remove tudo que não seja dígito
  let digits = raw.replace(/\D/g, '')

  // 2. Descarta código de país +55 (aparece como "55" no início)
  //    Só remove se o número tiver 12+ dígitos (55 + DDD + número)
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2)
  }

  return digits
}

/**
 * Gera uma lista de variações do número para ampliar a busca no banco.
 * Útil porque os leads podem ter sido salvos em diferentes formatos.
 *
 * Ex: "31988001111" → ["31988001111", "988001111", "+5531988001111"]
 */
export function phoneVariants(raw: string): string[] {
  const norm = normalizePhone(raw)
  if (!norm) return []

  const variants = new Set<string>()

  // Forma normalizada base (somente dígitos sem +55)
  variants.add(norm)

  // Sem DDD (últimos 8 ou 9 dígitos)
  if (norm.length >= 10) {
    variants.add(norm.slice(2))  // remove DDD de 2 dígitos
  }

  // Com +55 na frente
  variants.add(`+55${norm}`)

  // Formato com código de país sem +
  variants.add(`55${norm}`)

  // Formatado com parênteses e traço (para busca LIKE no banco)
  if (norm.length === 11) {
    const ddd   = norm.slice(0, 2)
    const part1 = norm.slice(2, 7)
    const part2 = norm.slice(7)
    variants.add(`(${ddd}) ${part1}-${part2}`)
    variants.add(`(${ddd})${part1}-${part2}`)
    variants.add(`${ddd} ${part1}-${part2}`)
  } else if (norm.length === 10) {
    const ddd   = norm.slice(0, 2)
    const part1 = norm.slice(2, 6)
    const part2 = norm.slice(6)
    variants.add(`(${ddd}) ${part1}-${part2}`)
  }

  return Array.from(variants)
}

/**
 * Verifica se dois números de telefone são equivalentes após normalização.
 */
export function phonesMatch(a: string, b: string): boolean {
  return normalizePhone(a) === normalizePhone(b)
}

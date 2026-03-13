/**
 * lib/services/pdv.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PdvService — Criação e Gestão de PDVs (PartnerStore)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ROTAS SERVIDAS:
 *   POST /api/mobile/pdv   – promotor cadastra PDV com GPS no campo
 *   POST /api/pdv          – admin/manager cadastra PDV no painel
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DTO — CreatePdvDto
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Obrigatório:
 *    name        string   — nome comercial do PDV (≥ 2 chars)
 *
 *  Identificação:
 *    cnpj?       string   — CNPJ formatado ou somente dígitos
 *                           Validado com algoritmo de dígitos verificadores
 *                           Único por tenant (se informado)
 *
 *  Localização:
 *    address?    string   — endereço completo formatado
 *    cidade?     string   — município
 *    uf?         string   — estado (2 letras: "SP", "RJ", etc.)
 *    latitude?   number   — Float GPS: faixa -90.0 a +90.0
 *    longitude?  number   — Float GPS: faixa -180.0 a +180.0
 *
 *    Nota: latitude e longitude são capturados pelo app mobile no momento
 *    do cadastro via Geolocation API. São fundamentais para o Mapa ao Vivo
 *    renderizar os pinos de PDVs no painel admin.
 *
 *  Contato:
 *    ownerName?  string   — nome do responsável local
 *    ownerPhone? string   — telefone do responsável
 *
 *  Classificação:
 *    storeType?  string   — POSTO_COMBUSTIVEL (default) | LOJA_VAREJO |
 *                           OFICINA | TRANSPORTADORA | OUTROS
 *
 *  Relações:
 *    managerPromoterId?          string — ID do promotor-gerente
 *    customNetworkCommissionPct? number — taxa customizada 0-100
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VALIDAÇÕES DE GEOCOORDENADAS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  • latitude  deve ser número no intervalo [-90, +90]
 *  • longitude deve ser número no intervalo [-180, +180]
 *  • Se apenas um dos dois for informado → erro (devem vir juntos)
 *  • Coordenadas inválidas (0,0) emitem warning mas são aceitas
 *    (pode ser erro do GPS do dispositivo — não bloqueia o cadastro)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VALIDAÇÃO DE CNPJ
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  • Remove pontuação: "11.222.333/0001-44" → "11222333000144"
 *  • Verifica se tem 14 dígitos
 *  • Calcula os 2 dígitos verificadores
 *  • Rejeita CNPJs com todos os dígitos iguais (00000000000000, etc.)
 *  • Verifica unicidade por tenant no banco
 */

import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const STORE_TYPES = [
  'POSTO_COMBUSTIVEL',
  'LOJA_VAREJO',
  'OFICINA',
  'TRANSPORTADORA',
  'OUTROS',
] as const

export type StoreType = typeof STORE_TYPES[number]

// ─────────────────────────────────────────────────────────────────────────────
// DTO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DTO de criação de PDV.
 *
 * Aceita latitude/longitude como Float para o Mapa ao Vivo.
 * Validações completas em validateCreatePdvDto().
 */
export interface CreatePdvDto {
  // ── Obrigatório ───────────────────────────────────────────────────────────
  /** Nome comercial do PDV — mínimo 2 caracteres */
  name: string

  // ── Identificação ─────────────────────────────────────────────────────────
  /** CNPJ formatado ou somente dígitos — validado e único por tenant */
  cnpj?: string

  // ── Localização geográfica ────────────────────────────────────────────────
  /** Endereço completo: "Av. Paulista, 900 - Bela Vista, São Paulo - SP" */
  address?: string

  /** Município */
  cidade?: string

  /** Estado — 2 letras maiúsculas: "SP", "RJ", "MG" */
  uf?: string

  /**
   * Latitude GPS capturada pelo app mobile via Geolocation API.
   * Faixa válida: -90.0 (Sul) a +90.0 (Norte)
   * Exemplo Brasil: -23.5505 (São Paulo), -22.9068 (Rio de Janeiro)
   */
  latitude?: number

  /**
   * Longitude GPS capturada pelo app mobile via Geolocation API.
   * Faixa válida: -180.0 (Oeste) a +180.0 (Leste)
   * Exemplo Brasil: -46.6333 (São Paulo), -43.1729 (Rio de Janeiro)
   */
  longitude?: number

  // ── Contato ───────────────────────────────────────────────────────────────
  ownerName?:  string
  ownerPhone?: string

  // ── Classificação ─────────────────────────────────────────────────────────
  storeType?: string

  // ── Relações ──────────────────────────────────────────────────────────────
  managerPromoterId?:         string
  customNetworkCommissionPct?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de Validação
// ─────────────────────────────────────────────────────────────────────────────

/** Remove pontuação do CNPJ e retorna somente os 14 dígitos. */
function cleanCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '')
}

/**
 * Valida CNPJ pelo algoritmo de dígitos verificadores.
 * Retorna true se válido, false caso contrário.
 */
export function isValidCnpj(raw: string): boolean {
  const c = cleanCnpj(raw)
  if (c.length !== 14) return false
  // Rejeita sequências repetidas (00000000000000, etc.)
  if (/^(\d)\1+$/.test(c)) return false

  const calc = (digits: string, weights: number[]) =>
    digits
      .split('')
      .reduce((acc, d, i) => acc + parseInt(d, 10) * weights[i], 0)

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  const r1 = calc(c.slice(0, 12), w1) % 11
  const d1 = r1 < 2 ? 0 : 11 - r1

  const r2 = calc(c.slice(0, 13), w2) % 11
  const d2 = r2 < 2 ? 0 : 11 - r2

  return d1 === parseInt(c[12], 10) && d2 === parseInt(c[13], 10)
}

/**
 * Formata CNPJ para exibição: "11.222.333/0001-44"
 */
export function formatCnpj(raw: string): string {
  const c = cleanCnpj(raw)
  if (c.length !== 14) return raw
  return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`
}

/** Valida se latitude está no intervalo [-90, +90] */
function isValidLat(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= -90 && v <= 90
}

/** Valida se longitude está no intervalo [-180, +180] */
function isValidLng(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= -180 && v <= 180
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultado da validação
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  ok:      boolean
  errors:  string[]
  /** Warnings não bloqueiam o cadastro — informados na resposta */
  warnings: string[]
  /** DTO sanitizado (pronto para prisma.create) */
  data?:   SanitizedPdvData
}

export interface SanitizedPdvData {
  name:                       string
  cnpj:                       string | null
  address:                    string | null
  cidade:                     string | null
  uf:                         string | null
  latitude:                   number | null
  longitude:                  number | null
  ownerName:                  string | null
  ownerPhone:                 string | null
  storeType:                  string
  managerPromoterId:          string | null
  customNetworkCommissionPct: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// validateCreatePdvDto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida e sanitiza o DTO de criação de PDV.
 *
 * Não acessa o banco — apenas valida tipos e formatos.
 * Verificações que exigem banco (CNPJ único) ficam em createPdv().
 */
export function validateCreatePdvDto(dto: CreatePdvDto): ValidationResult {
  const errors:   string[] = []
  const warnings: string[] = []

  // ── name ──────────────────────────────────────────────────────────────────
  if (!dto.name || typeof dto.name !== 'string' || dto.name.trim().length < 2) {
    errors.push('name: obrigatório, mínimo 2 caracteres')
  }

  // ── cnpj ──────────────────────────────────────────────────────────────────
  let cnpjClean: string | null = null
  if (dto.cnpj) {
    cnpjClean = cleanCnpj(dto.cnpj)
    if (!isValidCnpj(dto.cnpj)) {
      errors.push(`cnpj: CNPJ inválido (${dto.cnpj}) — verifique os dígitos verificadores`)
    }
  }

  // ── storeType ─────────────────────────────────────────────────────────────
  const storeType = (dto.storeType ?? 'POSTO_COMBUSTIVEL') as string
  if (!(STORE_TYPES as readonly string[]).includes(storeType)) {
    errors.push(`storeType: valor inválido "${storeType}". Use: ${STORE_TYPES.join(' | ')}`)
  }

  // ── uf ────────────────────────────────────────────────────────────────────
  if (dto.uf && (typeof dto.uf !== 'string' || dto.uf.trim().length !== 2)) {
    errors.push('uf: deve ter exatamente 2 letras (ex: "SP", "RJ")')
  }

  // ── customNetworkCommissionPct ─────────────────────────────────────────────
  if (dto.customNetworkCommissionPct !== undefined && dto.customNetworkCommissionPct !== null) {
    const pct = dto.customNetworkCommissionPct
    if (typeof pct !== 'number' || !isFinite(pct) || pct < 0 || pct > 100) {
      errors.push('customNetworkCommissionPct: deve ser número entre 0 e 100')
    }
  }

  // ── Geocoordenadas ─────────────────────────────────────────────────────────
  //
  //  Regras:
  //    1. Se um é informado e o outro não → erro (devem vir juntos)
  //    2. Latitude fora de [-90, +90]    → erro
  //    3. Longitude fora de [-180, +180] → erro
  //    4. Coordenada (0, 0) → warning (pode ser GPS não inicializado)
  //
  const hasLat = dto.latitude  !== undefined && dto.latitude  !== null
  const hasLng = dto.longitude !== undefined && dto.longitude !== null

  if (hasLat !== hasLng) {
    errors.push(
      'latitude e longitude devem ser informados juntos — envie ambos ou nenhum'
    )
  } else if (hasLat && hasLng) {
    if (!isValidLat(dto.latitude)) {
      errors.push(`latitude: valor inválido "${dto.latitude}" — faixa aceita: -90.0 a +90.0`)
    }
    if (!isValidLng(dto.longitude)) {
      errors.push(`longitude: valor inválido "${dto.longitude}" — faixa aceita: -180.0 a +180.0`)
    }
    // Warning: (0,0) é o Mar de Guiné — provavelmente GPS não inicializado
    if (dto.latitude === 0 && dto.longitude === 0) {
      warnings.push(
        'Coordenada (0, 0) detectada — GPS pode não estar inicializado. ' +
        'O PDV será salvo, mas o pino pode aparecer fora do Brasil no mapa.'
      )
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings }
  }

  // ── Sanitiza o DTO ─────────────────────────────────────────────────────────
  const data: SanitizedPdvData = {
    name:                       dto.name.trim(),
    cnpj:                       cnpjClean,
    address:                    dto.address?.trim()   ?? null,
    cidade:                     dto.cidade?.trim()    ?? null,
    uf:                         dto.uf?.trim().toUpperCase() ?? null,
    latitude:                   (hasLat && isValidLat(dto.latitude))  ? dto.latitude  : null,
    longitude:                  (hasLng && isValidLng(dto.longitude)) ? dto.longitude : null,
    ownerName:                  dto.ownerName?.trim()  ?? null,
    ownerPhone:                 dto.ownerPhone?.trim() ?? null,
    storeType,
    managerPromoterId:          dto.managerPromoterId ?? null,
    customNetworkCommissionPct: dto.customNetworkCommissionPct ?? null,
  }

  return { ok: true, errors: [], warnings, data }
}

// ─────────────────────────────────────────────────────────────────────────────
// createPdv
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria um novo PDV no banco de dados.
 *
 * Fluxo completo:
 *  1. Valida o DTO (tipos, formatos, coordenadas)
 *  2. Verifica CNPJ único por tenant
 *  3. Verifica que o managerPromoter existe e tem role PROMOTER
 *  4. Persiste o PartnerStore com latitude/longitude
 *  5. Retorna o PDV criado + warnings (ex: coordenada (0,0))
 *
 * @param dto       – dados do PDV (vide CreatePdvDto)
 * @param createdBy – userId de quem está cadastrando (promotor ou admin)
 * @param tenantId  – tenant do usuário logado (null = ADMIN_MASTER sem tenant)
 */
export async function createPdv(
  dto:       CreatePdvDto,
  createdBy: string,
  tenantId:  string | null,
): Promise<{ pdv: object; warnings: string[] }> {

  // ── 1. Validação do DTO ───────────────────────────────────────────────────
  const validation = validateCreatePdvDto(dto)
  if (!validation.ok) {
    throw new Error(validation.errors.join(' | '))
  }

  const data = validation.data!

  // ── 2. Unicidade do CNPJ por tenant ───────────────────────────────────────
  if (data.cnpj) {
    const existing = await prisma.partnerStore.findFirst({
      where: {
        cnpj: data.cnpj,
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true, name: true },
    })

    if (existing) {
      throw new Error(
        `CNPJ ${formatCnpj(data.cnpj)} já cadastrado neste tenant ` +
        `(PDV: "${existing.name}", id: ${existing.id})`
      )
    }
  }

  // ── 3. Valida managerPromoter ─────────────────────────────────────────────
  if (data.managerPromoterId) {
    const manager = await prisma.user.findFirst({
      where: {
        id:   data.managerPromoterId,
        role: 'PROMOTER',
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true, nome: true },
    })

    if (!manager) {
      throw new Error(
        `managerPromoterId inválido: usuário "${data.managerPromoterId}" ` +
        'não encontrado ou não tem role PROMOTER'
      )
    }
  }

  // ── 4. Cria o PDV ─────────────────────────────────────────────────────────
  //
  //  latitude e longitude são salvos como Float? no banco.
  //  Quando presentes, permitem ao Mapa ao Vivo renderizar o pino da loja
  //  sem custo adicional (não exige geocodificação posterior).
  //
  const pdv = await prisma.partnerStore.create({
    data: {
      name:                       data.name,
      cnpj:                       data.cnpj,
      address:                    data.address,
      cidade:                     data.cidade,
      uf:                         data.uf,
      latitude:                   data.latitude,
      longitude:                  data.longitude,
      ownerName:                  data.ownerName,
      ownerPhone:                 data.ownerPhone,
      storeType:                  data.storeType,
      status:                     'ACTIVE',
      managerPromoterId:          data.managerPromoterId,
      customNetworkCommissionPct: data.customNetworkCommissionPct,
      tenantId:                   tenantId,
    },
    select: {
      id:                         true,
      name:                       true,
      cnpj:                       true,
      address:                    true,
      cidade:                     true,
      uf:                         true,
      latitude:                   true,
      longitude:                  true,
      ownerName:                  true,
      ownerPhone:                 true,
      storeType:                  true,
      status:                     true,
      totalLeads:                 true,
      customNetworkCommissionPct: true,
      managerPromoter: {
        select: { id: true, nome: true, email: true },
      },
      createdAt: true,
    },
  })

  return { pdv, warnings: validation.warnings }
}

// ─────────────────────────────────────────────────────────────────────────────
// getPdvsForMap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna PDVs com coordenadas para o Mapa ao Vivo.
 *
 * Filtra apenas registros onde latitude e longitude não são nulos,
 * garantindo que o mapa só exiba pinos com posição válida.
 *
 * @param tenantId – filtro de tenant (null = sem filtro)
 * @param status   – filtra por status (default: ACTIVE)
 */
export async function getPdvsForMap(
  tenantId: string | null,
  status   = 'ACTIVE',
) {
  return prisma.partnerStore.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status,
      latitude:  { not: null },
      longitude: { not: null },
    },
    select: {
      id:         true,
      name:       true,
      latitude:   true,
      longitude:  true,
      address:    true,
      cidade:     true,
      uf:         true,
      storeType:  true,
      totalLeads: true,
      totalSales: true,
      managerPromoter: {
        select: { id: true, nome: true },
      },
    },
    orderBy: { totalLeads: 'desc' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// getMapLocations  — Radar de PDVs / Mapa de Parceiros
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filtros aceitos pelo endpoint GET /api/mobile/pdv/map-locations
 */
export interface MapLocationsFilter {
  /** Tenant do utilizador autenticado (null = ADMIN_MASTER sem filtro) */
  tenantId?:  string | null
  /** Filtra por tipo de loja: POSTO_COMBUSTIVEL | LOJA_VAREJO | OFICINA | ... */
  storeType?: string
  /** Filtra por município */
  cidade?:    string
  /** Filtra por estado (2 letras) */
  uf?:        string
  /**
   * Se informado, retorna apenas PDVs gerenciados pelo userId especificado.
   * Usado quando o promotor ativa "ownOnly=true" no app.
   */
  ownOnly?:   string
  /** Retorna apenas PDVs com totalLeads >= minLeads */
  minLeads?:  number
}

/**
 * Shape exata de cada pino retornado para o mapa.
 *
 * Campos selecionados com cuidado para minimizar o payload:
 *   • latitude / longitude  → pino no mapa (nunca null — filtro garante)
 *   • totalLeads            → intensidade visual do pino (heatmap / tamanho)
 *   • managerPromoterId     → destaque de "Meu PDV" no app
 *   • storeType             → ícone do pino (posto, loja, oficina, etc.)
 *   • address / cidade / uf → popup de detalhes ao clicar no pino
 */
export interface MapLocationPin {
  id:                string
  name:              string
  address:           string | null
  latitude:          number          // garantido não-null pelo filtro Prisma
  longitude:         number          // garantido não-null pelo filtro Prisma
  totalLeads:        number
  managerPromoterId: string | null
  storeType:         string
  cidade:            string | null
  uf:                string | null
}

/**
 * Query otimizada para o Radar de PDVs.
 *
 * ─── O que este service faz ──────────────────────────────────────────────────
 *
 *  1. Filtra status = "ACTIVE"   → só PDVs operacionais no mapa
 *  2. Filtra tenantId            → isolamento multi-tenant obrigatório
 *  3. Filtra lat/lng NOT NULL    → sem coordenada = sem pino (Prisma nativo)
 *  4. Filtra storeType / cidade / uf / minLeads (opcionais)
 *  5. Filtra ownOnly             → apenas PDVs do próprio promotor
 *  6. select MÍNIMO              → ~2-5 KB para 500 PDVs vs ~200 KB completo
 *  7. orderBy totalLeads desc    → PDVs de maior rendimento ficam no topo
 *                                  (app pode renderizar pinos maiores primeiro)
 *
 * ─── Por que NÃO usar _count ou join com leads[] ─────────────────────────────
 *
 *  O campo `totalLeads` é um contador denormalizado (Int, default 0) mantido
 *  pelo sistema sempre atualizado — leitura O(1) vs _count que faz COUNT(*).
 *  Para SQLite em produção esta diferença é significativa em tabelas grandes.
 *
 * @param filter – MapLocationsFilter com todos os critérios opcionais
 * @returns      – Array de MapLocationPin ordenado por totalLeads desc
 */
export async function getMapLocations(
  filter: MapLocationsFilter = {},
): Promise<MapLocationPin[]> {
  const {
    tenantId,
    storeType,
    cidade,
    uf,
    ownOnly,
    minLeads,
  } = filter

  const rows = await prisma.partnerStore.findMany({
    where: {
      // ── Apenas PDVs operacionais ─────────────────────────────────────────
      status: 'ACTIVE',

      // ── Isolamento multi-tenant ──────────────────────────────────────────
      //   tenantId null → ADMIN_MASTER sem filtro (vê todos)
      ...(tenantId ? { tenantId } : {}),

      // ── FILTRO CRUCIAL: só PDVs com coordenadas GPS ─────────────────────
      //   Prisma traduz para: WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      latitude:  { not: null },
      longitude: { not: null },

      // ── Filtros opcionais ────────────────────────────────────────────────
      ...(storeType ? { storeType } : {}),

      // cidade: case-insensitive parcial (SQLite LIKE)
      ...(cidade ? { cidade: { contains: cidade } } : {}),

      ...(uf ? { uf: uf.toUpperCase() } : {}),

      // Filtro de performance mínima: só PDVs que geraram ao menos N leads
      ...(minLeads !== undefined && minLeads > 0
        ? { totalLeads: { gte: minLeads } }
        : {}),

      // Filtro "Meu PDV": promotor quer ver só os seus PDVs no mapa
      ...(ownOnly ? { managerPromoterId: ownOnly } : {}),
    },

    // ── SELECT MÍNIMO — não carrega campos desnecessários ─────────────────
    //
    //  ❌ NÃO inclui: leads[], sales[], employees[], commissionLedgerEntries[],
    //                  pdvVisits[], tenant{}, cnpj, ownerName, ownerPhone,
    //                  customNetworkCommissionPct, totalSales, createdAt, updatedAt
    //
    //  ✅ INCLUI apenas o que o mapa precisa para renderizar o pino e o popup
    //
    select: {
      id:                true,
      name:              true,
      address:           true,
      latitude:          true,
      longitude:         true,
      totalLeads:        true,
      managerPromoterId: true,
      storeType:         true,
      cidade:            true,
      uf:                true,
    },

    // PDVs mais produtivos primeiro (permite o app renderizar pinos maiores)
    orderBy: { totalLeads: 'desc' },
  })

  // ── Cast seguro: garante que lat/lng são number (o filtro Prisma já garante
  //    NOT NULL, mas TypeScript não sabe disso sem a asserção) ──────────────
  return rows.map(r => ({
    id:                r.id,
    name:              r.name,
    address:           r.address,
    latitude:          r.latitude  as number,   // NOT NULL garantido pelo where
    longitude:         r.longitude as number,   // NOT NULL garantido pelo where
    totalLeads:        r.totalLeads,
    managerPromoterId: r.managerPromoterId,
    storeType:         r.storeType,
    cidade:            r.cidade,
    uf:                r.uf,
  }))
}

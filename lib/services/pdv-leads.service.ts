/**
 * lib/services/pdv-leads.service.ts
 * ---------------------------------------------------------------------------
 * PdvLeadsService -- Analytics and Listing for PDV-origin Leads
 * ---------------------------------------------------------------------------
 *
 * QUERIES IMPLEMENTED:
 *
 *  1. listPdvLeads(filters)
 *     - findMany with full includes: pdv (PartnerStore) + managerPromoter (User)
 *     - Filters: sourceType[], funnelStage, status, tenantId, pdvId,
 *                promotorId, dateFrom, dateTo, search (name/phone)
 *     - Pagination: page + limit
 *     - Returns: leads[], total, pagination meta
 *
 *  2. getPdvLeadsStats(tenantId?, months?)
 *     - Count leads in current month (total + by sourceType)
 *     - groupBy sourceType: QR_CODE_PDV vs MANUAL_PDV counts
 *     - Top 3 PDVs by lead count in the period (ranking)
 *     - Conversion rate: leads with funnelStage=CONVERTIDO / total
 *     - Trend: leads per day for sparkline charts
 *
 * SOURCE TYPES FOR PDV LEADS:
 *   QR_CODE_PDV  -- customer scanned QR Code at PDV (passive capture)
 *   MANUAL_PDV   -- attendant manually registered lead at PDV (active capture)
 *   PDV          -- legacy value (treated same as MANUAL_PDV)
 *
 * INCLUDES PATTERN (avoids N+1):
 *   Single findMany with nested select -- no separate queries per lead
 *   PDV data: id, name, cidade, uf, storeType, totalLeads, totalSales
 *   Promotor data: id, nome, email, role (no sensitive fields)
 */

import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All sourceType values that originate from the PDV partner network */
export const PDV_SOURCE_TYPES = ['QR_CODE_PDV', 'MANUAL_PDV', 'PDV'] as const
export type PdvSourceType = typeof PDV_SOURCE_TYPES[number]

/** Label map for display in charts and tables */
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  QR_CODE_PDV: 'QR Code (Passivo)',
  MANUAL_PDV:  'Cadastro Manual (Frentista)',
  PDV:         'PDV (Legado)',
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ListPdvLeadsFilters {
  /** Tenant scope (null = ADMIN_MASTER sees all) */
  tenantId?:    string | null
  /** Filter by specific PDV */
  pdvId?:       string
  /** Filter by specific promotor-manager */
  promotorId?:  string
  /** Filter by sourceType -- defaults to all PDV types */
  sourceTypes?: PdvSourceType[]
  /** Filter by funnel stage */
  funnelStage?: string
  /** Filter by lead status */
  status?:      string
  /** Filter by lead type: B2C | B2B */
  leadType?:    string
  /** Date range -- createdAt >= dateFrom */
  dateFrom?:    Date
  /** Date range -- createdAt <= dateTo */
  dateTo?:      Date
  /** Search by customer name or phone */
  search?:      string
  /** Pagination */
  page?:        number
  limit?:       number
  /** Sort field */
  orderBy?:     'createdAt' | 'nomeCliente' | 'funnelStage'
  orderDir?:    'asc' | 'desc'
}

export interface PdvLeadsStatsFilters {
  tenantId?: string | null
  pdvId?:    string
  /** Number of months to look back (default: 1 = current month only) */
  months?:   number
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface PdvLeadItem {
  id:           string
  nomeCliente:  string
  telefone:     string | null
  email:        string | null
  veiculo:      string
  placa:        string
  leadType:     string
  sourceType:   string
  sourceLabel:  string
  funnelStage:  string
  iaStatus:     string | null
  status:       string
  createdAt:    string
  // Nested: PDV that originated the lead
  pdv: {
    id:         string
    name:       string
    cidade:     string | null
    uf:         string | null
    storeType:  string
    totalLeads: number
    totalSales: number
  } | null
  // Nested: promotor who manages the PDV (earns network commission)
  promotor: {
    id:    string
    nome:  string
    email: string
    role:  string
  } | null
}

export interface ListPdvLeadsResult {
  success:    boolean
  data:       PdvLeadItem[]
  pagination: {
    total: number
    page:  number
    limit: number
    pages: number
  }
}

export interface SourceTypeBreakdown {
  sourceType:  string
  label:       string
  count:       number
  pct:         number    // percentage of total PDV leads in the period
}

export interface PdvRankingEntry {
  rank:       number
  pdvId:      string
  pdvName:    string
  cidade:     string | null
  uf:         string | null
  storeType:  string
  /** Total leads from this PDV in the period */
  leadsCount: number
  /** Leads converted to sale in the period */
  converted:  number
  /** Conversion rate 0-100 */
  convRate:   number
  promotorNome: string | null
  promotorId:   string | null
}

export interface DailyLeadPoint {
  date:  string   // "DD/MM"
  total: number
  qrCode: number
  manual: number
}

export interface PdvLeadsStats {
  // Current month totals
  totalLeadsMonth:     number
  totalLeadsPrevMonth: number
  monthGrowthPct:      number

  // All-time totals (scoped by tenant/filters)
  totalLeadsAllTime:   number
  totalConverted:      number
  conversionRate:      number   // 0-100

  // Source breakdown for the current period
  bySource: SourceTypeBreakdown[]

  // Top 3 PDVs by lead volume in the period
  topPdvs: PdvRankingEntry[]

  // Daily trend (last 30 days) for sparkline chart
  dailyTrend: DailyLeadPoint[]
}

// ---------------------------------------------------------------------------
// 1. LIST PDV LEADS  (findMany with full includes)
// ---------------------------------------------------------------------------

/**
 * Lists leads originating from the PDV partner network.
 *
 * Uses a SINGLE findMany with nested select to avoid N+1 queries.
 * Returns paginated results with PDV and managerPromoter data embedded.
 */
export async function listPdvLeads(
  filters: ListPdvLeadsFilters = {},
): Promise<ListPdvLeadsResult> {
  const {
    tenantId,
    pdvId,
    promotorId,
    sourceTypes   = [...PDV_SOURCE_TYPES],
    funnelStage,
    status,
    leadType,
    dateFrom,
    dateTo,
    search,
    page     = 1,
    limit    = 20,
    orderBy  = 'createdAt',
    orderDir = 'desc',
  } = filters

  const safePage  = Math.max(1, page)
  const safeLimit = Math.min(100, Math.max(1, limit))
  const skip      = (safePage - 1) * safeLimit

  // ── Build WHERE clause ──────────────────────────────────────────────────
  //
  // Core filter: only leads from the PDV network (sourceType IN [...])
  // AND pdvId IS NOT NULL (must have a linked PDV)
  //
  const where: Record<string, unknown> = {
    sourceType: { in: sourceTypes },
    pdvId:      { not: null },   // must be linked to a PDV
  }

  // Tenant scope (ADMIN_MASTER passes null to see all tenants)
  if (tenantId) where.tenantId = tenantId

  // Optional filters
  if (pdvId)      where.pdvId     = pdvId
  if (promotorId) where.promotorId = promotorId
  if (funnelStage) where.funnelStage = funnelStage
  if (status)     where.status    = status
  if (leadType)   where.leadType  = leadType

  // Date range
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {}
    if (dateFrom) dateFilter.gte = dateFrom
    if (dateTo)   dateFilter.lte = dateTo
    where.createdAt = dateFilter
  }

  // Full-text search (customer name OR phone)
  if (search?.trim()) {
    const q = search.trim()
    where.OR = [
      { nomeCliente:  { contains: q } },
      { telefone:     { contains: q } },
      { telefoneNorm: { contains: q } },
      { placa:        { contains: q } },
    ]
  }

  // ── Execute: count + findMany in parallel ───────────────────────────────
  const [total, rawLeads] = await Promise.all([

    prisma.lead.count({ where }),

    prisma.lead.findMany({
      where,
      skip,
      take: safeLimit,
      orderBy: { [orderBy]: orderDir },

      // ── INCLUDES: PDV + managerPromoter ──────────────────────────────────
      //
      // Lead --> PartnerStore (pdv)
      //            --> User (managerPromoter)   [who earns network commission]
      //
      // Uses SELECT instead of full include to avoid returning sensitive fields
      // and keep the payload lean.
      //
      select: {
        id:           true,
        nomeCliente:  true,
        telefone:     true,
        email:        true,
        veiculo:      true,
        placa:        true,
        leadType:     true,
        sourceType:   true,
        funnelStage:  true,
        iaStatus:     true,
        status:       true,
        createdAt:    true,

        // ── PDV (PartnerStore) ────────────────────────────────────────────
        pdv: {
          select: {
            id:         true,
            name:       true,
            cidade:     true,
            uf:         true,
            storeType:  true,
            totalLeads: true,
            totalSales: true,
            // Nested: promotor who manages this PDV
            managerPromoter: {
              select: {
                id:    true,
                nome:  true,
                email: true,
                role:  true,
              },
            },
          },
        },

        // ── Direct promotor link on Lead (who registered this lead) ──────
        promotor: {
          select: {
            id:    true,
            nome:  true,
            email: true,
            role:  true,
          },
        },
      },
    }),
  ])

  // ── Shape output ─────────────────────────────────────────────────────────
  const data: PdvLeadItem[] = rawLeads.map(l => ({
    id:          l.id,
    nomeCliente: l.nomeCliente,
    telefone:    l.telefone,
    email:       l.email,
    veiculo:     l.veiculo,
    placa:       l.placa,
    leadType:    l.leadType,
    sourceType:  l.sourceType,
    sourceLabel: SOURCE_TYPE_LABELS[l.sourceType] ?? l.sourceType,
    funnelStage: l.funnelStage,
    iaStatus:    l.iaStatus,
    status:      l.status,
    createdAt:   l.createdAt.toISOString(),
    pdv: l.pdv ? {
      id:         l.pdv.id,
      name:       l.pdv.name,
      cidade:     l.pdv.cidade,
      uf:         l.pdv.uf,
      storeType:  l.pdv.storeType,
      totalLeads: l.pdv.totalLeads,
      totalSales: l.pdv.totalSales,
    } : null,
    // managerPromoter from PDV takes precedence; fall back to direct promotor link
    promotor: l.pdv?.managerPromoter
      ? {
          id:    l.pdv.managerPromoter.id,
          nome:  l.pdv.managerPromoter.nome,
          email: l.pdv.managerPromoter.email,
          role:  l.pdv.managerPromoter.role,
        }
      : l.promotor
      ? {
          id:    l.promotor.id,
          nome:  l.promotor.nome,
          email: l.promotor.email,
          role:  l.promotor.role,
        }
      : null,
  }))

  return {
    success: true,
    data,
    pagination: {
      total,
      page:  safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  }
}

// ---------------------------------------------------------------------------
// 2. PDV LEADS STATS  (groupBy + ranking + trend)
// ---------------------------------------------------------------------------

/**
 * Computes analytics for the PDV leads panel dashboard cards.
 *
 * Executes 6 queries in parallel (Promise.all) for performance:
 *   Q1  count -- current month total
 *   Q2  count -- previous month total (growth comparison)
 *   Q3  count -- all-time total
 *   Q4  count -- all-time converted
 *   Q5  groupBy sourceType (QR Code vs Manual breakdown)
 *   Q6  groupBy pdvId (top PDVs ranking raw data)
 *   Q7  findMany createdAt (daily trend -- last 30 days)
 */
export async function getPdvLeadsStats(
  filters: PdvLeadsStatsFilters = {},
): Promise<PdvLeadsStats> {
  const { tenantId, pdvId, months = 1 } = filters

  const now          = new Date()
  const startCurrent = startOfMonth(now)
  const startPrev    = startOfPrevMonth(now)
  const endPrev      = new Date(startCurrent.getTime() - 1)   // last ms of prev month
  const periodStart  = monthsAgo(now, months)
  const last30       = daysAgo(30)

  // Base WHERE shared across all queries
  const baseWhere: Record<string, unknown> = {
    sourceType: { in: PDV_SOURCE_TYPES },
    pdvId:      { not: null },
  }
  if (tenantId)  baseWhere.tenantId = tenantId
  if (pdvId)     baseWhere.pdvId    = pdvId

  // ── Execute all queries in parallel ──────────────────────────────────────
  const [
    countCurrent,        // Q1: leads in current month
    countPrev,           // Q2: leads in previous month
    countAllTime,        // Q3: all-time total
    countConverted,      // Q4: all-time converted (funnelStage = CONVERTIDO)
    bySourceRaw,         // Q5: groupBy sourceType for current period
    byPdvRaw,            // Q6: groupBy pdvId for ranking (top N)
    convertedByPdvRaw,   // Q7: converted count per PDV (for conversion rate)
    dailyRaw,            // Q8: daily trend data (last 30 days)
  ] = await Promise.all([

    // Q1: current month count
    prisma.lead.count({
      where: { ...baseWhere, createdAt: { gte: startCurrent } },
    }),

    // Q2: previous month count
    prisma.lead.count({
      where: { ...baseWhere, createdAt: { gte: startPrev, lte: endPrev } },
    }),

    // Q3: all-time (or filtered period) total
    prisma.lead.count({ where: baseWhere }),

    // Q4: all-time converted
    prisma.lead.count({
      where: { ...baseWhere, funnelStage: 'CONVERTIDO' },
    }),

    // Q5: groupBy sourceType -- breakdown QR Code vs Manual for current period
    //
    // Prisma groupBy result:
    //   [{ sourceType: 'QR_CODE_PDV', _count: { id: 42 } },
    //    { sourceType: 'MANUAL_PDV',  _count: { id: 18 } }, ...]
    //
    prisma.lead.groupBy({
      by:      ['sourceType'],
      where:   { ...baseWhere, createdAt: { gte: periodStart } },
      _count:  { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    // Q6: groupBy pdvId -- top PDVs by lead count in the period
    //
    // Returns top 10 (we take top 3 after enrichment, but fetch 10
    // to allow for any filtering/enrichment without extra DB round-trips)
    //
    prisma.lead.groupBy({
      by:      ['pdvId'],
      where:   { ...baseWhere, createdAt: { gte: periodStart } },
      _count:  { id: true },
      orderBy: { _count: { id: 'desc' } },
      take:    10,
    }),

    // Q7: converted count per PDV (for conversion rate in ranking)
    prisma.lead.groupBy({
      by:      ['pdvId'],
      where:   {
        ...baseWhere,
        createdAt:  { gte: periodStart },
        funnelStage: 'CONVERTIDO',
      },
      _count:  { id: true },
    }),

    // Q8: raw leads for daily trend (last 30 days, only createdAt + sourceType)
    prisma.lead.findMany({
      where: { ...baseWhere, createdAt: { gte: last30 } },
      select: { createdAt: true, sourceType: true },
      orderBy: { createdAt: 'asc' },
    }),

  ])

  // ── Shape Q5: Source breakdown ─────────────────────────────────────────────
  const periodTotal = bySourceRaw.reduce((s, r) => s + r._count.id, 0)

  const bySource: SourceTypeBreakdown[] = bySourceRaw.map(r => ({
    sourceType: r.sourceType,
    label:      SOURCE_TYPE_LABELS[r.sourceType] ?? r.sourceType,
    count:      r._count.id,
    pct:        periodTotal > 0
      ? Math.round((r._count.id / periodTotal) * 100)
      : 0,
  }))

  // Fill in zero-count entries for sourceTypes not present in the period
  for (const st of PDV_SOURCE_TYPES) {
    if (!bySource.find(b => b.sourceType === st)) {
      bySource.push({ sourceType: st, label: SOURCE_TYPE_LABELS[st], count: 0, pct: 0 })
    }
  }

  // ── Shape Q6+Q7: Top PDVs Ranking ─────────────────────────────────────────
  //
  // Enrich ranking data with PDV name and promotor info.
  // Single query for all PDV IDs (IN clause) to avoid N queries.
  //
  const topPdvIds = byPdvRaw
    .map(r => r.pdvId)
    .filter((id): id is string => id !== null)

  // Fetch PDV details for all top IDs in one query
  const pdvDetails = topPdvIds.length > 0
    ? await prisma.partnerStore.findMany({
        where:  { id: { in: topPdvIds } },
        select: {
          id:        true,
          name:      true,
          cidade:    true,
          uf:        true,
          storeType: true,
          managerPromoter: {
            select: { id: true, nome: true },
          },
        },
      })
    : []

  // Build a lookup map: pdvId -> detail
  const pdvMap = new Map(pdvDetails.map(p => [p.id, p]))

  // Build converted count map: pdvId -> convertedCount
  const convertedMap = new Map<string, number>(
    convertedByPdvRaw
      .filter(r => r.pdvId !== null)
      .map(r => [r.pdvId as string, r._count.id])
  )

  // Assemble top 3 ranking (top 10 fetched, slice after enrichment)
  const topPdvs: PdvRankingEntry[] = byPdvRaw
    .filter(r => r.pdvId !== null)
    .slice(0, 3)
    .map((r, index) => {
      const pdv       = pdvMap.get(r.pdvId as string)
      const leads     = r._count.id
      const converted = convertedMap.get(r.pdvId as string) ?? 0
      return {
        rank:         index + 1,
        pdvId:        r.pdvId as string,
        pdvName:      pdv?.name      ?? 'PDV desconhecido',
        cidade:       pdv?.cidade    ?? null,
        uf:           pdv?.uf        ?? null,
        storeType:    pdv?.storeType ?? 'OUTROS',
        leadsCount:   leads,
        converted,
        convRate:     leads > 0 ? Math.round((converted / leads) * 100) : 0,
        promotorNome: pdv?.managerPromoter?.nome ?? null,
        promotorId:   pdv?.managerPromoter?.id   ?? null,
      }
    })

  // ── Shape Q8: Daily trend (last 30 days) ──────────────────────────────────
  //
  // Aggregates by calendar day -- groups raw lead timestamps into buckets.
  // Produces an array of { date, total, qrCode, manual } points.
  //
  const dayMap = new Map<string, { total: number; qrCode: number; manual: number }>()

  for (const lead of dailyRaw) {
    const key = lead.createdAt.toLocaleDateString('pt-BR', {
      day:   '2-digit',
      month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })  // "07/03"

    const existing = dayMap.get(key) ?? { total: 0, qrCode: 0, manual: 0 }
    existing.total++
    if (lead.sourceType === 'QR_CODE_PDV') existing.qrCode++
    else existing.manual++
    dayMap.set(key, existing)
  }

  // Fill in all 30 days (including days with 0 leads)
  const dailyTrend: DailyLeadPoint[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('pt-BR', {
      day:   '2-digit',
      month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
    const bucket = dayMap.get(key) ?? { total: 0, qrCode: 0, manual: 0 }
    dailyTrend.push({ date: key, ...bucket })
  }

  // ── Assemble final stats object ────────────────────────────────────────────
  const monthGrowthPct = countPrev === 0
    ? (countCurrent > 0 ? 100 : 0)
    : parseFloat((((countCurrent - countPrev) / countPrev) * 100).toFixed(1))

  return {
    totalLeadsMonth:     countCurrent,
    totalLeadsPrevMonth: countPrev,
    monthGrowthPct,
    totalLeadsAllTime:   countAllTime,
    totalConverted:      countConverted,
    conversionRate:      countAllTime > 0
      ? Math.round((countConverted / countAllTime) * 100)
      : 0,
    bySource,
    topPdvs,
    dailyTrend,
  }
}

// ---------------------------------------------------------------------------
// Date helpers (pure functions -- no side effects)
// ---------------------------------------------------------------------------

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

function startOfPrevMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1, 0, 0, 0, 0)
}

function monthsAgo(from: Date, n: number): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() - n)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

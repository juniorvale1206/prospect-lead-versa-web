/**
 * GET /api/admin/leads/queue
 * ─────────────────────────────────────────────────────────────────────────────
 * Fila de Oportunidades PDV — Leads agrupados por Safra para disparo em massa.
 *
 * Projetado para alimentar a tela /crm/fila-pdv do gestor de campanhas.
 * Agrupa leads PDV por safra (cohort "MM/YYYY"), retorna contagens e lista
 * os leads "frios" (sem campanha recente) prontos para um novo disparo.
 *
 * ROLES: ADMIN_MASTER | FINANCIAL | MANAGER
 *
 * ─── QUERY PARAMETERS ────────────────────────────────────────────────────────
 *   cohort         string   Filtrar por safra específica ex: "03/2026"
 *   pdvId          string   Filtrar por PDV específico
 *   cooldownDays   int      Ignorar leads contatados há menos de N dias (default: 15)
 *   funnelStage    string   Filtrar por estágio do funil
 *   leadType       string   B2C | B2B
 *   tenantId       string   (ADMIN_MASTER only)
 *   page           int      default 1
 *   limit          int      default 50 max 200
 *   groupOnly      boolean  Se "true", retorna apenas o resumo por safra sem a lista de leads
 *
 * ─── RESPONSE 200 ─────────────────────────────────────────────────────────────
 * {
 *   success: true,
 *   summary: [
 *     {
 *       cohort:        "03/2026",
 *       label:         "Safra Mar/26",
 *       total:         87,          // total leads nesta safra
 *       readyToSend:   63,          // leads sem campanha nos últimos cooldownDays
 *       contacted:     24,          // leads com campanha recente (em cooldown)
 *       converted:     9,           // leads convertidos (funnelStage=CONVERTIDO)
 *       pdvCount:      3,           // quantos PDVs geraram leads nesta safra
 *     }, ...
 *   ],
 *   data: [                         // lista de leads prontos para campanha
 *     {
 *       id, nomeCliente, telefone, cohort, safraLabel,
 *       funnelStage, iaStatus, lastContactedAt, lastCampaignId,
 *       daysSinceContact,           // null if never contacted
 *       pdv: { id, name, cidade, uf },
 *       promotor: { id, nome }
 *     }, ...
 *   ],
 *   pagination: { total, page, limit, pages }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import {
  PDV_SOURCE_TYPES,
} from '@/lib/services/pdv-leads.service'
import { safraLabel } from '@/lib/services/pdv-lead-router.service'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES   = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER'] as const
const DEFAULT_COOLDOWN = 15   // days
const DEFAULT_LIMIT    = 50
const MAX_LIMIT        = 200

function err(msg: string, status = 400, code = 'VALIDATION_ERROR') {
  return NextResponse.json({ success: false, error: { code, message: msg } }, { status })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000)
}

// ─── GET /api/admin/leads/queue ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getSession()
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')
  if (!(ALLOWED_ROLES as readonly string[]).includes(session.role)) {
    return err('Sem permissão para acessar a fila de campanhas.', 403, 'FORBIDDEN')
  }

  const sp = req.nextUrl.searchParams

  // ── Parse params ──────────────────────────────────────────────────────────
  const cohortFilter  = sp.get('cohort')    ?? undefined
  const pdvIdFilter   = sp.get('pdvId')     ?? undefined
  const funnelFilter  = sp.get('funnelStage') ?? undefined
  const leadTypeFilter = sp.get('leadType') ?? undefined
  const groupOnly     = sp.get('groupOnly') === 'true'
  const cooldownDays  = Math.max(0, Math.min(365,
    parseInt(sp.get('cooldownDays') ?? String(DEFAULT_COOLDOWN), 10) || DEFAULT_COOLDOWN
  ))
  const page  = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const limit = Math.min(MAX_LIMIT, Math.max(1,
    parseInt(sp.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT
  ))

  // Tenant scope
  const tenantId = session.role === 'ADMIN_MASTER'
    ? (sp.get('tenantId') ?? null)
    : (session.tenantId ?? null)

  // ── Base WHERE — all PDV-origin leads ─────────────────────────────────────
  const baseWhere: Record<string, unknown> = {
    sourceType: { in: [...PDV_SOURCE_TYPES] },
    pdvId:      { not: null },
  }
  if (tenantId)      baseWhere.tenantId    = tenantId
  if (cohortFilter)  baseWhere.cohort      = cohortFilter
  if (pdvIdFilter)   baseWhere.pdvId       = pdvIdFilter
  if (funnelFilter)  baseWhere.funnelStage = funnelFilter
  if (leadTypeFilter) baseWhere.leadType   = leadTypeFilter

  // ── WHERE for "ready to send" leads (cold = not recently contacted) ───────
  //
  // A lead is "ready" when:
  //   a) lastContactedAt IS NULL  (never received a campaign), OR
  //   b) lastContactedAt < (now - cooldownDays)  (cooldown has expired)
  //
  const cooldownCutoff = daysAgo(cooldownDays)
  const readyWhere: Record<string, unknown> = {
    ...baseWhere,
    OR: [
      { lastContactedAt: null },
      { lastContactedAt: { lt: cooldownCutoff } },
    ],
    // Exclude already-converted or rejected leads from the send queue
    funnelStage: { notIn: ['CONVERTIDO', 'PERDIDO'] },
    status:      { not: 'AUDITADO_REJEITADO' },
  }

  try {
    // ── PART 1: Summary grouped by cohort ──────────────────────────────────
    //
    // Fetch all cohorts present in the data, with counts.
    // Uses groupBy on cohort field for efficient aggregation.
    //
    const [
      allCohortGroups,       // groupBy cohort — total per safra
      readyCohortGroups,     // groupBy cohort — ready (cold) per safra
      convertedGroups,       // groupBy cohort — converted per safra
    ] = await Promise.all([

      // All leads per cohort
      prisma.lead.groupBy({
        by:      ['cohort'],
        where:   baseWhere,
        _count:  { id: true },
        orderBy: { cohort: 'desc' },
      }),

      // Ready-to-send per cohort
      prisma.lead.groupBy({
        by:     ['cohort'],
        where:  readyWhere,
        _count: { id: true },
      }),

      // Converted per cohort
      prisma.lead.groupBy({
        by:     ['cohort'],
        where:  { ...baseWhere, funnelStage: 'CONVERTIDO' },
        _count: { id: true },
      }),
    ])

    // Fetch PDV count per cohort in one query (distinct pdvId per cohort)
    // We use findMany with groupBy workaround: get unique (cohort, pdvId) pairs
    const pdvPerCohortRaw = await prisma.lead.findMany({
      where:  { ...baseWhere, cohort: { not: null } },
      select: { cohort: true, pdvId: true },
      distinct: ['cohort', 'pdvId'],
    })

    // Build lookup maps
    const readyMap     = new Map(readyCohortGroups.map(r => [r.cohort ?? '', r._count.id]))
    const convertedMap = new Map(convertedGroups.map(r => [r.cohort ?? '', r._count.id]))
    const pdvCountMap  = new Map<string, number>()
    for (const row of pdvPerCohortRaw) {
      if (!row.cohort) continue
      pdvCountMap.set(row.cohort, (pdvCountMap.get(row.cohort) ?? 0) + 1)
    }

    // Assemble summary
    const summary = allCohortGroups
      .filter(r => r.cohort !== null)
      .map(r => {
        const cohort    = r.cohort as string
        const total     = r._count.id
        const ready     = readyMap.get(cohort) ?? 0
        const converted = convertedMap.get(cohort) ?? 0
        return {
          cohort,
          label:       safraLabel(cohort),
          total,
          readyToSend: ready,
          contacted:   total - ready - converted,
          converted,
          pdvCount:    pdvCountMap.get(cohort) ?? 0,
        }
      })
      .sort((a, b) => b.cohort.localeCompare(a.cohort))  // newest first

    // If groupOnly=true return only the summary (lighter response for filter UI)
    if (groupOnly) {
      return NextResponse.json({ success: true, summary })
    }

    // ── PART 2: Paginated list of ready-to-send leads ─────────────────────
    const skip = (page - 1) * limit

    const [totalReady, rawLeads] = await Promise.all([

      prisma.lead.count({ where: readyWhere }),

      prisma.lead.findMany({
        where:   readyWhere,
        skip,
        take:    limit,
        orderBy: [
          { cohort: 'desc' },      // newest safra first
          { createdAt: 'desc' },   // then by recency within safra
        ],
        select: {
          id:              true,
          nomeCliente:     true,
          telefone:        true,
          email:           true,
          veiculo:         true,
          placa:           true,
          leadType:        true,
          sourceType:      true,
          cohort:          true,
          funnelStage:     true,
          iaStatus:        true,
          status:          true,
          lastContactedAt: true,
          lastCampaignId:  true,
          createdAt:       true,
          // PDV origin
          pdv: {
            select: {
              id:       true,
              name:     true,
              cidade:   true,
              uf:       true,
              storeType: true,
            },
          },
          // Manager-promotor
          promotor: {
            select: { id: true, nome: true, email: true },
          },
        },
      }),
    ])

    // ── Shape leads ──────────────────────────────────────────────────────────
    const now = new Date()
    const data = rawLeads.map(l => ({
      id:               l.id,
      nomeCliente:      l.nomeCliente,
      telefone:         l.telefone,
      email:            l.email,
      veiculo:          l.veiculo,
      placa:            l.placa,
      leadType:         l.leadType,
      sourceType:       l.sourceType,
      cohort:           l.cohort ?? null,
      safraLabel:       l.cohort ? safraLabel(l.cohort) : null,
      funnelStage:      l.funnelStage,
      iaStatus:         l.iaStatus,
      status:           l.status,
      lastContactedAt:  l.lastContactedAt?.toISOString() ?? null,
      lastCampaignId:   l.lastCampaignId ?? null,
      // How many days since last campaign (null = never contacted)
      daysSinceContact: l.lastContactedAt
        ? daysBetween(l.lastContactedAt, now)
        : null,
      createdAt: l.createdAt.toISOString(),
      pdv: l.pdv
        ? { id: l.pdv.id, name: l.pdv.name, cidade: l.pdv.cidade, uf: l.pdv.uf, storeType: l.pdv.storeType }
        : null,
      promotor: l.promotor
        ? { id: l.promotor.id, nome: l.promotor.nome, email: l.promotor.email }
        : null,
    }))

    return NextResponse.json({
      success: true,
      cooldownDays,
      summary,
      data,
      pagination: {
        total: totalReady,
        page,
        limit,
        pages: Math.ceil(totalReady / limit),
      },
    })

  } catch (e) {
    console.error('[GET /api/admin/leads/queue]', e)
    return err('Erro interno ao buscar fila de campanhas.', 500, 'INTERNAL_ERROR')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/leads/queue
// ─────────────────────────────────────────────────────────────────────────────
// Marks a batch of leads as "contacted" after a campaign is dispatched.
// Called automatically by the campaign engine after mass send.
//
// Body: { leadIds: string[], campaignId: string }
//
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')
  if (!(ALLOWED_ROLES as readonly string[]).includes(session.role)) {
    return err('Sem permissão.', 403, 'FORBIDDEN')
  }

  try {
    const body = await req.json() as { leadIds?: string[]; campaignId?: string }
    const { leadIds, campaignId } = body

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return err('leadIds deve ser um array não-vazio.', 400, 'INVALID_PAYLOAD')
    }
    if (!campaignId || typeof campaignId !== 'string') {
      return err('campaignId é obrigatório.', 400, 'INVALID_PAYLOAD')
    }

    // Cap at 500 per batch to prevent timeout
    const ids = leadIds.slice(0, 500)

    // Update all leads atomically
    const result = await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        lastContactedAt: new Date(),
        lastCampaignId:  campaignId,
      },
    })

    return NextResponse.json({
      success:  true,
      updated:  result.count,
      message:  `${result.count} leads marcados como contatados.`,
    })

  } catch (e) {
    console.error('[PATCH /api/admin/leads/queue]', e)
    return err('Erro ao atualizar leads.', 500, 'INTERNAL_ERROR')
  }
}

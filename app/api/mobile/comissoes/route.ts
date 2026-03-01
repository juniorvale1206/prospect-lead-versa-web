/**
 * GET /api/mobile/comissoes
 * ─────────────────────────────────────────────────────────────────────────────
 * Retorna o extrato de comissões do promotor autenticado.
 *
 * Headers: Authorization: Bearer <mobile_jwt>
 *
 * Query params (opcionais):
 *   status=PENDING|PAID|ALL   (default: ALL)
 *   limit=50                  (max: 200)
 *   offset=0
 *
 * Retorno 200:
 * {
 *   success: true,
 *   saldo: {
 *     pendente:   12.50,  ← soma dos PENDING
 *     pago:       45.00,  ← soma dos PAID
 *     total:      57.50
 *   },
 *   entries: [ { id, eventType, amount, description, status, createdAt, lead: {...} } ]
 *   total_count: 10
 * }
 */

import { NextRequest }      from 'next/server'
import { prisma }           from '@/lib/prisma'
import { verifyMobileToken, mobileError, mobileOk } from '@/lib/mobile-auth'

export async function GET(req: NextRequest) {
  /* ── Auth ────────────────────────────────────────────────────────────────── */
  const payload = await verifyMobileToken(req)
  if (!payload) return mobileError('Não autenticado', 'UNAUTHORIZED', 401)

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status')?.toUpperCase() ?? 'ALL'
  const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50',  10), 200)
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0',   10), 0)

  const where: Record<string, unknown> = { promotorId: payload.sub }
  if (statusFilter === 'PENDING') where.status = 'PENDING'
  if (statusFilter === 'PAID')    where.status = 'PAID'

  /* ── Buscar entradas do ledger ───────────────────────────────────────────── */
  const [entries, totalCount, saldoPendente, saldoPago] = await Promise.all([
    prisma.commissionLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    limit,
      skip:    offset,
    }),
    prisma.commissionLedger.count({ where }),
    prisma.commissionLedger.aggregate({
      where: { promotorId: payload.sub, status: 'PENDING' },
      _sum: { amount: true },
    }),
    prisma.commissionLedger.aggregate({
      where: { promotorId: payload.sub, status: 'PAID' },
      _sum: { amount: true },
    }),
  ])

  /* ── Enriquecer com dados do lead ────────────────────────────────────────── */
  const leadIdsSet = new Set(entries.map(e => e.leadId))
  const leadIds    = Array.from(leadIdsSet)
  const leadsMap  = new Map<string, { nomeCliente: string; placa: string; leadType: string }>()

  if (leadIds.length > 0) {
    const leads = await prisma.lead.findMany({
      where:  { id: { in: leadIds } },
      select: { id: true, nomeCliente: true, placa: true, leadType: true },
    })
    leads.forEach(l => leadsMap.set(l.id, l))
  }

  const enriched = entries.map(e => ({
    id:          e.id,
    eventType:   e.eventType,
    amount:      e.amount,
    description: e.description,
    status:      e.status,
    createdAt:   e.createdAt,
    lead: leadsMap.get(e.leadId) ?? { nomeCliente: 'Lead removido', placa: '', leadType: '' },
  }))

  const pendente = saldoPendente._sum.amount ?? 0
  const pago     = saldoPago._sum.amount     ?? 0

  return mobileOk({
    saldo: {
      pendente,
      pago,
      total: pendente + pago,
    },
    entries:     enriched,
    total_count: totalCount,
    pagination: {
      limit,
      offset,
      has_more: offset + entries.length < totalCount,
    },
  })
}

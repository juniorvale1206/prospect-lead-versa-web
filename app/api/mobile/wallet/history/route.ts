/**
 * GET /api/mobile/wallet/history
 * ─────────────────────────────────────────────────────────────────────────────
 * Histórico completo de saques do usuário autenticado.
 *
 * Query params:
 *   status=PENDING|APPROVED|REJECTED|CANCELLED|ALL   (default: ALL)
 *   page=1   limit=20
 *
 * Retorno 200:
 * {
 *   success: true,
 *   withdrawals: [ { id, amount, pixKey, pixKeyType, status, reviewNote, requestedAt, processedAt } ],
 *   pagination:  { total, page, limit, pages },
 *   stats: {
 *     totalRequested: 5,
 *     totalApproved:  3,
 *     totalRejected:  1,
 *     totalPending:   1,
 *     amountApproved: 450.00,
 *     amountPending:  100.00
 *   }
 * }
 */

import { NextRequest }                    from 'next/server'
import { verifyMobileToken, mobileError } from '@/lib/mobile-auth'
import { prisma }                         from '@/lib/prisma'
import { getOrCreateWallet }              from '@/lib/services/wallet.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const payload = await verifyMobileToken(req)
  if (!payload) return mobileError('Token inválido ou expirado.', 'UNAUTHORIZED', 401)

  const sp     = req.nextUrl.searchParams
  const status = sp.get('status')?.toUpperCase() ?? 'ALL'
  const page   = Math.max(1, parseInt(sp.get('page')  ?? '1',  10))
  const limit  = Math.min(50, Math.max(1, parseInt(sp.get('limit') ?? '20', 10)))
  const skip   = (page - 1) * limit

  const wallet = await getOrCreateWallet(payload.sub, payload.tenantId)

  const where: Record<string, unknown> = { walletId: wallet.id }
  if (status !== 'ALL') where.status = status

  const [withdrawals, total, stats] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id:          true,
        amount:      true,
        pixKey:      true,
        pixKeyType:  true,
        status:      true,
        reviewNote:  true,
        requestedAt: true,
        processedAt: true,
        createdAt:   true,
      },
    }),
    prisma.withdrawalRequest.count({ where }),
    // Estatísticas agregadas (sem filtro de status)
    prisma.withdrawalRequest.groupBy({
      by:    ['status'],
      where: { walletId: wallet.id },
      _count: { id: true },
      _sum:   { amount: true },
    }),
  ])

  // Montar stats
  const statMap: Record<string, { count: number; amount: number }> = {}
  for (const s of stats) {
    statMap[s.status] = {
      count:  s._count.id,
      amount: s._sum.amount ?? 0,
    }
  }

  return Response.json({
    success: true,
    withdrawals,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
    stats: {
      totalRequested: Object.values(statMap).reduce((a, s) => a + s.count, 0),
      totalApproved:  statMap['APPROVED']?.count  ?? 0,
      totalRejected:  statMap['REJECTED']?.count  ?? 0,
      totalPending:   statMap['PENDING']?.count   ?? 0,
      totalCancelled: statMap['CANCELLED']?.count ?? 0,
      amountApproved: statMap['APPROVED']?.amount ?? 0,
      amountPending:  statMap['PENDING']?.amount  ?? 0,
    },
  })
}

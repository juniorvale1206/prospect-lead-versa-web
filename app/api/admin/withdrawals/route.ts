/**
 * /api/admin/withdrawals — Gestão de Saques (Painel Financeiro)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GET  /api/admin/withdrawals             → lista saques com filtros
 * PATCH /api/admin/withdrawals/:id        → aprovar ou rejeitar um saque
 *
 * Autorização: cookie de sessão web — roles: FINANCIAL | ADMIN_MASTER
 *
 * ─── PATCH body ───────────────────────────────────────────────────────────────
 * {
 *   "action":     "APPROVED" | "REJECTED",
 *   "reviewNote": "Pago via Pix em 07/03/2026"   // opcional
 * }
 *
 * ─── Efeitos do PATCH ─────────────────────────────────────────────────────────
 *  APPROVED:
 *    • WithdrawalRequest.status → APPROVED
 *    • Wallet.lockedBalance    -= amount
 *    • WalletTransaction(DEBIT, WITHDRAWAL_PAID)
 *
 *  REJECTED:
 *    • WithdrawalRequest.status → REJECTED
 *    • Wallet.lockedBalance    -= amount
 *    • Wallet.availableBalance += amount  (estorno)
 *    • WalletTransaction(CREDIT, WITHDRAWAL_REVERSED)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import { processWithdrawal, WalletServiceError } from '@/lib/services/wallet.service'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['FINANCIAL', 'ADMIN_MASTER'] as const

function err(message: string, status = 400, code = 'VALIDATION_ERROR') {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

async function getSession(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── GET /api/admin/withdrawals ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')
  if (!ALLOWED_ROLES.includes(session.role as typeof ALLOWED_ROLES[number])) {
    return err('Sem permissão para acessar saques.', 403, 'FORBIDDEN')
  }

  const sp     = req.nextUrl.searchParams
  const status = sp.get('status') ?? 'PENDING'
  const page   = Math.max(1, parseInt(sp.get('page')  ?? '1',  10))
  const limit  = Math.min(100, parseInt(sp.get('limit') ?? '20', 10))
  const skip   = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (status !== 'ALL') where.status = status
  if (session.role !== 'ADMIN_MASTER' && session.tenantId) {
    where.tenantId = session.tenantId
  }

  const [withdrawals, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      skip,
      take: limit,
      include: {
        wallet: {
          select: {
            userId:           true,
            availableBalance: true,
            lockedBalance:    true,
            user: {
              select: {
                id:       true,
                nome:     true,
                email:    true,
                telefone: true,
                role:     true,
                pixKey:   true,
                pixKeyType: true,
              },
            },
          },
        },
      },
    }),
    prisma.withdrawalRequest.count({ where }),
  ])

  // Montar payload limpo
  const data = withdrawals.map((w) => ({
    id:          w.id,
    amount:      w.amount,
    pixKey:      w.pixKey,
    pixKeyType:  w.pixKeyType,
    status:      w.status,
    reviewNote:  w.reviewNote,
    requestedAt: w.requestedAt,
    processedAt: w.processedAt,
    tenantId:    w.tenantId,
    user: w.wallet?.user ?? null,
    walletBalances: {
      available: w.wallet?.availableBalance ?? 0,
      locked:    w.wallet?.lockedBalance ?? 0,
    },
  }))

  // Stats dos saques pendentes (total em espera)
  const pendingStats = await prisma.withdrawalRequest.aggregate({
    where: { ...where, status: 'PENDING' },
    _sum:  { amount: true },
    _count:{ id: true },
  })

  return NextResponse.json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
    pendingSummary: {
      count:       pendingStats._count.id,
      totalAmount: pendingStats._sum.amount ?? 0,
    },
  })
}

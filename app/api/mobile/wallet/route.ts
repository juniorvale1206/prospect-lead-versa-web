/**
 * GET /api/mobile/wallet
 * ─────────────────────────────────────────────────────────────────────────────
 * Resumo completo da Carteira do promotor/frentista autenticado.
 *
 * Headers:
 *   Authorization: Bearer <mobile_token>
 *
 * Query params (opcionais):
 *   page=1        → página do extrato (default: 1)
 *   limit=20      → itens por página (max: 100, default: 20)
 *
 * Retorno 200:
 * {
 *   success: true,
 *   wallet: {
 *     id:               "cmmxxx",
 *     availableBalance: 350.00,    ← disponível para saque imediato
 *     lockedBalance:    100.00,    ← em saques solicitados (aguardando)
 *     version:          7,
 *     createdAt:        "ISO",
 *     updatedAt:        "ISO"
 *   },
 *   summary: {
 *     pendingCommissions: 80.00,   ← comissões ainda não liquidadas (CommissionLedger PENDING)
 *     totalEarned:        530.00,  ← soma histórica de todos os créditos
 *     totalWithdrawn:     80.00,   ← soma dos saques aprovados
 *   },
 *   transactions: [                ← extrato paginado
 *     {
 *       id:           "cmm...",
 *       type:         "CREDIT",     ← CREDIT | DEBIT
 *       source:       "COMMISSION_PAID",
 *       amount:       50.00,
 *       balanceAfter: 350.00,
 *       description:  "Comissão: Venda Rastreador - Placa ABC1234",
 *       createdAt:    "ISO"
 *     }
 *   ],
 *   pagination: { total: 15, page: 1, limit: 20, pages: 1 },
 *   withdrawals: {
 *     pending: [
 *       { id, amount, pixKey, pixKeyType, status, requestedAt }
 *     ],
 *     totalPendingAmount: 100.00
 *   }
 * }
 *
 * Erros:
 *   401  UNAUTHORIZED — token inválido ou expirado
 */

import { NextRequest } from 'next/server'
import { verifyMobileToken, mobileError } from '@/lib/mobile-auth'
import { getWalletSummary }               from '@/lib/services/wallet.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  /* ── Autenticação ──────────────────────────────────────────────────────── */
  const payload = await verifyMobileToken(req)
  if (!payload) {
    return mobileError('Token inválido ou expirado.', 'UNAUTHORIZED', 401)
  }

  /* ── Paginação ─────────────────────────────────────────────────────────── */
  const sp    = req.nextUrl.searchParams
  const page  = Math.max(1, parseInt(sp.get('page')  ?? '1',  10))
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20', 10)))

  /* ── Busca do resumo ───────────────────────────────────────────────────── */
  const summary = await getWalletSummary(
    payload.sub,
    payload.tenantId,
    page,
    limit,
  )

  /* ── Resposta ──────────────────────────────────────────────────────────── */
  return Response.json({
    success: true,
    wallet: summary.wallet,
    summary: {
      pendingCommissions: summary.pendingCommissions,
      totalEarned:        summary.totalEarned,
      totalWithdrawn:     summary.totalWithdrawn,
    },
    transactions: summary.transactions,
    pagination:   summary.pagination,
    withdrawals:  summary.withdrawals,
  })
}

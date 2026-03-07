/**
 * POST /api/mobile/wallet/cancel
 * ─────────────────────────────────────────────────────────────────────────────
 * Cancelar um pedido de saque PENDING (antes do processamento pelo financeiro).
 *
 * Headers:
 *   Authorization: Bearer <mobile_token>
 *
 * Body (JSON):
 *   { "withdrawalId": "cmmxxx" }
 *
 * Retorno 200:
 *   { success: true, message: "Saque cancelado. Valor de R$ X estornado." }
 *
 * Erros:
 *   400  VALIDATION_ERROR   — withdrawalId ausente
 *   401  UNAUTHORIZED       — token inválido
 *   404  REQUEST_NOT_FOUND  — saque não existe ou pertence a outro usuário
 *   409  REQUEST_NOT_PENDING — saque já foi processado
 */

import { NextRequest }                    from 'next/server'
import { verifyMobileToken, mobileError } from '@/lib/mobile-auth'
import { cancelWithdrawal, WalletServiceError } from '@/lib/services/wallet.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const payload = await verifyMobileToken(req)
  if (!payload) return mobileError('Token inválido ou expirado.', 'UNAUTHORIZED', 401)

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return mobileError('Body JSON inválido.', 'INVALID_BODY', 400) }

  const { withdrawalId } = body
  if (!withdrawalId || typeof withdrawalId !== 'string') {
    return mobileError('O campo "withdrawalId" é obrigatório.', 'VALIDATION_ERROR', 400)
  }

  try {
    await cancelWithdrawal(payload.sub, withdrawalId)
    return Response.json({
      success: true,
      message: 'Pedido de saque cancelado. O valor foi estornado para o seu saldo disponível.',
    })
  } catch (err) {
    if (err instanceof WalletServiceError) {
      return mobileError(err.message, err.code, err.httpStatus)
    }
    console.error('[POST /api/mobile/wallet/cancel]', err)
    return mobileError('Erro interno ao cancelar o saque.', 'INTERNAL_ERROR', 500)
  }
}

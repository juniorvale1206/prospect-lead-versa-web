/**
 * POST /api/mobile/wallet/withdraw
 * ─────────────────────────────────────────────────────────────────────────────
 * Solicitar saque do saldo disponível via Pix.
 *
 * Headers:
 *   Authorization: Bearer <mobile_token>
 *
 * Body (JSON):
 *   {
 *     "amount":     150.00,        // obrigatório — valor em R$ (mín R$10, máx R$5000)
 *     "pixKey":     "11999990001", // obrigatório — chave Pix do usuário
 *     "pixKeyType": "TELEFONE"     // opcional    — CPF|EMAIL|TELEFONE|CNPJ|ALEATORIA
 *   }
 *
 * Retorno 201:
 * {
 *   success: true,
 *   message: "Saque de R$ 150,00 solicitado com sucesso! ...",
 *   withdrawal: {
 *     id:          "cmmxxx",
 *     amount:      150.00,
 *     pixKey:      "11999990001",
 *     pixKeyType:  "TELEFONE",
 *     status:      "PENDING",
 *     requestedAt: "ISO"
 *   },
 *   wallet: {
 *     newAvailableBalance: 200.00,
 *     newLockedBalance:    150.00
 *   },
 *   transaction: {
 *     id:          "cmmyyy",
 *     type:        "DEBIT",
 *     amount:      150.00,
 *     balanceAfter:200.00,
 *     description: "Saque Pix solicitado — chave: 11999990001",
 *     createdAt:   "ISO"
 *   }
 * }
 *
 * Erros:
 *   400  AMOUNT_TOO_LOW          — valor abaixo de R$ 10,00
 *   400  AMOUNT_TOO_HIGH         — valor acima de R$ 5.000,00
 *   400  INSUFFICIENT_BALANCE    — saldo disponível menor que o valor solicitado
 *   400  INVALID_PIX_KEY         — chave Pix inválida
 *   400  INVALID_BODY            — body JSON inválido
 *   401  UNAUTHORIZED            — token inválido ou expirado
 *   409  CONCURRENT_UPDATE       — conflito de concorrência (retentar em instantes)
 *   409  TOO_MANY_PENDING        — muitos saques pendentes simultâneos
 *   500  INTERNAL_ERROR          — erro inesperado
 */

import { NextRequest }                      from 'next/server'
import { verifyMobileToken, mobileError }   from '@/lib/mobile-auth'
import {
  requestWithdrawal,
  WalletServiceError,
  MIN_WITHDRAWAL,
  MAX_WITHDRAWAL,
} from '@/lib/services/wallet.service'

export const dynamic = 'force-dynamic'

// Tipos de chave Pix válidos
const VALID_PIX_KEY_TYPES = ['CPF', 'EMAIL', 'TELEFONE', 'CNPJ', 'ALEATORIA'] as const

export async function POST(req: NextRequest) {
  /* ── Autenticação ──────────────────────────────────────────────────────── */
  const payload = await verifyMobileToken(req)
  if (!payload) {
    return mobileError('Token inválido ou expirado.', 'UNAUTHORIZED', 401)
  }

  /* ── Parse do body ─────────────────────────────────────────────────────── */
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return mobileError('Body JSON inválido.', 'INVALID_BODY', 400)
  }

  /* ── Validações de entrada ─────────────────────────────────────────────── */
  const { amount, pixKey, pixKeyType } = body

  if (amount === undefined || amount === null) {
    return mobileError(
      'O campo "amount" é obrigatório.',
      'VALIDATION_ERROR', 400,
    )
  }
  const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return mobileError(
      'O campo "amount" deve ser um número positivo.',
      'VALIDATION_ERROR', 400,
    )
  }

  if (!pixKey || typeof pixKey !== 'string' || pixKey.trim().length < 3) {
    return mobileError(
      'O campo "pixKey" é obrigatório e deve ter pelo menos 3 caracteres.',
      'VALIDATION_ERROR', 400,
    )
  }

  const resolvedPixKeyType: string =
    pixKeyType && VALID_PIX_KEY_TYPES.includes(pixKeyType as typeof VALID_PIX_KEY_TYPES[number])
      ? (pixKeyType as string)
      : 'CPF'

  /* ── Verificação da chave Pix cadastrada no perfil ─────────────────────── */
  // Opcional: se o usuário tem pixKey cadastrado no perfil, sugerimos usar.
  // Aqui apenas verificamos que a chave informada não está vazia.
  // Para validação de formato (CPF, email, etc.) adicionar regex aqui.

  /* ── Solicitar saque via WalletService ─────────────────────────────────── */
  try {
    const result = await requestWithdrawal(
      payload.sub,
      payload.tenantId,
      parsedAmount,
      pixKey.trim(),
      resolvedPixKeyType,
    )

    const fmtBRL = (v: number) =>
      v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    return Response.json(
      {
        success: true,
        message:
          `Saque de ${fmtBRL(result.withdrawalRequest.amount)} solicitado com sucesso! ` +
          `Aguardando processamento pelo setor financeiro. ` +
          `Prazo estimado: 1–2 dias úteis.`,
        withdrawal:  result.withdrawalRequest,
        wallet: {
          newAvailableBalance: result.newAvailableBalance,
          newLockedBalance:    result.newLockedBalance,
        },
        transaction: result.transaction,
      },
      { status: 201 },
    )

  } catch (err) {
    if (err instanceof WalletServiceError) {
      return mobileError(err.message, err.code, err.httpStatus)
    }
    console.error('[POST /api/mobile/wallet/withdraw]', err)
    return mobileError('Erro interno ao processar o saque.', 'INTERNAL_ERROR', 500)
  }
}

/**
 * PATCH /api/admin/withdrawals/[id]
 * ─────────────────────────────────────────────────────────────────────────────
 * Aprovar ou rejeitar um pedido de saque (painel financeiro).
 *
 * Body:
 *   {
 *     "action":     "APPROVED" | "REJECTED",
 *     "reviewNote": "Transferido via Pix às 14h"   // opcional
 *   }
 *
 * Retorno 200:
 *   {
 *     success: true,
 *     message: "Saque aprovado. R$ 150,00 debitados da conta bloqueada.",
 *     withdrawal: { id, status, amount }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken }               from '@/lib/auth'
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')
  if (!ALLOWED_ROLES.includes(session.role as typeof ALLOWED_ROLES[number])) {
    return err('Sem permissão para processar saques.', 403, 'FORBIDDEN')
  }

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return err('Body JSON inválido.', 400, 'INVALID_BODY') }

  const { action, reviewNote } = body

  if (!action || !['APPROVED', 'REJECTED'].includes(action as string)) {
    return err('"action" deve ser "APPROVED" ou "REJECTED".', 400, 'VALIDATION_ERROR')
  }

  try {
    const result = await processWithdrawal(
      params.id,
      action as 'APPROVED' | 'REJECTED',
      (reviewNote as string | undefined) ?? null,
      session.userId ?? null,
    )

    const fmtBRL = (v: number) =>
      v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    const message = action === 'APPROVED'
      ? `Saque aprovado. ${fmtBRL(result.withdrawal.amount)} transferido para o usuário.`
      : `Saque rejeitado. ${fmtBRL(result.withdrawal.amount)} estornado para o saldo disponível.`

    return NextResponse.json({ success: true, message, withdrawal: result.withdrawal })

  } catch (err2) {
    if (err2 instanceof WalletServiceError) {
      return err(err2.message, err2.httpStatus, err2.code)
    }
    console.error(`[PATCH /api/admin/withdrawals/${params.id}]`, err2)
    return err('Erro interno.', 500, 'INTERNAL_ERROR')
  }
}

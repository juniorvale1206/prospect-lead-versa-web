/**
 * PATCH /api/admin/promotores/kyc
 * ─────────────────────────────────────────────────────────────────────────────
 * Permite ao FINANCIAL ou ADMIN_MASTER atualizar o status KYC de um promotor.
 *
 * Body JSON: { userId, kycStatus: 'VERIFIED' | 'REJECTED', kycNote? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

function err(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return err('Não autenticado', 401)
  if (!['ADMIN_MASTER', 'FINANCIAL'].includes(session.role)) {
    return err('Permissão insuficiente', 403)
  }

  try {
    const { userId, kycStatus, kycNote } = await req.json()
    if (!userId)    return err('userId é obrigatório')
    if (!kycStatus) return err('kycStatus é obrigatório')
    if (!['VERIFIED', 'REJECTED', 'PENDING_REVIEW'].includes(kycStatus)) {
      return err('kycStatus inválido. Use: VERIFIED, REJECTED ou PENDING_REVIEW')
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus,
        kycNote:      kycNote ?? null,
        kycReviewedAt: new Date(),
      },
      select: { id: true, nome: true, kycStatus: true, kycNote: true },
    })

    return NextResponse.json({ success: true, user: updated })
  } catch (e) {
    console.error('[kyc patch]', e)
    return err('Erro interno', 500)
  }
}

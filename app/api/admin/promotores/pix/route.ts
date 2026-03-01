/**
 * PATCH /api/admin/promotores/pix
 * ─────────────────────────────────────────────────────────────────────────────
 * Permite ao FINANCIAL ou ADMIN_MASTER atualizar dados Pix de um promotor
 * e marcar a chave como verificada.
 *
 * Body JSON: {
 *   userId:      string          (obrigatório)
 *   pixKeyType?: 'CPF' | 'EMAIL' | 'TELEFONE' | 'CNPJ' | 'ALEATORIA'
 *   pixKey?:     string
 *   pixVerified?: boolean
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

const VALID_PIX_TYPES = ['CPF', 'EMAIL', 'TELEFONE', 'CNPJ', 'ALEATORIA'] as const

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
    const body = await req.json()
    const { userId, pixKeyType, pixKey, pixVerified } = body

    if (!userId) return err('userId é obrigatório')

    // Validate pixKeyType if provided
    if (pixKeyType && !VALID_PIX_TYPES.includes(pixKeyType)) {
      return err(`Tipo de chave inválido. Use: ${VALID_PIX_TYPES.join(', ')}`)
    }

    // Tenant guard: MANAGERs can only update promoters in their tenant
    if (session.role === 'MANAGER') {
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { tenantId: true },
      })
      if (!target) return err('Promotor não encontrado', 404)
      if (target.tenantId !== session.tenantId) {
        return err('Permissão insuficiente — promotor de outro tenant', 403)
      }
    }

    // Build update payload
    const updateData: {
      pixKeyType?: string | null
      pixKey?: string | null
      pixVerified?: boolean
    } = {}

    if (pixKeyType !== undefined) updateData.pixKeyType = pixKeyType ?? null
    if (pixKey     !== undefined) updateData.pixKey     = pixKey?.trim() || null
    if (pixVerified !== undefined) updateData.pixVerified = Boolean(pixVerified)

    const updated = await prisma.user.update({
      where: { id: userId },
      data:  updateData,
      select: {
        id: true, nome: true,
        pixKeyType: true, pixKey: true, pixVerified: true,
      },
    })

    return NextResponse.json({ success: true, user: updated })
  } catch (e) {
    console.error('[admin/pix patch]', e)
    return err('Erro interno', 500)
  }
}

/* ── GET: retorna dados Pix de um promotor ─────────────────────────────────── */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return err('Não autenticado', 401)
  if (!['ADMIN_MASTER', 'FINANCIAL', 'MANAGER'].includes(session.role)) {
    return err('Permissão insuficiente', 403)
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) return err('userId é obrigatório')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, nome: true, email: true, telefone: true, cpf: true,
      pixKeyType: true, pixKey: true, pixVerified: true,
      cpfPhotoUrl: true, kycStatus: true, kycNote: true, kycReviewedAt: true,
      tenantId: true,
    },
  })

  if (!user) return err('Promotor não encontrado', 404)

  // Tenant guard for MANAGER
  if (session.role === 'MANAGER' && user.tenantId !== session.tenantId) {
    return err('Permissão insuficiente', 403)
  }

  return NextResponse.json({ success: true, user })
}

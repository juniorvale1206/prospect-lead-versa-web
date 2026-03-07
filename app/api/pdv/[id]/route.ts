/**
 * /api/pdv/[id] — Operações por PDV
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GET    /api/pdv/[id]  → detalhes do PDV + comissões de rede geradas
 * PATCH  /api/pdv/[id]  → atualiza PDV (nome, gerente, taxa, status)
 * DELETE /api/pdv/[id]  → desativa PDV (soft delete, status=INACTIVE)
 */

import { NextRequest, NextResponse }  from 'next/server'
import { verifyToken }                from '@/lib/auth'
import { prisma }                     from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function err(message: string, status = 400, code = 'VALIDATION_ERROR') {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

async function getSession(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── GET /api/pdv/[id] ────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  const store = await prisma.partnerStore.findUnique({
    where: { id: params.id },
    include: {
      managerPromoter: {
        select: { id: true, nome: true, email: true, telefone: true },
      },
      leads: {
        orderBy: { createdAt: 'desc' },
        take:    10,
        select: {
          id: true, nomeCliente: true, funnelStage: true,
          status: true, createdAt: true,
        },
      },
      commissionLedgerEntries: {
        where:   { commissionType: 'PDV_NETWORK_SALE' },
        orderBy: { createdAt: 'desc' },
        take:    10,
        select: {
          id:            true,
          promotorId:    true,
          amount:        true,
          description:   true,
          status:        true,
          createdAt:     true,
        },
      },
    },
  })

  if (!store) return err('PDV não encontrado.', 404, 'NOT_FOUND')

  // Verificar acesso por tenant
  if (
    session.role !== 'ADMIN_MASTER' &&
    session.tenantId &&
    store.tenantId !== session.tenantId
  ) {
    return err('PDV não pertence ao seu tenant.', 403, 'FORBIDDEN')
  }

  return NextResponse.json({ success: true, data: store })
}

// ─── PATCH /api/pdv/[id] ──────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  const ALLOWED = ['ADMIN_MASTER', 'MANAGER']
  if (!ALLOWED.includes(session.role)) {
    return err('Sem permissão para editar PDVs.', 403, 'FORBIDDEN')
  }

  const store = await prisma.partnerStore.findUnique({
    where: { id: params.id },
    select: { id: true, tenantId: true },
  })
  if (!store) return err('PDV não encontrado.', 404, 'NOT_FOUND')

  if (
    session.role !== 'ADMIN_MASTER' &&
    session.tenantId &&
    store.tenantId !== session.tenantId
  ) {
    return err('Sem acesso a este PDV.', 403, 'FORBIDDEN')
  }

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return err('Body inválido.', 400, 'INVALID_BODY') }

  const {
    name, cnpj, address, cidade, uf,
    ownerName, ownerPhone, storeType, status,
    managerPromoterId, customNetworkCommissionPct,
  } = body

  // Validar novo gerente se informado
  if (managerPromoterId && typeof managerPromoterId === 'string') {
    const manager = await prisma.user.findFirst({
      where: { id: managerPromoterId, role: 'PROMOTER' },
      select: { id: true },
    })
    if (!manager) {
      return err('managerPromoterId não encontrado ou não é um PROMOTER.', 404, 'NOT_FOUND')
    }
  }

  const updated = await prisma.partnerStore.update({
    where: { id: params.id },
    data: {
      ...(name      ? { name:      (name as string).trim() }    : {}),
      ...(cnpj      !== undefined ? { cnpj: cnpj as string | null }       : {}),
      ...(address   !== undefined ? { address: address as string | null } : {}),
      ...(cidade    !== undefined ? { cidade: cidade as string | null }   : {}),
      ...(uf        !== undefined ? { uf: (uf as string)?.toUpperCase() ?? null } : {}),
      ...(ownerName !== undefined ? { ownerName: ownerName as string | null }     : {}),
      ...(ownerPhone !== undefined ? { ownerPhone: ownerPhone as string | null }  : {}),
      ...(storeType ? { storeType: storeType as string } : {}),
      ...(status    ? { status:    status as string }    : {}),
      ...(managerPromoterId !== undefined ? {
        managerPromoterId: managerPromoterId as string | null,
      } : {}),
      ...(customNetworkCommissionPct !== undefined ? {
        customNetworkCommissionPct: customNetworkCommissionPct as number | null,
      } : {}),
    },
    include: {
      managerPromoter: { select: { id: true, nome: true, email: true } },
    },
  })

  return NextResponse.json({ success: true, data: updated })
}

// ─── DELETE /api/pdv/[id] (soft delete) ───────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  if (session.role !== 'ADMIN_MASTER' && session.role !== 'MANAGER') {
    return err('Sem permissão para desativar PDVs.', 403, 'FORBIDDEN')
  }

  const store = await prisma.partnerStore.findUnique({
    where:  { id: params.id },
    select: { id: true, tenantId: true },
  })
  if (!store) return err('PDV não encontrado.', 404, 'NOT_FOUND')

  await prisma.partnerStore.update({
    where: { id: params.id },
    data:  { status: 'INACTIVE' },
  })

  return NextResponse.json({ success: true, message: 'PDV desativado.' })
}

/**
 * /api/campaigns/[id]
 * GET    — Detalhe da campanha + métricas + mensagens
 * PATCH  — Atualiza campanha (nome, template, agendamento)
 * DELETE — Remove campanha (somente se DRAFT)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const ALLOWED = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']

async function getSession(req: NextRequest) {
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) return null
  return verifyToken(cookieToken)
}

// ─── GET /api/campaigns/[id] ──────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(req)
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      tenant: { select: { id: true, nome: true, slug: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          phoneNumber: true,
          contactName: true,
          deliveryStatus: true,
          waMessageId: true,
          statusUpdatedAt: true,
          errorMessage: true,
          createdAt: true,
        },
      },
    },
  })

  if (!campaign) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
  }

  // Autorização por tenant
  if (session.role !== 'ADMIN_MASTER' && campaign.tenantId !== session.tenantId) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })
  }

  return NextResponse.json({ success: true, campaign })
}

// ─── PATCH /api/campaigns/[id] ────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(req)
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } })
  if (!campaign) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
  }

  if (session.role !== 'ADMIN_MASTER' && campaign.tenantId !== session.tenantId) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })
  }

  // Impede edição de campanhas ativas ou concluídas
  if (['RUNNING', 'COMPLETED'].includes(campaign.status)) {
    return NextResponse.json({
      success: false,
      error: { code: 'INVALID_STATE', message: 'Não é possível editar campanha em execução ou concluída.' },
    }, { status: 409 })
  }

  const body = await req.json()
  const {
    name, templateName, templateVars, templateLanguage,
    audienceFilters, scheduledAt, status,
  } = body

  const updated = await prisma.campaign.update({
    where: { id: params.id },
    data: {
      ...(name            && { name: name.trim() }),
      ...(templateName    && { templateName: templateName.trim() }),
      ...(templateVars    && { templateVars: typeof templateVars === 'object' ? JSON.stringify(templateVars) : templateVars }),
      ...(templateLanguage && { templateLanguage }),
      ...(audienceFilters && { audienceFilters: typeof audienceFilters === 'object' ? JSON.stringify(audienceFilters) : audienceFilters }),
      ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
      ...(status          && { status }),
    },
  })

  return NextResponse.json({ success: true, campaign: updated })
}

// ─── DELETE /api/campaigns/[id] ───────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(req)
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } })
  if (!campaign) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
  }

  if (session.role !== 'ADMIN_MASTER' && campaign.tenantId !== session.tenantId) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })
  }

  if (['RUNNING', 'SCHEDULED'].includes(campaign.status)) {
    return NextResponse.json({
      success: false,
      error: { code: 'INVALID_STATE', message: 'Pause a campanha antes de excluí-la.' },
    }, { status: 409 })
  }

  // Cascade delete de CampaignMessage pelo schema
  await prisma.campaign.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true, message: 'Campanha removida com sucesso.' })
}

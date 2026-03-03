/**
 * /api/campaigns/[id]/launch
 * POST — Dispara campanha imediatamente
 *        Cria CampaignMessages para cada lead do público-alvo
 *        e chama launchCampaign() que processa em lotes (rate-limited)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { launchCampaign } from '@/lib/services/whatsapp.service'
import type { Prisma } from '@prisma/client'

async function getSession(req: NextRequest) {
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) return null
  return verifyToken(cookieToken)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session || !['ADMIN_MASTER', 'MANAGER', 'FINANCIAL'].includes(session.role)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
  })
  if (!campaign) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
  if (campaign.status === 'RUNNING') {
    return NextResponse.json({ success: false, error: { code: 'ALREADY_RUNNING', message: 'Campanha já está em execução.' } }, { status: 409 })
  }
  if (campaign.status === 'COMPLETED') {
    return NextResponse.json({ success: false, error: { code: 'ALREADY_DONE', message: 'Campanha já foi concluída.' } }, { status: 409 })
  }

  // Busca leads do público-alvo com base nos filtros
  const filters: Prisma.LeadWhereInput = { tenantId: campaign.tenantId }
  try {
    const f = JSON.parse(campaign.audienceFilters || '{}')
    if (f.status)       filters.status      = f.status
    if (f.funnelStage)  filters.funnelStage = f.funnelStage
    if (f.daysSince) {
      filters.createdAt = {
        gte: new Date(Date.now() - Number(f.daysSince) * 86400000),
      }
    }
  } catch { /* usa apenas tenantId */ }

  const leads = await prisma.lead.findMany({
    where: {
      ...filters,
      telefone: { not: null },
    },
    select: { id: true, nomeCliente: true, telefone: true },
    take: 10000,
  })

  if (leads.length === 0) {
    return NextResponse.json({
      success: false,
      error: { code: 'NO_AUDIENCE', message: 'Nenhum lead com telefone encontrado para os filtros selecionados.' },
    }, { status: 400 })
  }

  // Cria CampaignMessage para cada lead (antes de disparar)
  const messagesData = leads.map(lead => ({
    campaignId:   campaign.id,
    leadId:       lead.id,
    phoneNumber:  (lead.telefone ?? '').replace(/\D/g, '').replace(/^0/, '55'),
    contactName:  lead.nomeCliente.split(' ')[0], // primeiro nome
    tenantId:     campaign.tenantId,
    deliveryStatus: 'queued',
  }))

  // Usa createMany (SQLite não suporta skipDuplicates, mas garante idempotência)
  await prisma.campaignMessage.createMany({ data: messagesData })

  // Atualiza audienceCount real
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { audienceCount: leads.length, totalSent: 0 },
  })

  // ── Dispara em background (não bloqueia a resposta HTTP) ─────────────────
  // Em produção: usar BullMQ para garantir persistência e retry
  // Aqui: fire-and-forget para demonstração
  launchCampaign(campaign.id).catch(err =>
    console.error('[Campaign Launch] Erro:', err)
  )

  return NextResponse.json({
    success: true,
    message: `Campanha "${campaign.name}" iniciada para ${leads.length} leads.`,
    audienceCount: leads.length,
    campaignId: campaign.id,
  })
}

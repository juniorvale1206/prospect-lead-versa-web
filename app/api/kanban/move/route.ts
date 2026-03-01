import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_STAGES = [
  'LEAD_COLETADO',
  'IA_EM_ATENDIMENTO',
  'REUNIAO_AGENDADA',
  'CONVERTIDO',
]

// ─── PATCH /api/kanban/move ──────────────────────────────────────────────────
// Body: { leadId: string, funnelStage: string }
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { role, tenantId: sessionTenantId } = session
  const allowed = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER']
  if (!allowed.includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { leadId, funnelStage } = await req.json()

  if (!leadId)                             return NextResponse.json({ error: 'leadId obrigatório' },    { status: 400 })
  if (!VALID_STAGES.includes(funnelStage)) return NextResponse.json({ error: 'Estágio inválido' },      { status: 400 })

  // Verificar se o lead pertence ao tenant do usuário (segurança)
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  if ((role === 'MANAGER' || role === 'FINANCIAL') && sessionTenantId) {
    if (lead.tenantId !== sessionTenantId) {
      return NextResponse.json({ error: 'Acesso negado a este lead' }, { status: 403 })
    }
  }

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data:  { funnelStage },
    include: {
      tenant:   { select: { id: true, nome: true } },
      promotor: { select: { id: true, nome: true } },
    },
  })

  return NextResponse.json({ lead: updated })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─── helpers ────────────────────────────────────────────────────────────────
function escapeCSV(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v).replace(/"/g, '""')
  return /[",\n\r]/.test(s) ? `"${s}"` : s
}

function row(cols: unknown[]): string {
  return cols.map(escapeCSV).join(',')
}

// ─── GET /api/export/leads ───────────────────────────────────────────────────
// Query params:
//   ?tenantId=xxx   → filtro por franquia (só ADMIN_MASTER pode usar; MANAGER ignora)
//   ?leadType=B2C|B2B|all   (default: all)
//   ?funnelStage=...        (default: all)
//   ?from=YYYY-MM-DD  &to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { role, tenantId: sessionTenantId } = session
  const allowed = ['ADMIN_MASTER', 'FINANCIAL', 'MANAGER']
  if (!allowed.includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const qTenant     = searchParams.get('tenantId')
  const qLeadType   = searchParams.get('leadType')   ?? 'all'
  const qStage      = searchParams.get('funnelStage') ?? 'all'
  const qFrom       = searchParams.get('from')
  const qTo         = searchParams.get('to')

  // ─── Filtro multi-tenant (REGRA DE OURO) ─────────────────────────────────
  // MANAGER sempre restrito ao seu próprio tenant
  // FINANCIAL  sempre restrito ao seu próprio tenant (ou global se sem tenant)
  // ADMIN_MASTER pode escolher via query param
  let tenantFilter: string | null | undefined

  if (role === 'MANAGER' || role === 'FINANCIAL') {
    tenantFilter = sessionTenantId ?? undefined
  } else {
    // ADMIN_MASTER — usa o query param se fornecido, senão busca tudo
    tenantFilter = qTenant ?? undefined
  }

  // ─── Montar where ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {}

  if (tenantFilter !== undefined) {
    where.tenantId = tenantFilter || null
  }
  if (qLeadType !== 'all') where.leadType    = qLeadType
  if (qStage    !== 'all') where.funnelStage = qStage

  if (qFrom || qTo) {
    where.createdAt = {}
    if (qFrom) where.createdAt.gte = new Date(qFrom)
    if (qTo)   where.createdAt.lte = new Date(qTo + 'T23:59:59.999Z')
  }

  // ─── Query ───────────────────────────────────────────────────────────────
  const leads = await prisma.lead.findMany({
    where,
    include: {
      tenant:   { select: { id: true, nome: true } },
      promotor: { select: { id: true, nome: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // ─── Montar CSV ──────────────────────────────────────────────────────────
  const HEADERS = [
    'ID do Lead',
    'Tipo (B2C/B2B)',
    'Estágio do Funil',
    'Nome do Cliente',
    'WhatsApp / Telefone',
    'E-mail',
    'Placa do Veículo',
    'Veículo / Modelo',
    'CNPJ',
    'Empresa / Frota',
    'Tamanho da Frota',
    'Segmento',
    'Dores Identificadas',
    'Praça / Localização',
    'Status Auditoria',
    'Valor Comissão (R$)',
    'Franquia (Tenant)',
    'ID Promotor',
    'Nome do Promotor',
    'E-mail Promotor',
    'Data de Criação',
    'Última Atualização',
  ]

  const FUNNEL_LABELS: Record<string, string> = {
    LEAD_COLETADO:     'Lead Coletado',
    IA_EM_ATENDIMENTO: 'IA em Atendimento',
    REUNIAO_AGENDADA:  'Reunião Agendada',
    CONVERTIDO:        'Convertido / Venda Fechada',
  }

  const STATUS_LABELS: Record<string, string> = {
    PENDENTE_AUDITORIA: 'Pendente',
    AUDITADO_APROVADO:  'Aprovado',
    AUDITADO_REJEITADO: 'Rejeitado',
  }

  const lines: string[] = [row(HEADERS)]

  for (const l of leads) {
    lines.push(row([
      l.id,
      l.leadType,
      FUNNEL_LABELS[l.funnelStage] ?? l.funnelStage,
      l.nomeCliente,
      l.telefone,
      l.email,
      l.placa,
      l.veiculo,
      l.cnpj,
      l.empresaNome,
      l.frota,
      l.segmento,
      l.doresIdentificadas,
      l.praca,
      STATUS_LABELS[l.status] ?? l.status,
      l.commissionValue.toFixed(2),
      l.tenant?.nome,
      l.promotor?.id,
      l.promotor?.nome,
      l.promotor?.email,
      new Date(l.createdAt).toLocaleString('pt-BR'),
      new Date(l.updatedAt).toLocaleString('pt-BR'),
    ]))
  }

  // BOM para Excel reconhecer UTF-8 corretamente
  const BOM  = '\uFEFF'
  const csv  = BOM + lines.join('\r\n')
  const date = new Date().toISOString().slice(0, 10)
  const filename = `prospeclead_leads_${date}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}

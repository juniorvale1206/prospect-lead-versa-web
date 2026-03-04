/**
 * /api/prospeccao/import
 * POST {
 *   leads:        ProspectImportPayload[]
 *   acionarIA?:   boolean  — se true, dispara IA Outbound para os leads importados
 *   criarTarefa?: boolean  — se true, cria tarefa de follow-up para cada lead importado
 *   tarefaConfig?: { title, dueHours, type, priority }
 * }
 *
 * Importa leads prospectados ao CRM.
 * Marca origem como "PROSPECCAO_ATIVA" e leadType = "B2B".
 * Verifica duplicatas por CNPJ dentro do mesmo tenant.
 *
 * GATILHO DE IA OUTBOUND:
 *   Quando acionarIA=true, itera sobre os leads importados com telefone válido
 *   e chama enqueueOutboundBatch() que:
 *     1. Seleciona o Agente IA do tenant
 *     2. Monta mensagem de saudação personalizada (nome + segmento + tom do agente)
 *     3. Envia via WhatsApp Cloud API (Bearer token do canal do tenant)
 *     4. Atualiza lead.funnelStage = 'PROSPECTADO_IA' e lead.iaStatus = 'CONTATADO'
 *
 *   Em produção: substituir fire-and-forget por BullMQ Worker (ver outbound-queue.service.ts)
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { enqueueOutboundBatch } from '@/lib/services/outbound-queue.service'
import type { ProspectImportPayload } from '@/lib/services/b2b-search.service'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']

export async function POST(req: NextRequest) {
  // ── Autenticação ────────────────────────────────────────────────────────────
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })
  const session = await verifyToken(cookieToken)
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  // ── Parse do body ────────────────────────────────────────────────────────────
  let body: {
    leads:        ProspectImportPayload[]
    acionarIA?:   boolean
    criarTarefa?: boolean
    tarefaConfig?: {
      title?:     string
      dueHours?:  number   // em quantas horas a tarefa vence (padrão: 24h)
      type?:      string   // CALL | EMAIL | WHATSAPP | MEETING
      priority?:  string   // LOW | MEDIUM | HIGH
    }
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ success: false, error: 'JSON inválido.' }, { status: 400 }) }

  const leadsToImport: ProspectImportPayload[] = Array.isArray(body.leads)
    ? body.leads : [body.leads].filter(Boolean)

  if (!leadsToImport.length) {
    return NextResponse.json({ success: false, error: 'Nenhum lead para importar.' }, { status: 400 })
  }

  const acionarIA   = body.acionarIA   ?? false
  const criarTarefa = body.criarTarefa ?? false
  const tarefaCfg   = body.tarefaConfig ?? {}

  // Tenant do usuário autenticado
  const tenantId = session.role === 'ADMIN_MASTER'
    ? (leadsToImport[0]?.tenantId ?? session.tenantId ?? '')
    : (session.tenantId ?? '')

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId não encontrado na sessão.' }, { status: 400 })
  }

  const imported:   string[] = []
  const duplicates: string[] = []
  const errors:     { lead: string; error: string }[] = []

  // ── Loop de importação ──────────────────────────────────────────────────────
  for (const lead of leadsToImport) {
    try {
      // Verifica duplicata por CNPJ (se informado)
      if (lead.cnpj) {
        const cnpjClean = lead.cnpj.replace(/\D/g, '')
        const existing  = await prisma.lead.findFirst({
          where: { cnpj: cnpjClean, tenantId },
        })
        if (existing) { duplicates.push(lead.cnpj); continue }
      }

      // Normaliza telefone para busca rápida
      const telefoneNorm = lead.telefone
        ? lead.telefone.replace(/\D/g, '').replace(/^55/, '').slice(-11)
        : null

      // Cria lead no CRM
      const created = await prisma.lead.create({
        data: {
          // Básico
          nomeCliente:   lead.nomeCliente?.trim() || lead.razaoSocial?.trim() || 'Empresa sem nome',
          telefone:      lead.telefone?.replace(/\D/g, '') ?? null,
          telefoneNorm,
          email:         lead.email?.toLowerCase() ?? null,
          leadType:      'B2B',

          // Empresarial
          cnpj:          lead.cnpj?.replace(/\D/g, '') ?? null,
          empresaNome:   lead.empresaNome ?? lead.razaoSocial ?? null,
          razaoSocial:   lead.razaoSocial ?? null,
          frota:         lead.frota ?? null,
          segmento:      lead.segmento ?? lead.cnaeDescricao ?? null,
          cnae:          lead.cnae ?? null,
          cnaeDescricao: lead.cnaeDescricao ?? null,
          porte:         lead.porte ?? null,

          // Endereço
          logradouro:    lead.logradouro ?? null,
          numero:        lead.numero ?? null,
          complemento:   lead.complemento ?? null,
          bairro:        lead.bairro ?? null,
          municipio:     lead.municipio ?? null,
          uf:            lead.uf ?? null,
          cep:           lead.cep?.replace(/\D/g, '') ?? null,

          // Prospecção
          sourceType:          'PROSPECCAO_ATIVA',
          googlePlaceId:       lead.googlePlaceId ?? null,
          situacaoCadastral:   lead.situacaoCadastral ?? null,
          qsa:                 lead.qsa ?? null,
          doresIdentificadas:  lead.doresIdentificadas ?? null,

          // Funil
          funnelStage: 'LEAD_COLETADO',
          status:      'PENDENTE_AUDITORIA',

          // Tenant
          tenantId,
          promotorId: lead.createdById ?? session.userId ?? null,
        },
      })

      imported.push(created.id)

      // ── Criar Tarefa de Follow-up automática ──────────────────────────────
      if (criarTarefa) {
        const dueHours = tarefaCfg.dueHours ?? 24
        const dueDate  = new Date(Date.now() + dueHours * 3600_000)
        const title    = tarefaCfg.title
          ?? `Ligar para ${created.empresaNome ?? created.nomeCliente}`

        await prisma.task.create({
          data: {
            id:       randomUUID(),
            title,
            description: `Lead importado via Radar B2B — ${created.cnae ?? ''} ${created.municipio ?? ''} ${created.uf ?? ''}`.trim(),
            dueDate,
            type:     tarefaCfg.type     ?? 'CALL',
            priority: tarefaCfg.priority ?? 'MEDIUM',
            status:   'PENDING',
            leadId:   created.id,
            userId:   session.userId,
            tenantId,
          },
        })
      }

    } catch (e) {
      console.error('[Import Lead] Erro:', e)
      errors.push({ lead: lead.nomeCliente ?? lead.cnpj ?? '?', error: (e as Error).message })
    }
  }

  // ── GATILHO DE IA OUTBOUND ──────────────────────────────────────────────────
  //
  // Quando acionarIA=true, dispara IA para todos os leads importados com telefone.
  // Processamento em background (não bloqueia a resposta HTTP).
  //
  // Fluxo:
  //   1. Filtra leads importados que possuem telefone válido
  //   2. Para cada lead: seleciona Agente IA ativo do tenant
  //   3. Monta mensagem de saudação personalizada (nome, empresa, CNAE, tom do agente)
  //   4. Envia via WhatsApp Cloud API (Bearer = canal.credentials do tenant)
  //   5. Atualiza lead.funnelStage = 'PROSPECTADO_IA' + iaStatus = 'CONTATADO'
  //
  // Em produção com BullMQ:
  //   await outboundQueue.addBulk(imported.map(id => ({ name: 'contact', data: { leadId: id, tenantId } })))
  //
  let outboundResult = null
  if (acionarIA && imported.length > 0) {
    // Fire-and-forget: não bloqueia a resposta
    enqueueOutboundBatch(imported, tenantId)
      .then(r => console.log(`[Import] Outbound IA: ${r.success}/${r.enqueued} enviados`))
      .catch(e => console.error('[Import] Outbound IA Error:', e))

    outboundResult = {
      triggered: true,
      leadsCount: imported.length,
      message: `IA Outbound acionada para ${imported.length} lead(s). Status atualizado para PROSPECTADO_IA após envio.`,
    }
  }

  return NextResponse.json({
    success:    true,
    imported:   imported.length,
    duplicates: duplicates.length,
    errors:     errors.length,
    outbound:   outboundResult,
    detail: {
      importedIds:    imported,
      duplicateCnpjs: duplicates,
      errors,
    },
    message: [
      `${imported.length} lead(s) importado(s)`,
      duplicates.length ? `${duplicates.length} duplicata(s) ignorada(s)` : '',
      acionarIA ? `IA Outbound acionada` : '',
      criarTarefa ? `${imported.length} tarefa(s) de follow-up criada(s)` : '',
    ].filter(Boolean).join(' · '),
  }, { status: 201 })
}

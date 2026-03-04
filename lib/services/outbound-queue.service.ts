/**
 * OutboundQueueService — Disparo IA Outbound para Leads B2B
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsável por:
 *   1. Receber lista de leadIds recém-importados
 *   2. Para cada lead com telefone válido: enfileirar job de contato inicial
 *   3. Worker processa: seleciona Agente IA do tenant → monta template de saudação
 *      → envia via WhatsApp Cloud API → atualiza status para PROSPECTADO_IA
 *
 * ARQUITETURA DE PRODUÇÃO (BullMQ + Redis):
 * ──────────────────────────────────────────────────────────────────────────────
 *   import { Queue, Worker, QueueEvents } from 'bullmq'
 *   import { Redis } from 'ioredis'
 *
 *   const redis    = new Redis(process.env.REDIS_URL!)
 *   const outQueue = new Queue('ia-outbound', { connection: redis })
 *
 *   // Worker que processa cada lead
 *   const worker = new Worker('ia-outbound', async (job) => {
 *     const { leadId, agentId, tenantId } = job.data
 *
 *     // 1. Busca dados do lead
 *     const lead = await prisma.lead.findUnique({ where: { id: leadId } })
 *
 *     // 2. Busca agente IA do tenant
 *     const agent = await prisma.agent.findUnique({ where: { id: agentId } })
 *
 *     // 3. Monta mensagem de saudação personalizada
 *     const msg = buildGreeting(agent, lead)
 *
 *     // 4. Envia via WhatsApp Cloud API
 *     await sendTextMessage(lead.telefone, msg, tenantId)
 *
 *     // 5. Atualiza status do lead
 *     await prisma.lead.update({
 *       where: { id: leadId },
 *       data: { funnelStage: 'PROSPECTADO_IA', iaStatus: 'CONTATADO' }
 *     })
 *   }, {
 *     connection: redis,
 *     concurrency: 10,            // 10 paralelo
 *     limiter: { max: 30, duration: 1000 }  // 30 msg/s (Meta tier 2)
 *   })
 *
 *   // Enqueue
 *   export async function enqueueOutbound(jobs: OutboundJob[]) {
 *     await outQueue.addBulk(jobs.map(j => ({
 *       name:    'contact',
 *       data:    j,
 *       opts:    { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
 *     })))
 *   }
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * IMPLEMENTAÇÃO ATUAL (sem Redis — fire-and-forget com Promise.allSettled):
 * Funciona para desenvolvimento e low-volume. Substituir pelo BullMQ em produção.
 */

import { prisma } from '@/lib/prisma'
import { sendTextMessage } from '@/lib/services/whatsapp.service'

export interface OutboundJob {
  leadId:   string
  agentId:  string
  tenantId: string
}

export interface OutboundResult {
  leadId:  string
  success: boolean
  message?: string
  error?:  string
}

// ─────────────────────────────────────────────────────────────────────────────
// buildGreeting — Monta mensagem de primeiro contato personalizada
// ─────────────────────────────────────────────────────────────────────────────
function buildGreeting(
  agentName:   string,
  agentTone:   string,
  leadName:    string,
  empresaNome: string | null,
  cnaeDesc:    string | null,
  tenantNome:  string
): string {
  const firstName = leadName.split(' ')[0]
  const empresa   = empresaNome ?? leadName
  const segmento  = cnaeDesc ?? 'do seu setor'

  // Tom formal
  if (agentTone === 'FORMAL') {
    return (
      `Olá, ${firstName}! Tudo bem?\n\n` +
      `Sou ${agentName}, assistente virtual da ${tenantNome}.\n\n` +
      `Identificamos que a ${empresa}, ${segmento}, pode se beneficiar das nossas soluções de ` +
      `telemetria e rastreamento veicular.\n\n` +
      `Podemos conversar 5 minutinhos sobre como reduzir custos e aumentar a segurança da sua frota? 🚛`
    )
  }

  // Tom casual (padrão)
  return (
    `Oi, ${firstName}! 👋\n\n` +
    `Aqui é o ${agentName} da ${tenantNome}.\n\n` +
    `Vi que a ${empresa} atua em ${segmento} — vocês já pensaram em rastreamento veicular com ` +
    `bloqueio de partida e sensor de fadiga?\n\n` +
    `Temos condições especiais para frotas. Posso te mandar uma proposta? 📲`
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// processOutboundJob — Processa UM job de contato inicial
// ─────────────────────────────────────────────────────────────────────────────
async function processOutboundJob(job: OutboundJob): Promise<OutboundResult> {
  const { leadId, agentId, tenantId } = job

  try {
    // 1. Busca dados completos do lead
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true, nomeCliente: true, empresaNome: true,
        telefone: true, telefoneNorm: true,
        cnaeDescricao: true, funnelStage: true,
        tenant: { select: { nome: true } },
      },
    })

    if (!lead) return { leadId, success: false, error: 'Lead não encontrado.' }
    if (!lead.telefone && !lead.telefoneNorm) {
      return { leadId, success: false, error: 'Lead sem telefone.' }
    }

    // 2. Busca agente IA
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, tenantId, isActive: true },
      select: { id: true, name: true, tone: true, systemPrompt: true },
    })

    if (!agent) {
      return { leadId, success: false, error: 'Agente IA não encontrado ou inativo.' }
    }

    // 3. Normaliza telefone para E.164 sem '+'
    const rawPhone  = (lead.telefoneNorm ?? lead.telefone ?? '').replace(/\D/g, '')
    const phoneE164 = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`

    if (phoneE164.length < 12) {
      return { leadId, success: false, error: `Telefone inválido: ${phoneE164}` }
    }

    // 4. Monta mensagem de saudação
    const message = buildGreeting(
      agent.name,
      agent.tone ?? 'CASUAL',
      lead.nomeCliente,
      lead.empresaNome,
      lead.cnaeDescricao,
      lead.tenant?.nome ?? 'ProspecLead'
    )

    // 5. Envia via WhatsApp Cloud API
    //    (sendTextMessage busca credenciais do canal do tenant automaticamente)
    const result = await sendTextMessage(phoneE164, message, tenantId)

    if (!result.success) {
      console.error(`[Outbound] Falha no envio para ${leadId}:`, result.error)
      return { leadId, success: false, error: result.error }
    }

    // 6. Atualiza status do lead → PROSPECTADO_IA
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        funnelStage:   'PROSPECTADO_IA',
        iaStatus:      'CONTATADO',
        iaRespondidoEm: null, // será preenchido pelo webhook quando responder
      },
    })

    console.log(`[Outbound] ✅ Lead ${leadId} contactado → wamid: ${result.waMessageId}`)
    return { leadId, success: true, message: `Enviado → wamid: ${result.waMessageId}` }

  } catch (err) {
    console.error(`[Outbound] Erro no job ${leadId}:`, err)
    return { leadId, success: false, error: (err as Error).message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// enqueueOutboundBatch — Enfileira e processa lote de leads para IA Outbound
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Processa leads em lotes de 10 com 1s de intervalo (rate limit Meta seguro).
 * Em produção: substituir pelo enqueueOutbound com BullMQ (ver comentário acima).
 *
 * @param leadIds   IDs dos leads recém-importados
 * @param tenantId  Tenant do usuário
 * @returns         Resumo do processamento
 */
export async function enqueueOutboundBatch(
  leadIds:  string[],
  tenantId: string
): Promise<{ enqueued: number; success: number; failed: number; results: OutboundResult[] }> {
  if (!leadIds.length) {
    return { enqueued: 0, success: 0, failed: 0, results: [] }
  }

  // Busca agente IA ativo do tenant (o mais antigo — padrão)
  const agent = await prisma.agent.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!agent) {
    console.warn(`[Outbound] Nenhum agente IA ativo para tenant ${tenantId}`)
    return {
      enqueued: 0, success: 0, failed: leadIds.length,
      results: leadIds.map(id => ({ leadId: id, success: false, error: 'Sem agente IA ativo' })),
    }
  }

  const jobs: OutboundJob[] = leadIds.map(id => ({
    leadId:  id,
    agentId: agent.id,
    tenantId,
  }))

  const allResults: OutboundResult[] = []
  const BATCH = 10

  // Processa em lotes de 10 com pausa de 1s entre lotes
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch   = jobs.slice(i, i + BATCH)
    const settled = await Promise.allSettled(batch.map(processOutboundJob))

    for (const r of settled) {
      if (r.status === 'fulfilled') allResults.push(r.value)
      else allResults.push({ leadId: '?', success: false, error: r.reason?.message })
    }

    // Rate-limit: pausa entre lotes
    if (i + BATCH < jobs.length) {
      await new Promise(res => setTimeout(res, 1000))
    }
  }

  return {
    enqueued: jobs.length,
    success:  allResults.filter(r => r.success).length,
    failed:   allResults.filter(r => !r.success).length,
    results:  allResults,
  }
}

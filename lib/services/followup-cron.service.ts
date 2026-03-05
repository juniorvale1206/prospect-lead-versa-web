/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Follow-up Cron Service — Reengajamento Automático de Leads Silenciosos
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Lógica:
 *   Varre o banco buscando conversas onde:
 *     - status IN ('WAITING', 'BOT_HANDLING') — conversa ativa (não resolvida)
 *     - lastOurMessageAt < NOW - 24h         — última mensagem NOSSA faz +24h
 *     - última mensagem da conversa é NOSSA  — não estamos aguardando resposta deles
 *     - followupCount < MAX_FOLLOWUPS        — limite de reenvios por conversa
 *
 *   Para cada conversa elegível:
 *     1. Busca o nome do contato e o canal
 *     2. Insere mensagem de reengajamento personalizada
 *     3. Incrementa followupCount
 *     4. Atualiza lastOurMessageAt
 *
 * Ativação:
 *   - Em dev/sandbox: chamar POST /api/cron/followup?secret=XXX
 *   - Em produção: Vercel Cron (vercel.json), GitHub Actions schedule, ou
 *     process.setInterval no servidor standalone (Node)
 *
 * Templates de reengajamento (varia por followupCount):
 *   - 1ª vez: Mensagem leve de check-in
 *   - 2ª vez: Oferta de valor / case de sucesso
 *   - 3ª vez: Última tentativa com CTA direto
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from '@/lib/prisma'

/* ─── Constantes ──────────────────────────────────────────────────────────── */
const SILENCE_THRESHOLD_HOURS = 24   // Horas de silêncio para acionar follow-up
const MAX_FOLLOWUPS            = 3   // Máximo de follow-ups por conversa
const BATCH_SIZE               = 50  // Conversas processadas por execução do cron

/* ─── Templates de Reengajamento ─────────────────────────────────────────── */
const FOLLOWUP_TEMPLATES = [
  // 1ª tentativa — tom leve e natural
  (name: string) =>
    `Oi ${name}! 😊 Aqui é da equipe de atendimento. Vi que você estava interessado em nossa solução de telemetria. Conseguiu pensar na nossa proposta? Qualquer dúvida, estou aqui pra ajudar!`,

  // 2ª tentativa — valor + case de sucesso
  (name: string) =>
    `${name}, tudo bem? 🚛 Queria compartilhar que um de nossos clientes no setor de mineração reduziu 18% os acidentes com nossa tecnologia DMS em apenas 3 meses. Gostaria de entender como podemos ajudar sua frota também. Posso agendar uma demonstração rápida?`,

  // 3ª tentativa — CTA direto e criação de urgência
  (name: string) =>
    `Olá ${name}! Esta é nossa última mensagem para não incomodar 😅. Se quiser conhecer nossa solução de rastreamento e segurança de frota, é só responder "QUERO" e agendaremos uma conversa de 15 min. Caso não tenha mais interesse, não precisa responder. Obrigado!`,
]

/* ─── Tipos internos ──────────────────────────────────────────────────────── */
interface EligibleConversation {
  id: string
  contactName: string
  contactId: string
  followupCount: number
  lastOurMessageAt: string | null
  channelId: string
  tenantId: string | null
  status: string
}

export interface FollowupCronResult {
  processed: number
  sent: number
  skipped: number
  errors: number
  details: Array<{
    convId: string
    contactName: string
    attempt: number
    status: 'sent' | 'skipped' | 'error'
    reason?: string
  }>
}

/* ─── Função principal do cron ───────────────────────────────────────────── */
export async function runFollowupCron(tenantId?: string): Promise<FollowupCronResult> {
  const result: FollowupCronResult = {
    processed: 0, sent: 0, skipped: 0, errors: 0, details: [],
  }

  try {
    // Threshold: 24h atrás
    const thresholdISO = new Date(Date.now() - SILENCE_THRESHOLD_HOURS * 3_600_000).toISOString()

    // Buscar conversas elegíveis
    let query = `
      SELECT
        c.id, c.contactName, c.contactId, c.followupCount,
        c.lastOurMessageAt, c.channelId, c.tenantId, c.status
      FROM Conversation c
      WHERE c.status IN ('WAITING', 'BOT_HANDLING')
        AND c.followupCount < ${MAX_FOLLOWUPS}
        AND c.lastOurMessageAt IS NOT NULL
        AND c.lastOurMessageAt < '${thresholdISO}'
    `

    if (tenantId) {
      query += ` AND c.tenantId = '${tenantId}'`
    }

    query += ` ORDER BY c.lastOurMessageAt ASC LIMIT ${BATCH_SIZE}`

    const eligibles = await prisma.$queryRawUnsafe<EligibleConversation[]>(query)

    console.log(`[FollowupCron] Found ${eligibles.length} eligible conversations`)

    for (const conv of eligibles) {
      result.processed++

      try {
        // Verificar se a última mensagem é realmente NOSSA (bot ou humano)
        const lastMsg = await prisma.$queryRaw<Array<{ senderType: string }>>`
          SELECT senderType FROM Message
          WHERE conversationId = ${conv.id}
            AND isInternalNote = 0
          ORDER BY timestamp DESC
          LIMIT 1
        `

        if (!lastMsg.length || lastMsg[0].senderType === 'USER') {
          // Cliente foi o último a falar — não fazer follow-up
          result.skipped++
          result.details.push({
            convId: conv.id,
            contactName: conv.contactName,
            attempt: conv.followupCount + 1,
            status: 'skipped',
            reason: 'Último a falar foi o cliente',
          })
          continue
        }

        // Selecionar template baseado na tentativa atual
        const attemptIdx = Math.min(conv.followupCount, FOLLOWUP_TEMPLATES.length - 1)
        const firstName   = conv.contactName.split(' ')[0] || conv.contactName
        const message     = FOLLOWUP_TEMPLATES[attemptIdx](firstName)
        const now         = new Date().toISOString()

        // Salvar mensagem no banco
        await prisma.$executeRaw`
          INSERT INTO Message (id, conversationId, senderType, senderName, content, messageType, isInternalNote, timestamp)
          VALUES (
            ${`followup-${Date.now()}-${Math.random().toString(36).slice(2,7)}`},
            ${conv.id},
            'BOT',
            'IA ProspecLead',
            ${message},
            'text',
            0,
            ${now}
          )
        `

        // Atualizar conversa
        await prisma.$executeRaw`
          UPDATE Conversation SET
            followupCount      = ${conv.followupCount + 1},
            lastOurMessageAt   = ${now},
            updatedAt          = ${now}
          WHERE id = ${conv.id}
        `

        // TODO (produção): enviar via WhatsApp Cloud API
        // await sendWhatsAppMessage(conv.contactId, message, conv.channelId)

        result.sent++
        result.details.push({
          convId: conv.id,
          contactName: conv.contactName,
          attempt: conv.followupCount + 1,
          status: 'sent',
        })

        console.log(`[FollowupCron] Sent follow-up #${conv.followupCount + 1} to ${conv.contactName} (${conv.id})`)

      } catch (itemErr) {
        result.errors++
        result.details.push({
          convId: conv.id,
          contactName: conv.contactName,
          attempt: conv.followupCount + 1,
          status: 'error',
          reason: itemErr instanceof Error ? itemErr.message : String(itemErr),
        })
        console.error(`[FollowupCron] Error for conv ${conv.id}:`, itemErr)
      }

      // Rate limiting: pequena pausa para não sobrecarregar o banco
      await new Promise(r => setTimeout(r, 50))
    }

  } catch (err) {
    console.error('[FollowupCron] Fatal error:', err)
  }

  console.log(`[FollowupCron] Done: ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors`)
  return result
}

/* ─── Versão com BullMQ (produção) ──────────────────────────────────────── */
/*
import { Queue } from 'bullmq'

const followupQueue = new Queue('followup', {
  connection: { host: process.env.REDIS_HOST || 'localhost', port: 6379 },
})

// Worker separado:
// const worker = new Worker('followup', async (job) => {
//   await runFollowupCron(job.data.tenantId)
// }, { connection: ... })

// Agendar execução diária via BullMQ repeat:
// await followupQueue.add('daily-scan', {}, {
//   repeat: { cron: '0 9 * * *' }, // Todo dia às 9h
// })
*/

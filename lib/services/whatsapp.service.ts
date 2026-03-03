/**
 * WhatsApp API Service — Envio de Mensagens via Meta Graph API
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsável por:
 *  1. Enviar mensagens de texto simples (suporte humano / IA)
 *  2. Enviar templates aprovados (campanhas em massa)
 *  3. Injetar token Bearer dinamicamente por Tenant (multi-tenant)
 *
 * API: https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
 *
 * Credenciais do Tenant (canal WhatsApp):
 *   Canal.credentials (JSON) = {
 *     "phone_number_id": "123456789",
 *     "access_token": "EAAxxxxx...",
 *     "waba_id": "987654321"
 *   }
 */

import { prisma } from '@/lib/prisma'

// Versão estável da Graph API
const GRAPH_API_VERSION = 'v19.0'
const GRAPH_BASE        = `https://graph.facebook.com/${GRAPH_API_VERSION}`

// ─────────────────────────────────────────────────────────────────────────────
// Tipo de credenciais armazenadas no Channel.credentials
// ─────────────────────────────────────────────────────────────────────────────
interface WAChannelCredentials {
  phone_number_id: string
  access_token:    string
  waba_id?:        string
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca credenciais do canal WhatsApp ativo de um tenant
// ─────────────────────────────────────────────────────────────────────────────
async function getChannelCredentials(tenantId: string): Promise<WAChannelCredentials> {
  const channel = await prisma.channel.findFirst({
    where: { tenantId, type: 'WHATSAPP_META', isActive: true },
  })
  if (!channel) {
    throw new Error(`Nenhum canal WhatsApp ativo para o tenant ${tenantId}`)
  }
  try {
    return JSON.parse(channel.credentials) as WAChannelCredentials
  } catch {
    throw new Error(`Credenciais inválidas no canal ${channel.id}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendTextMessage — Envio de mensagem de texto simples
// ─────────────────────────────────────────────────────────────────────────────
export async function sendTextMessage(
  to: string,        // Número E.164 sem '+' (ex: "5511999990001")
  text: string,
  tenantId: string
): Promise<SendMessageResult> {
  const creds = await getChannelCredentials(tenantId)

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  }

  return callGraphAPI(creds, payload)
}

// ─────────────────────────────────────────────────────────────────────────────
// sendTemplate — Envio de template aprovado (campanhas em massa)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: WATemplateComponent[],
  tenantId: string
): Promise<SendMessageResult> {
  const creds = await getChannelCredentials(tenantId)

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name:     templateName,
      language: { code: languageCode },
      components,
    },
  }

  return callGraphAPI(creds, payload)
}

// ─────────────────────────────────────────────────────────────────────────────
// callGraphAPI — Executa POST para Graph API injetando Bearer dinâmico
// ─────────────────────────────────────────────────────────────────────────────
async function callGraphAPI(
  creds: WAChannelCredentials,
  payload: Record<string, unknown>
): Promise<SendMessageResult> {
  const url = `${GRAPH_BASE}/${creds.phone_number_id}/messages`

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${creds.access_token}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json() as GraphAPIResponse

  if (!response.ok) {
    const errMsg = data.error?.message ?? `HTTP ${response.status}`
    console.error('[WA API] Erro ao enviar mensagem:', errMsg)
    return { success: false, error: errMsg }
  }

  const waMessageId = data.messages?.[0]?.id ?? null
  console.log(`[WA API] Mensagem enviada para ${(payload as { to: string }).to} → wamid: ${waMessageId}`)
  return { success: true, waMessageId }
}

// ─────────────────────────────────────────────────────────────────────────────
// CampaignQueueService — Gerenciador de Filas para Disparos em Massa
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ARQUITETURA DE FILAS (BullMQ + Redis)
 * ──────────────────────────────────────────────────────────────────────────
 * Em produção com BullMQ:
 *
 *   import { Queue, Worker, QueueEvents } from 'bullmq'
 *   import { Redis } from 'ioredis'
 *
 *   const connection = new Redis(process.env.REDIS_URL!)
 *
 *   // Fila de envios individuais
 *   const whatsappQueue = new Queue('whatsapp-messages', { connection })
 *
 *   // Worker que processa cada mensagem
 *   const worker = new Worker('whatsapp-messages', async (job) => {
 *     const { to, templateName, components, tenantId, campaignMessageId } = job.data
 *     const result = await sendTemplate(to, templateName, 'pt_BR', components, tenantId)
 *     if (result.success && result.waMessageId) {
 *       await prisma.campaignMessage.update({
 *         where: { id: campaignMessageId },
 *         data: { waMessageId: result.waMessageId, deliveryStatus: 'sent' }
 *       })
 *     }
 *   }, {
 *     connection,
 *     concurrency: 50,         // 50 mensagens por segundo (limite Meta tier 1)
 *     limiter: {
 *       max: 50,
 *       duration: 1000,        // 50 req/s máximo
 *     }
 *   })
 *
 * Rate Limits da Meta por tier:
 *   Tier 1 (< 1.000 usuarios/dia):  1.000  msg/24h
 *   Tier 2 (< 10.000):             10.000  msg/24h
 *   Tier 3 (< 100.000):           100.000  msg/24h
 *   Business (verificado):      ilimitado (limitado por phone)
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * launchCampaign — Dispara uma campanha em massa
 * Implementação simplificada sem Redis (usa Promise.all com batches)
 * Para produção: substituir pelo Worker BullMQ acima
 */
export async function launchCampaign(campaignId: string): Promise<CampaignLaunchResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { messages: true, tenant: true },
  })

  if (!campaign) throw new Error('Campanha não encontrada')
  if (campaign.status === 'RUNNING') {
    return { success: false, error: 'Campanha já está rodando.' }
  }

  // Marca campanha como RUNNING
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  const templateVars: Record<string, string> = JSON.parse(campaign.templateVars || '{}')
  let totalSent = 0
  let totalFailed = 0

  // Processa em lotes de 50 (rate limit Meta)
  const BATCH_SIZE = 50
  const messages   = campaign.messages

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE)

    const promises = batch.map(async (msg) => {
      // Monta componentes do template substituindo variáveis
      const components: WATemplateComponent[] = []
      const paramKeys = Object.keys(templateVars)

      if (paramKeys.length > 0) {
        components.push({
          type: 'body',
          parameters: paramKeys.map(key => ({
            type: 'text',
            text: key === '1' ? (msg.contactName || msg.phoneNumber) : (templateVars[key] ?? ''),
          })),
        })
      }

      try {
        const result = await sendTemplate(
          msg.phoneNumber,
          campaign.templateName,
          campaign.templateLanguage,
          components,
          campaign.tenantId,
        )

        await prisma.campaignMessage.update({
          where: { id: msg.id },
          data: {
            deliveryStatus: result.success ? 'sent' : 'failed',
            waMessageId:    result.waMessageId ?? undefined,
            errorMessage:   result.error ?? undefined,
            statusUpdatedAt: new Date(),
          },
        })

        if (result.success) totalSent++
        else totalFailed++
      } catch (err) {
        totalFailed++
        await prisma.campaignMessage.update({
          where: { id: msg.id },
          data: {
            deliveryStatus: 'failed',
            errorMessage:   (err as Error).message,
            statusUpdatedAt: new Date(),
          },
        })
      }
    })

    // Aguarda o lote antes de continuar (rate limiting)
    await Promise.all(promises)

    // Pausa 1 segundo entre lotes para respeitar o rate limit
    if (i + BATCH_SIZE < messages.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // Marca campanha como COMPLETED
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status:      'COMPLETED',
      completedAt: new Date(),
      totalSent,
      totalFailed,
    },
  })

  console.log(`[Campaign] ${campaignId} concluída: ${totalSent} enviadas, ${totalFailed} falhas`)
  return { success: true, totalSent, totalFailed }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ─────────────────────────────────────────────────────────────────────────────
interface WATemplateComponent {
  type: 'header' | 'body' | 'button'
  sub_type?: string
  index?: number
  parameters: { type: string; text?: string; image?: { link: string } }[]
}

interface SendMessageResult {
  success: boolean
  waMessageId?: string | null
  error?: string
}

interface CampaignLaunchResult {
  success: boolean
  totalSent?: number
  totalFailed?: number
  error?: string
}

interface GraphAPIResponse {
  messages?: { id: string }[]
  error?: { message: string; code: number }
}

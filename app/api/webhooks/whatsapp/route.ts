/**
 * WhatsApp Cloud API — Webhook Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * Rota: /api/webhooks/whatsapp
 *
 * GET  → Verificação de segurança da Meta (hub.verify_token + hub.challenge)
 * POST → Recebimento de eventos: mensagens recebidas + status de entrega
 *
 * Fluxo completo:
 *  1. Meta envia POST com payload criptografado
 *  2. Extraímos número (from) + conteúdo (text.body)
 *  3. Buscamos Tenant e Conversation no Prisma
 *  4. Salvamos Message com senderType = 'USER'
 *  5. Atualizamos métricas de CampaignMessage (delivered / read)
 *  6. [TODO] Emitir via Socket.io para atualizar chat em tempo real
 *
 * Referência Meta: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Token de verificação configurado no painel Meta > WhatsApp > Webhook
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'prospeclead_wh_token_2025'

// ─────────────────────────────────────────────────────────────────────────────
// GET — Verificação do Webhook pela Meta
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WA Webhook] Verificação aceita pela Meta ✅')
    return new Response(challenge ?? '', { status: 200 })
  }

  console.warn('[WA Webhook] Verificação FALHOU — token inválido')
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Recebimento de mensagens e status
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: WhatsAppPayload

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Sempre responder 200 IMEDIATAMENTE para a Meta (evitar reenvios)
  // O processamento acontece de forma assíncrona
  processWebhookAsync(body).catch(err =>
    console.error('[WA Webhook] Erro no processamento:', err)
  )

  return new Response('EVENT_RECEIVED', { status: 200 })
}

// ─────────────────────────────────────────────────────────────────────────────
// Processamento Assíncrono
// ─────────────────────────────────────────────────────────────────────────────
async function processWebhookAsync(body: WhatsAppPayload) {
  if (!body?.entry?.length) return

  for (const entry of body.entry) {
    for (const change of (entry.changes ?? [])) {
      const value = change.value
      if (!value) continue

      // ── Mensagens recebidas ────────────────────────────────────────────────
      if (value.messages?.length) {
        for (const msg of value.messages) {
          await handleIncomingMessage(msg, value)
        }
      }

      // ── Status de entrega (sent → delivered → read) ──────────────────────
      if (value.statuses?.length) {
        for (const status of value.statuses) {
          await handleStatusUpdate(status)
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mensagem recebida do usuário
// ─────────────────────────────────────────────────────────────────────────────
async function handleIncomingMessage(
  msg: WAMessage,
  value: WAChangeValue
) {
  const from    = msg.from // número E.164 sem '+'
  const content = msg.text?.body ?? msg.type ?? '[mídia]'
  const phoneId = value.metadata?.phone_number_id

  console.log(`[WA Webhook] Mensagem de ${from}: "${content.slice(0, 80)}"`)

  // Normaliza número (remove 55 inicial se necessário para busca)
  const telefoneNorm = from.replace(/^55/, '')

  // Busca Channel pelo phone_number_id (credenciais do tenant)
  // As credenciais ficam serializadas em JSON no campo Channel.credentials
  const channel = await prisma.channel.findFirst({
    where: {
      type: 'WHATSAPP_META',
      isActive: true,
      // Filtra pelo phone_number_id nas credenciais
      credentials: { contains: phoneId ?? '' },
    },
  })

  if (!channel) {
    console.warn(`[WA Webhook] Nenhum canal encontrado para phone_number_id=${phoneId}`)
    return
  }

  // Busca agente padrão do tenant
  const agent = await prisma.agent.findFirst({
    where: { tenantId: channel.tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!agent) {
    console.warn(`[WA Webhook] Nenhum agente ativo para tenantId=${channel.tenantId}`)
    return
  }

  // Busca ou cria conversa para esse contato + canal
  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: from,
      channelId: channel.id,
      status: { not: 'RESOLVED' },
    },
  })

  // Tenta obter nome do contato via profile (payload da Meta)
  const contactName = value.contacts?.[0]?.profile?.name ?? `+${from}`

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId:    from,
        contactName,
        agentId:      agent.id,
        channelId:    channel.id,
        tenantId:     channel.tenantId,
        status:       'BOT_HANDLING',
      },
    })
    console.log(`[WA Webhook] Nova conversa criada: ${conversation.id}`)
  } else if (conversation.contactName === '' || conversation.contactName === `+${from}`) {
    // Atualiza nome se ainda estava vazio
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { contactName, updatedAt: new Date() },
    })
  }

  // Salva mensagem no banco
  const savedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderType:     'USER',
      senderName:     contactName,
      content,
      messageType:    msg.type ?? 'text',
      mediaUrl:       extractMediaUrl(msg),
    },
  })

  // Atualiza updatedAt da conversa (sobe na lista do inbox)
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  })

  console.log(`[WA Webhook] Mensagem salva: ${savedMessage.id}`)

  // ── [TODO] Socket.io — Emitir evento em tempo real ──────────────────────
  //
  // Em produção, após salvar a mensagem, emita para todos os operadores
  // que estão com o chat aberto nessa conversa:
  //
  //   import { getSocketServer } from '@/lib/socket'  // instância global do Socket.io
  //
  //   const io = getSocketServer()
  //   io.to(`tenant:${channel.tenantId}`).emit('new_message', {
  //     conversationId: conversation.id,
  //     message: savedMessage,
  //     contactName,
  //   })
  //
  // Configuração Socket.io recomendada para Next.js App Router:
  //   → Servidor Socket.io autônomo na porta 3001 (socket-server.js)
  //   → Ou usar Ably / Pusher / Cloudflare Durable Objects como alternativa gerenciada
  //
  // ────────────────────────────────────────────────────────────────────────────

  // ── [TODO] Resposta automática da IA ────────────────────────────────────
  //
  // Se conversation.status === 'BOT_HANDLING', chamar o LLM:
  //   1. Buscar histórico de mensagens da conversa
  //   2. Carregar base de conhecimento do agente (RAG: busca vetorial no Pinecone)
  //   3. Chamar OpenAI / Anthropic com systemPrompt + contexto + histórico
  //   4. Salvar resposta como Message { senderType: 'BOT' }
  //   5. Enviar via WhatsAppApiService.sendMessage(from, iaResponse, channel.tenantId)
  //
  // ────────────────────────────────────────────────────────────────────────────
}

// ─────────────────────────────────────────────────────────────────────────────
// Atualização de status de entrega (sent → delivered → read)
// ─────────────────────────────────────────────────────────────────────────────
async function handleStatusUpdate(status: WAStatus) {
  const { id: waMessageId, status: deliveryStatus } = status

  // Atualiza CampaignMessage pelo waMessageId
  const campaignMsg = await prisma.campaignMessage.findUnique({
    where: { waMessageId },
  })

  if (campaignMsg) {
    await prisma.campaignMessage.update({
      where: { waMessageId },
      data: {
        deliveryStatus,
        statusUpdatedAt: new Date(),
        errorMessage: status.errors?.[0]?.message ?? null,
      },
    })

    // Atualiza contadores agregados na campanha
    if (deliveryStatus === 'delivered') {
      await prisma.campaign.update({
        where: { id: campaignMsg.campaignId },
        data: { totalDelivered: { increment: 1 } },
      })
    } else if (deliveryStatus === 'read') {
      await prisma.campaign.update({
        where: { id: campaignMsg.campaignId },
        data: { totalRead: { increment: 1 } },
      })
    } else if (deliveryStatus === 'failed') {
      await prisma.campaign.update({
        where: { id: campaignMsg.campaignId },
        data: { totalFailed: { increment: 1 } },
      })
    }

    console.log(`[WA Status] ${waMessageId} → ${deliveryStatus}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function extractMediaUrl(msg: WAMessage): string | undefined {
  if (msg.image?.id)    return `https://graph.facebook.com/v19.0/${msg.image.id}`
  if (msg.audio?.id)    return `https://graph.facebook.com/v19.0/${msg.audio.id}`
  if (msg.video?.id)    return `https://graph.facebook.com/v19.0/${msg.video.id}`
  if (msg.document?.id) return `https://graph.facebook.com/v19.0/${msg.document.id}`
  return undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (baseados na estrutura oficial da Meta)
// ─────────────────────────────────────────────────────────────────────────────
interface WhatsAppPayload {
  object: string
  entry: WAEntry[]
}
interface WAEntry {
  id: string
  changes: WAChange[]
}
interface WAChange {
  value: WAChangeValue
  field: string
}
interface WAChangeValue {
  messaging_product: string
  metadata?: { display_phone_number: string; phone_number_id: string }
  contacts?:  WAContact[]
  messages?:  WAMessage[]
  statuses?:  WAStatus[]
}
interface WAContact {
  profile: { name: string }
  wa_id:   string
}
interface WAMessage {
  from:      string
  id:        string
  timestamp: string
  type:      string
  text?:     { body: string }
  image?:    { id: string; mime_type: string }
  audio?:    { id: string; mime_type: string }
  video?:    { id: string; mime_type: string }
  document?: { id: string; mime_type: string; filename?: string }
}
interface WAStatus {
  id:         string
  status:     string
  timestamp:  string
  recipient_id: string
  errors?:    { code: number; message: string }[]
}

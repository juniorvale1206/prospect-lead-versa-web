/**
 * WhatsApp Cloud API -- Webhook Controller
 * Route: /api/webhooks/whatsapp
 *
 * GET  -> Meta webhook verification (hub.verify_token + hub.challenge)
 * POST -> Incoming messages + delivery status events
 *
 * PIPELINE WITH INTELLIGENT PDV ROUTER:
 *
 *  1. Extract from + text.body from Meta payload
 *  2. extractPdvTag(text) -- Regex: /\[Ref:\s*PDV-([a-zA-Z0-9_-]+)\]/i
 *            |
 *    +--------+----------+
 *  TAG FOUND           NO TAG
 *    |                   |
 *    v                   v
 *  routeQrCodeLead()   Generic flow (standard AI)
 *    |
 *    +- Find PDV in DB
 *    +- Upsert Lead (sourceType = QR_CODE_PDV)
 *    +- Link promotorId (managerPromoter of PDV)
 *    +- CommissionLedger PENDING (network commission)
 *    +- AlertLog -> notify promotor in mobile app
 *    +- buildPdvSystemPrompt() -> personalized AI consultant
 *
 *  3. Save Message in DB (senderType = USER)
 *  4. Update/create Conversation
 *  5. Dispatch AI response (generic or contextualized)
 *
 * Meta reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  extractPdvTag,
  routeQrCodeLead,
  dispatchPdvIaGreeting,
} from '@/lib/services/pdv-lead-router.service'

// Verification token configured in Meta > WhatsApp > Webhook panel
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'prospeclead_wh_token_2025'

// ---------------------------------------------------------------------------
// GET -- Meta webhook verification
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WA Webhook] Verification accepted by Meta OK')
    return new Response(challenge ?? '', { status: 200 })
  }

  console.warn('[WA Webhook] Verification FAILED -- invalid token')
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ---------------------------------------------------------------------------
// POST -- Receive messages and status events
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: WhatsAppPayload

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Always respond 200 IMMEDIATELY to Meta (avoids retries)
  // Processing happens asynchronously
  processWebhookAsync(body).catch(err =>
    console.error('[WA Webhook] Processing error:', err)
  )

  return new Response('EVENT_RECEIVED', { status: 200 })
}

// ---------------------------------------------------------------------------
// Async processing pipeline
// ---------------------------------------------------------------------------
async function processWebhookAsync(body: WhatsAppPayload) {
  if (!body?.entry?.length) return

  for (const entry of body.entry) {
    for (const change of (entry.changes ?? [])) {
      const value = change.value
      if (!value) continue

      // Incoming messages
      if (value.messages?.length) {
        for (const msg of value.messages) {
          await handleIncomingMessage(msg, value)
        }
      }

      // Delivery status updates (sent -> delivered -> read)
      if (value.statuses?.length) {
        for (const status of value.statuses) {
          await handleStatusUpdate(status)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Incoming message handler -- Main pipeline with Intelligent PDV Router
// ---------------------------------------------------------------------------
async function handleIncomingMessage(
  msg:   WAMessage,
  value: WAChangeValue
) {
  const from    = msg.from                   // E.164 without '+'
  const rawText = msg.text?.body ?? ''       // raw message text
  const phoneId = value.metadata?.phone_number_id

  // -----------------------------------------------------------------------
  // STEP 1: Detect QR Code tracking tag
  //
  // Regex: /\[Ref:\s*PDV-([a-zA-Z0-9_-]+)\]/i
  //
  // Valid tag examples:
  //   "Ola! [Ref: PDV-cmmgdem5e00018clnvyufpvja]"
  //   "oi [Ref:PDV-abc123] quero saber mais"
  //   "[REF: PDV-xyz789]"  (case-insensitive)
  //
  // QR Code URL format embedded in WhatsApp deeplink:
  //   https://wa.me/55{PHONE}?text=Ola!%20[Ref%3A%20PDV-{pdvId}]
  // -----------------------------------------------------------------------
  const { found: hasPdvTag, pdvId, cleanText } = extractPdvTag(rawText)

  // Content persisted in DB is always the clean text (tag removed)
  const content = cleanText || rawText || (msg.type ?? '[media]')

  const tagInfo = hasPdvTag ? ` | PDV TAG detected: ${pdvId}` : ''
  console.log(`[WA Webhook] Message from ${from}: ${content.slice(0, 80)}${tagInfo}`)

  // -----------------------------------------------------------------------
  // STEP 2: Find Channel (tenant credentials)
  // -----------------------------------------------------------------------
  const channel = await prisma.channel.findFirst({
    where: {
      type:     'WHATSAPP_META',
      isActive: true,
      credentials: { contains: phoneId ?? '' },
    },
  })

  if (!channel) {
    console.warn(`[WA Webhook] No channel found for phone_number_id=${phoneId}`)
    return
  }

  // -----------------------------------------------------------------------
  // STEP 3: Find active AI agent for this tenant
  // -----------------------------------------------------------------------
  const agent = await prisma.agent.findFirst({
    where:   { tenantId: channel.tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!agent) {
    console.warn(`[WA Webhook] No active agent for tenantId=${channel.tenantId}`)
    return
  }

  // -----------------------------------------------------------------------
  // STEP 4: Find or create Conversation
  // -----------------------------------------------------------------------
  const contactName = value.contacts?.[0]?.profile?.name ?? `+${from}`

  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: from,
      channelId: channel.id,
      status:    { not: 'RESOLVED' },
    },
  })

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
    console.log(`[WA Webhook] New conversation created: ${conversation.id}`)
  } else if (conversation.contactName === '' || conversation.contactName === `+${from}`) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data:  { contactName, updatedAt: new Date() },
    })
  }

  // -----------------------------------------------------------------------
  // STEP 5: Save user message in DB
  // -----------------------------------------------------------------------
  const savedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderType:     'USER',
      senderName:     contactName,
      content,                        // clean text (no [Ref: PDV-...] tag)
      messageType:    msg.type ?? 'text',
      mediaUrl:       extractMediaUrl(msg),
    },
  })

  // Bump conversation to top of inbox
  await prisma.conversation.update({
    where: { id: conversation.id },
    data:  { updatedAt: new Date() },
  })

  console.log(`[WA Webhook] Message saved: ${savedMessage.id}`)

  // -----------------------------------------------------------------------
  // STEP 6: INTELLIGENT ROUTER
  //
  //  if hasPdvTag  --> Branch A: QR Code PDV flow (personalized AI consultant)
  //  else          --> Branch B: Generic flow (standard agent AI)
  // -----------------------------------------------------------------------

  if (hasPdvTag && pdvId) {
    // =====================================================================
    // BRANCH A: Lead captured via PDV QR Code
    // =====================================================================
    console.log(`[WA Webhook] Routing to PdvLeadRouter -- PDV ID: ${pdvId}`)

    const pdvContext = await routeQrCodeLead(
      pdvId,
      from,
      contactName,
      channel.tenantId,
      cleanText,
    )

    if (pdvContext) {
      // -------------------------------------------------------------------
      // AI response with personalized PDV context
      //
      // pdvContext.systemPrompt contains:
      //  - Capture context (PDV name, city, store type)
      //  - Manager promotor name
      //  - Instructions: thank QR Code scan, collect vehicle/plate
      //  - Tone: VIP consultant (not telemarketing)
      //  - Rules: max 3 lines, no invented prices
      // -------------------------------------------------------------------
      await dispatchPdvIaGreeting(
        conversation.id,
        from,
        channel.tenantId,
        pdvContext,
      )

      console.log(
        '[WA Webhook] QR Code lead processed:\n' +
        '  PDV:      ' + pdvContext.pdvName + '\n' +
        '  Lead ID:  ' + pdvContext.leadId + '\n' +
        '  Promotor: ' + (pdvContext.promotorNome ?? '(no manager)') + '\n' +
        '  New lead: ' + pdvContext.isNewLead
      )
      return   // AI greeting already sent by router -- exit handler
    }

    // If routeQrCodeLead returned null (PDV not found/inactive),
    // fall through to generic flow below
    console.warn(
      `[WA Webhook] PDV "${pdvId}" not found or inactive -- using generic flow.`
    )
  }

  // =========================================================================
  // BRANCH B: Generic flow (no PDV tag)
  //
  // Only runs if conversation.status === 'BOT_HANDLING':
  //   1. Fetch recent message history (last 10 messages)
  //   2. Build context with agent.systemPrompt (no PDV personalization)
  //   3. Call OpenAI with history
  //   4. Save response as Message { senderType: 'BOT' }
  //   5. Send via WhatsApp API
  // =========================================================================
  if (conversation.status === 'BOT_HANDLING') {
    await dispatchGenericIaResponse(
      conversation.id,
      from,
      channel.tenantId,
      agent,
    ).catch(err =>
      console.error('[WA Webhook] Error in generic AI response:', err)
    )
  }
}

// ---------------------------------------------------------------------------
// Generic AI response (standard flow -- no PDV context)
// ---------------------------------------------------------------------------
async function dispatchGenericIaResponse(
  conversationId: string,
  to:             string,
  tenantId:       string,
  agent:          { id: string; systemPrompt: string; model: string; tone: string },
): Promise<void> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.warn('[WA Webhook] OPENAI_API_KEY not configured -- generic AI disabled.')
    return
  }

  // Fetch recent history for context
  const history = await prisma.message.findMany({
    where:   { conversationId },
    orderBy: { timestamp: 'desc' },
    take:    10,
    select:  { senderType: true, senderName: true, content: true },
  })

  const messages = [
    { role: 'system', content: agent.systemPrompt || 'You are a professional sales consultant.' },
    ...history.reverse().map(m => ({
      role:    m.senderType === 'USER' ? 'user' : 'assistant',
      content: m.content,
    })),
  ]

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model:       agent.model || 'gpt-4o-mini',
        messages,
        max_tokens:  300,
        temperature: 0.7,
      }),
    })

    if (!res.ok) {
      console.error(`[WA Webhook AI] OpenAI HTTP ${res.status}`)
      return
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>
    }
    const reply = data.choices?.[0]?.message?.content?.trim()
    if (!reply) return

    // Save bot response in DB
    await prisma.message.create({
      data: {
        conversationId,
        senderType: 'BOT',
        senderName: 'IA ProspecLead',
        content:    reply,
        messageType: 'text',
      },
    })

    // Send via WhatsApp
    const { sendTextMessage } = await import('@/lib/services/whatsapp.service')
    await sendTextMessage(to, reply, tenantId)

    console.log(`[WA Webhook AI] Generic response sent to ${to}`)
  } catch (err) {
    console.error('[WA Webhook AI] Error calling OpenAI:', err)
  }
}

// ---------------------------------------------------------------------------
// Delivery status update (sent -> delivered -> read)
// ---------------------------------------------------------------------------
async function handleStatusUpdate(status: WAStatus) {
  const { id: waMessageId, status: deliveryStatus } = status

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

    if (deliveryStatus === 'delivered') {
      await prisma.campaign.update({
        where: { id: campaignMsg.campaignId },
        data:  { totalDelivered: { increment: 1 } },
      })
    } else if (deliveryStatus === 'read') {
      await prisma.campaign.update({
        where: { id: campaignMsg.campaignId },
        data:  { totalRead: { increment: 1 } },
      })
    } else if (deliveryStatus === 'failed') {
      await prisma.campaign.update({
        where: { id: campaignMsg.campaignId },
        data:  { totalFailed: { increment: 1 } },
      })
    }

    console.log(`[WA Status] ${waMessageId} -> ${deliveryStatus}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractMediaUrl(msg: WAMessage): string | undefined {
  if (msg.image?.id)    return `https://graph.facebook.com/v19.0/${msg.image.id}`
  if (msg.audio?.id)    return `https://graph.facebook.com/v19.0/${msg.audio.id}`
  if (msg.video?.id)    return `https://graph.facebook.com/v19.0/${msg.video.id}`
  if (msg.document?.id) return `https://graph.facebook.com/v19.0/${msg.document.id}`
  return undefined
}

// ---------------------------------------------------------------------------
// Types (based on Meta official webhook structure)
// ---------------------------------------------------------------------------
interface WhatsAppPayload {
  object: string
  entry:  WAEntry[]
}
interface WAEntry {
  id:      string
  changes: WAChange[]
}
interface WAChange {
  value: WAChangeValue
  field: string
}
interface WAChangeValue {
  messaging_product: string
  metadata?:  { display_phone_number: string; phone_number_id: string }
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
  id:           string
  status:       string
  timestamp:    string
  recipient_id: string
  errors?:      { code: number; message: string }[]
}

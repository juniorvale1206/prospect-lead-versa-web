/**
 * POST /api/webhooks/voice
 * Recebe eventos do Vapi.ai sobre o andamento das chamadas
 *
 * Eventos tratados:
 *  - call-started   → status = IN_PROGRESS
 *  - call-ended     → status = COMPLETED/NO_ANSWER/BUSY/FAILED/CANCELED
 *  - call-failed    → status = FAILED
 *
 * Segurança: valida o header X-Vapi-Secret (HMAC opcional) ou token fixo
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleVapiWebhook, VapiWebhookEvent } from '@/lib/services/voice-agent.service'

export async function POST(req: NextRequest) {
  // Validar segredo do webhook
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET
  if (webhookSecret) {
    const incomingSecret = req.headers.get('x-vapi-secret')
    if (incomingSecret !== webhookSecret) {
      console.warn('[voice-webhook] Secret inválido')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let event: VapiWebhookEvent
  try {
    event = await req.json() as VapiWebhookEvent
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  console.log('[voice-webhook] Evento recebido:', event.type, event.call?.id)

  try {
    await handleVapiWebhook(event)
  } catch (err) {
    console.error('[voice-webhook] Erro ao processar evento:', err)
    // Retornar 200 para o Vapi não retentar infinitamente
    return NextResponse.json({ ok: false, error: String(err) })
  }

  return NextResponse.json({ ok: true })
}

// HEAD para health check do Vapi
export async function HEAD() {
  return new Response(null, { status: 200 })
}

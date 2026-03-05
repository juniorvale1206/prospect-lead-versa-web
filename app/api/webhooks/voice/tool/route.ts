/**
 * POST /api/webhooks/voice/tool
 * Chamado pelo Vapi em tempo real quando a IA aciona uma tool (função)
 * durante a ligação (ex.: agendar_reuniao, coletar_dados_frota)
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleToolCall }            from '@/lib/services/voice-agent.service'

export async function POST(req: NextRequest) {
  // Segurança opcional
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET
  if (webhookSecret) {
    const incomingSecret = req.headers.get('x-vapi-secret')
    if (incomingSecret !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: {
    call?:      { id?: string }
    toolCallId?: string
    toolName?:  string
    toolInput?: Record<string, string>
    // Formato alternativo Vapi v2
    message?: {
      type?:     string
      toolCallId?: string
      toolCall?: {
        id:    string
        function: {
          name:      string
          arguments: string | Record<string, string>
        }
      }
      call?: { id?: string }
    }
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Normalizar formato do payload (Vapi v1 vs v2)
  const callId   = body.call?.id ?? body.message?.call?.id ?? ''
  const toolName = body.toolName ?? body.message?.toolCall?.function?.name ?? ''

  let toolInput: Record<string, string> = body.toolInput ?? {}
  if (!Object.keys(toolInput).length && body.message?.toolCall?.function?.arguments) {
    const args = body.message.toolCall.function.arguments
    toolInput = typeof args === 'string' ? JSON.parse(args) : args
  }

  console.log('[voice-tool]', { callId, toolName, toolInput })

  if (!callId || !toolName) {
    return NextResponse.json({ result: 'missing params' }, { status: 400 })
  }

  const result = await handleToolCall(callId, toolName, toolInput)

  // Vapi espera { result: string } no corpo da resposta
  return NextResponse.json(result)
}

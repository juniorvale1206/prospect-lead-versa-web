/**
 * POST /api/voice/dispatch
 * Dispara uma ligação de IA para um lead via Vapi.ai
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken }               from '@/lib/auth'
import { dispatchAiCall }            from '@/lib/services/voice-agent.service'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL', 'CONSULTANT', 'SDR']

export async function POST(req: NextRequest) {
  // Auth
  const token = req.cookies.get('token')?.value
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const session = await verifyToken(token)
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // Body
  let body: { leadId?: string; agentId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { leadId, agentId } = body
  if (!leadId) return NextResponse.json({ error: 'leadId é obrigatório' }, { status: 400 })

  // Dispatch
  const result = await dispatchAiCall(leadId, agentId ?? null, session.userId)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json({
    callLogId:     result.callLogId,
    providerCallId: result.providerCallId,
    status:        'RINGING',
    message:       '📞 Ligação iniciada! Aguarde a IA contatar o lead.',
  })
}

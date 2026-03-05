/**
 * GET /api/voice/calls/[leadId]
 * Lista o histórico de ligações de IA para um lead específico
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken }               from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req:     NextRequest,
  { params }: { params: { leadId: string } },
) {
  const token = req.cookies.get('token')?.value
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const session = await verifyToken(token)
  if (!session) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const { leadId } = params

  try {
    const calls = await prisma.callLog.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { name: true } },
      },
    })

    // Sanitizar: não expor transcript completo na listagem
    const sanitized = calls.map(c => ({
      id:                 c.id,
      status:             c.status,
      provider:           c.provider,
      providerCallId:     c.providerCallId,
      agentName:          c.agent?.name ?? 'IA',
      durationSeconds:    c.durationSeconds,
      summary:            c.summary,
      callTemperature:    c.callTemperature,
      sentiment:          c.sentiment,
      meetingScheduled:   c.meetingScheduled,
      meetingScheduledAt: c.meetingScheduledAt,
      recordingUrl:       c.recordingUrl,
      endedReason:        c.endedReason,
      callNotes:          c.callNotes,
      costCents:          c.costCents,
      startedAt:          c.startedAt,
      endedAt:            c.endedAt,
      createdAt:          c.createdAt,
      // Transcript só no detalhe individual
      hasTranscript:      !!c.transcript,
    }))

    return NextResponse.json({ calls: sanitized, total: sanitized.length })
  } catch (err) {
    console.error('[voice/calls] Erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * GET /api/voice/calls/[leadId]?callLogId=xxx&transcript=1
 * Retorna a transcrição completa de uma ligação específica
 */
export async function POST(
  req:     NextRequest,
  { params }: { params: { leadId: string } },
) {
  const token = req.cookies.get('token')?.value
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const session = await verifyToken(token)
  if (!session) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const { callLogId } = await req.json() as { callLogId?: string }
  if (!callLogId) return NextResponse.json({ error: 'callLogId obrigatório' }, { status: 400 })

  const call = await prisma.callLog.findFirst({
    where: { id: callLogId, leadId: params.leadId },
  })
  if (!call) return NextResponse.json({ error: 'Ligação não encontrada' }, { status: 404 })

  return NextResponse.json({
    id:          call.id,
    transcript:  call.transcript,
    toolCalls:   call.toolCalls ? JSON.parse(call.toolCalls) : [],
    summary:     call.summary,
    analysis: {
      temperature: call.callTemperature,
      sentiment:   call.sentiment,
      meetingScheduled:   call.meetingScheduled,
      meetingScheduledAt: call.meetingScheduledAt,
    },
  })
}

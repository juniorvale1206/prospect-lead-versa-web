/**
 * /api/chat/conversations/[id]/messages
 *
 * GET  — lista mensagens da conversa (ordena por timestamp ASC)
 * POST — envia mensagem humana ou nota interna
 *        Body: { content, senderType?, isInternalNote?, messageType? }
 *
 * Smart Inbox Features:
 *  - isInternalNote=true: salva com flag, não envia ao cliente via WhatsApp
 *  - Após cada POST de USER/BOT/HUMAN (não nota interna), aciona checkAndQualify()
 *  - Atualiza lastOurMessageAt quando senderType != USER
 *  - Detecta palavras de fallback no texto do USER e seta fallbackRequested=true
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { checkAndQualify } from '@/lib/services/lead-qualification.service'
import { FALLBACK_KEYWORDS } from '@/lib/services/lead-qualification.service'

async function getSession(req: NextRequest) {
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) return null
  return verifyToken(cookieToken)
}

// ─── GET /api/chat/conversations/[id]/messages ────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const includeNotes = searchParams.get('notes') === '1'

  // Busca mensagens (inclui notas internas por padrão para operadores)
  const messages = await prisma.$queryRaw<Array<{
    id: string; senderType: string; senderName: string; content: string
    messageType: string; mediaUrl: string | null; read: boolean
    isInternalNote: number | boolean; reaction: string | null; timestamp: string
  }>>`
    SELECT id, senderType, senderName, content, messageType, mediaUrl,
           read, isInternalNote, reaction, timestamp
    FROM Message
    WHERE conversationId = ${params.id}
    ORDER BY timestamp ASC
  `

  // Normaliza isInternalNote (SQLite retorna 0/1 como number)
  const normalized = messages.map(m => ({
    ...m,
    isInternalNote: m.isInternalNote === 1 || m.isInternalNote === true,
  }))

  // Marca mensagens do USER como lidas
  await prisma.$executeRaw`
    UPDATE Message SET read = 1
    WHERE conversationId = ${params.id}
      AND senderType = 'USER'
      AND read = 0
  `

  // Busca também dados de qualificação da conversa
  const convData = await prisma.$queryRaw<Array<{
    isAiActive: number; fallbackRequested: number; leadTemperature: string | null
    buyingIntent: string | null; mainObjection: string | null
    engagementScore: number | null; lastQualifiedAt: string | null
    status: string; assignedToId: string | null
  }>>`
    SELECT isAiActive, fallbackRequested, leadTemperature, buyingIntent,
           mainObjection, engagementScore, lastQualifiedAt, status, assignedToId
    FROM Conversation WHERE id = ${params.id}
  `

  const qualification = convData[0] ? {
    isAiActive:       Number(convData[0].isAiActive) === 1,
    fallbackRequested: Number(convData[0].fallbackRequested) === 1,
    leadTemperature:  convData[0].leadTemperature || 'COLD',
    buyingIntent:     convData[0].buyingIntent,
    mainObjection:    convData[0].mainObjection,
    engagementScore:  convData[0].engagementScore || 0,
    lastQualifiedAt:  convData[0].lastQualifiedAt,
    status:           convData[0].status,
    assignedToId:     convData[0].assignedToId,
  } : null

  return NextResponse.json({ success: true, messages: normalized, qualification })
}

// ─── POST /api/chat/conversations/[id]/messages ───────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const body = await req.json() as {
    content?:        string
    senderType?:     string
    messageType?:    string
    isInternalNote?: boolean
  }

  const { content, senderType = 'HUMAN', messageType = 'text', isInternalNote = false } = body

  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Conteúdo é obrigatório.' }
    }, { status: 400 })
  }

  const conv = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM Conversation WHERE id = ${params.id}`.then(r => r[0] || null)
  if (!conv) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
  }

  const now = new Date().toISOString()
  const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const senderName = senderType === 'HUMAN' ? session.nome :
                     senderType === 'BOT'   ? 'Bot IA' : 'Sistema'

  // Salva mensagem
  await prisma.$executeRaw`
    INSERT INTO Message (id, conversationId, senderType, senderName, content, messageType, isInternalNote, read, timestamp)
    VALUES (${msgId}, ${params.id}, ${senderType}, ${senderName}, ${content.trim()}, ${messageType}, ${isInternalNote ? 1 : 0}, 0, ${now})
  `

  // Atualiza conversa
  const isOurMessage = senderType !== 'USER'

  if (isOurMessage && !isInternalNote) {
    // Atualiza lastOurMessageAt quando somos nós que falamos
    await prisma.$executeRaw`
      UPDATE Conversation SET
        updatedAt          = ${now},
        lastOurMessageAt   = ${now}
      WHERE id = ${params.id}
    `
  } else {
    await prisma.$executeRaw`
      UPDATE Conversation SET updatedAt = ${now}
      WHERE id = ${params.id}
    `
  }

  // Detectar pedido de fallback humano no texto do USER
  if (senderType === 'USER') {
    const lowerContent = content.toLowerCase()
    const wantsFallback = FALLBACK_KEYWORDS.some(kw => lowerContent.includes(kw))
    if (wantsFallback) {
      await prisma.$executeRaw`
        UPDATE Conversation SET
          fallbackRequested = 1,
          status = 'WAITING'
        WHERE id = ${params.id}
          AND fallbackRequested = 0
      `
    }
  }

  // Acionar qualificação IA de forma assíncrona (fire-and-forget)
  // Não bloqueia a resposta HTTP
  if (!isInternalNote) {
    setImmediate(() => {
      checkAndQualify(params.id).catch(e =>
        console.error('[Messages API] Qualification error:', e)
      )
    })
  }

  // Busca a mensagem criada para retornar ao cliente
  const created = {
    id:             msgId,
    conversationId: params.id,
    senderType,
    senderName,
    content:        content.trim(),
    messageType,
    isInternalNote,
    read:           false,
    timestamp:      now,
  }

  return NextResponse.json({ success: true, message: created }, { status: 201 })
}

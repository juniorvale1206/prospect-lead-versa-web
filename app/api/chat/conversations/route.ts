import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function getSession(req: NextRequest) {
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) return null
  return verifyToken(cookieToken)
}

// GET /api/chat/conversations?status=&tenantId=
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const statusFilter = searchParams.get('status') // WAITING | BOT_HANDLING | HUMAN_HANDLING | RESOLVED
  const assignedToMe = searchParams.get('mine') === '1'

  const where: Record<string, unknown> = {}

  if (session.role !== 'ADMIN_MASTER') {
    where.tenantId = session.tenantId
  }
  if (statusFilter) where.status = statusFilter
  if (assignedToMe) where.assignedToId = session.userId

  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      agent: { select: { id: true, name: true } },
      channel: { select: { id: true, type: true, name: true } },
      messages: {
        orderBy: { timestamp: 'desc' },
        take: 1,
      },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ success: true, conversations })
}

// POST /api/chat/conversations — cria conversa (normalmente via webhook)
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const body = await req.json()
  const { contactId, contactName, agentId, channelId, tenantId: bodyTenantId } = body

  if (!contactId || !agentId || !channelId) {
    return NextResponse.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'contactId, agentId e channelId são obrigatórios.' }
    }, { status: 400 })
  }

  const tenantId = session.role === 'ADMIN_MASTER' ? (bodyTenantId ?? session.tenantId) : session.tenantId

  // Verifica se já existe conversa aberta com esse contato+canal
  const existing = await prisma.conversation.findFirst({
    where: {
      contactId,
      channelId,
      status: { not: 'RESOLVED' },
    },
  })

  if (existing) {
    return NextResponse.json({ success: true, conversation: existing, existing: true })
  }

  const conversation = await prisma.conversation.create({
    data: {
      contactId,
      contactName: contactName ?? '',
      agentId,
      channelId,
      tenantId: tenantId ?? undefined,
      status: 'BOT_HANDLING',
    },
    include: {
      agent: { select: { id: true, name: true } },
      channel: { select: { id: true, type: true, name: true } },
    },
  })

  return NextResponse.json({ success: true, conversation }, { status: 201 })
}

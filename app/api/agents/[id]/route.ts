import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']
const VALID_TONES   = ['FORMAL', 'NORMAL', 'DESCONTRAIDA']
const VALID_MODELS  = ['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus']

async function getSession(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : cookieToken
  if (!token) return null
  return verifyToken(token)
}

// GET /api/agents/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token inválido.' } }, { status: 401 })
  }

  const agent = await prisma.agent.findUnique({
    where: { id: params.id },
    include: {
      tenant: { select: { id: true, nome: true, slug: true } },
      knowledgeBases: { orderBy: { createdAt: 'desc' } },
      _count: { select: { conversations: true } },
    },
  })

  if (!agent) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Agente não encontrado.' } }, { status: 404 })
  }

  // Guard de tenant (exceto ADMIN_MASTER)
  if (session.role !== 'ADMIN_MASTER' && agent.tenantId !== session.tenantId) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acesso negado.' } }, { status: 403 })
  }

  return NextResponse.json({ success: true, agent })
}

// PATCH /api/agents/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Acesso negado.' } }, { status: 401 })
  }

  const existing = await prisma.agent.findUnique({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Agente não encontrado.' } }, { status: 404 })
  }
  if (session.role !== 'ADMIN_MASTER' && existing.tenantId !== session.tenantId) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acesso negado.' } }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (VALID_MODELS.includes(body.model)) updates.model = body.model
  if (VALID_TONES.includes(body.tone)) updates.tone = body.tone
  if (typeof body.systemPrompt === 'string') updates.systemPrompt = body.systemPrompt
  if (typeof body.isActive === 'boolean') updates.isActive = body.isActive

  const agent = await prisma.agent.update({
    where: { id: params.id },
    data: updates,
    include: {
      tenant: { select: { id: true, nome: true } },
      _count: { select: { knowledgeBases: true, conversations: true } },
    },
  })

  return NextResponse.json({ success: true, agent })
}

// DELETE /api/agents/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session || session.role !== 'ADMIN_MASTER') {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Somente ADMIN_MASTER pode excluir agentes.' } }, { status: 403 })
  }

  await prisma.agent.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true, message: 'Agente excluído.' })
}

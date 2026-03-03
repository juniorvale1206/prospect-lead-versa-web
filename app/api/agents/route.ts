import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']

async function getSession(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : cookieToken
  if (!token) return null
  return verifyToken(token)
}

// GET /api/agents — lista agentes do tenant (ou todos para ADMIN_MASTER)
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token inválido ou expirado.' } }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acesso negado.' } }, { status: 403 })
  }

  const where = session.role === 'ADMIN_MASTER' ? {} : { tenantId: session.tenantId ?? undefined }

  const agents = await prisma.agent.findMany({
    where,
    include: {
      tenant: { select: { id: true, nome: true, slug: true } },
      _count: { select: { knowledgeBases: true, conversations: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ success: true, agents })
}

// POST /api/agents — cria agente
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token inválido ou expirado.' } }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acesso negado.' } }, { status: 403 })
  }

  const body = await req.json()
  const { name, model, tone, systemPrompt, tenantId: bodyTenantId } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Nome do agente é obrigatório.' } }, { status: 400 })
  }

  const tenantId = session.role === 'ADMIN_MASTER' ? (bodyTenantId ?? session.tenantId) : session.tenantId
  if (!tenantId) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenantId é obrigatório.' } }, { status: 400 })
  }

  const VALID_TONES = ['FORMAL', 'NORMAL', 'DESCONTRAIDA']
  const VALID_MODELS = ['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus']

  const agent = await prisma.agent.create({
    data: {
      name: name.trim(),
      model: VALID_MODELS.includes(model) ? model : 'gpt-4o-mini',
      tone: VALID_TONES.includes(tone) ? tone : 'NORMAL',
      systemPrompt: typeof systemPrompt === 'string' ? systemPrompt : '',
      tenantId,
    },
    include: {
      tenant: { select: { id: true, nome: true, slug: true } },
    },
  })

  return NextResponse.json({ success: true, agent }, { status: 201 })
}

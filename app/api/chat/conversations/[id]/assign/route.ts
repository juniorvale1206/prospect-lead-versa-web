import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function getSession(req: NextRequest) {
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) return null
  return verifyToken(cookieToken)
}

// POST /api/chat/conversations/[id]/assign — operador assume ou libera para IA
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const body = await req.json()
  const { action } = body // 'assume' | 'release'

  const conv = await prisma.conversation.findUnique({ where: { id: params.id } })
  if (!conv) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })

  if (action === 'assume') {
    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: {
        status: 'HUMAN_HANDLING',
        assignedToId: session.userId,
      },
    })
    return NextResponse.json({ success: true, conversation: updated, action: 'assumed' })
  }

  if (action === 'release') {
    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: {
        status: 'BOT_HANDLING',
        assignedToId: null,
      },
    })
    return NextResponse.json({ success: true, conversation: updated, action: 'released' })
  }

  if (action === 'resolve') {
    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: { status: 'RESOLVED' },
    })
    return NextResponse.json({ success: true, conversation: updated, action: 'resolved' })
  }

  return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'action deve ser: assume | release | resolve' } }, { status: 400 })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function getSession(req: NextRequest) {
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) return null
  return verifyToken(cookieToken)
}

// GET /api/chat/conversations/[id]/messages
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { timestamp: 'asc' },
  })

  // Marca como lidas pelo operador
  await prisma.message.updateMany({
    where: { conversationId: params.id, senderType: 'USER', read: false },
    data: { read: true },
  })

  return NextResponse.json({ success: true, messages })
}

// POST /api/chat/conversations/[id]/messages — envia mensagem humana
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

  const body = await req.json()
  const { content, senderType = 'HUMAN', messageType = 'text' } = body

  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Conteúdo é obrigatório.' } }, { status: 400 })
  }

  const conv = await prisma.conversation.findUnique({ where: { id: params.id } })
  if (!conv) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })

  const message = await prisma.message.create({
    data: {
      conversationId: params.id,
      senderType,
      senderName: senderType === 'HUMAN' ? session.nome : 'Bot IA',
      content: content.trim(),
      messageType,
    },
  })

  // Atualiza updatedAt da conversa para subir na lista
  await prisma.conversation.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  })

  // ── WebSocket / Socket.io ──────────────────────────────────────────────
  // TODO: Após salvar a mensagem, emitir evento via Socket.io para todos
  // os clientes conectados nessa conversa:
  //   io.to(`conv:${params.id}`).emit('new_message', {
  //     conversationId: params.id,
  //     message,
  //   })
  //
  // Setup recomendado para Next.js App Router:
  //   1. Criar servidor Socket.io em processo separado (porta 3001)
  //      usando `server.js` com `@socket.io/cluster-adapter`
  //   2. No frontend (ChatInbox), conectar via:
  //      const socket = io('http://localhost:3001')
  //      socket.on('new_message', (data) => { ... atualizar state ... })
  //   3. Para produção na Vercel/Cloudflare: usar Ably, Pusher ou
  //      Cloudflare Durable Objects para WebSocket gerenciado
  // ─────────────────────────────────────────────────────────────────────

  return NextResponse.json({ success: true, message }, { status: 201 })
}

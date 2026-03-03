import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function getSession(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : cookieToken
  if (!token) return null
  return verifyToken(token)
}

// GET /api/agents/[id]/knowledge — lista base de conhecimento
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const items = await prisma.knowledgeBase.findMany({
    where: { agentId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ success: true, items })
}

// POST /api/agents/[id]/knowledge — adiciona item de conhecimento
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const agent = await prisma.agent.findUnique({ where: { id: params.id } })
  if (!agent) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Agente não encontrado.' } }, { status: 404 })
  }
  if (session.role !== 'ADMIN_MASTER' && agent.tenantId !== session.tenantId) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })
  }

  const body = await req.json()
  const { type, content, title } = body

  const VALID_TYPES = ['TEXT', 'WEBSITE', 'DOCUMENT']
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tipo inválido. Use TEXT, WEBSITE ou DOCUMENT.' } }, { status: 400 })
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Conteúdo é obrigatório.' } }, { status: 400 })
  }

  // ── RAG / Embeddings ──────────────────────────────────────────────────────
  // TODO: Antes de salvar, enviar `content` para OpenAI Embeddings API:
  //   const embResponse = await openai.embeddings.create({
  //     model: 'text-embedding-3-small',
  //     input: content,
  //   })
  //   const vector = embResponse.data[0].embedding   // float[] com 1536 dims
  //
  // Armazenar no Pinecone (ou pgvector) com namespace = agentId:
  //   await pinecone.index('prospeclead').upsert([{
  //     id: knowledgeItem.id,
  //     values: vector,
  //     metadata: { agentId: params.id, type, title },
  //   }])
  //
  // Recuperação na geração de resposta (similarity search):
  //   const queryVec = await openai.embeddings.create({ model: 'text-embedding-3-small', input: userMessage })
  //   const results  = await pinecone.index('prospeclead').query({
  //     topK: 5, vector: queryVec.data[0].embedding, filter: { agentId: params.id }
  //   })
  //   const context = results.matches.map(m => m.metadata.content).join('\n\n')
  //   // Injetar `context` no systemPrompt antes de chamar o LLM
  // ─────────────────────────────────────────────────────────────────────────

  const item = await prisma.knowledgeBase.create({
    data: {
      agentId: params.id,
      type,
      content: content.trim(),
      title: typeof title === 'string' ? title.trim() : content.trim().slice(0, 60),
      status: 'PENDING', // → 'TRAINED' após processo de embedding acima
    },
  })

  // Simula processamento de embedding (em produção: disparar fila/worker)
  await prisma.knowledgeBase.update({
    where: { id: item.id },
    data: { status: 'TRAINED' },
  })

  return NextResponse.json({ success: true, item: { ...item, status: 'TRAINED' } }, { status: 201 })
}

// DELETE /api/agents/[id]/knowledge — remove item específico por query param ?itemId=
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }

  const itemId = req.nextUrl.searchParams.get('itemId')
  if (!itemId) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'itemId é obrigatório.' } }, { status: 400 })
  }

  const item = await prisma.knowledgeBase.findUnique({ where: { id: itemId } })
  if (!item || item.agentId !== params.id) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
  }

  await prisma.knowledgeBase.delete({ where: { id: itemId } })
  return NextResponse.json({ success: true, message: 'Item removido.' })
}

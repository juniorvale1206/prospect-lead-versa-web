/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Lead Qualification Service — Motor de Qualificação IA em Background
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Fluxo:
 *   1. Após cada mensagem salva, checkAndQualify() verifica se é hora de rodar
 *      (a cada QUALIFY_EVERY_N_MESSAGES trocas desde a última qualificação)
 *   2. Se sim, busca o histórico recente da conversa (últimas N mensagens)
 *   3. Envia para gpt-4o-mini com System Prompt de analista de vendas
 *   4. Salva resultado no banco: leadTemperature, buyingIntent, mainObjection, engagementScore
 *   5. Atualiza fallbackRequested se o lead pediu humano no texto
 *
 * Em produção com BullMQ:
 *   - O POST /messages insere job na fila (não bloqueia a request HTTP)
 *   - Worker consome o job em processo separado
 *   - Resultado atualiza a UI via Server-Sent Events ou polling
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from '@/lib/prisma'

/* ─── Constantes ──────────────────────────────────────────────────────────── */
const QUALIFY_EVERY_N_MESSAGES = 4        // Qualifica a cada 4 trocas
const HISTORY_WINDOW            = 12      // Usa as últimas 12 mensagens do histórico
const QUALIFICATION_TIMEOUT_MS  = 8_000  // Timeout da chamada OpenAI

/* ─── Tipos ───────────────────────────────────────────────────────────────── */
export interface QualificationResult {
  temperature:      'COLD' | 'WARM' | 'HOT'
  buyingIntent:     string
  mainObjection:    string
  engagementScore:  number   // 0-100
  summary:          string   // resumo em 1 linha
  shouldFallback:   boolean  // detectou pedido de humano
}

export interface QualificationOutcome {
  ran:     boolean
  result?: QualificationResult
  error?:  string
}

/* ─── Palavras-chave que indicam pedido de transbordo humano ─────────────── */
const FALLBACK_KEYWORDS = [
  'atendente', 'humano', 'pessoa', 'consultor', 'vendedor',
  'falar com alguém', 'falar com alguem', 'quero falar', 'preciso falar',
  'não quero bot', 'nao quero bot', 'suporte humano', 'responsável',
  'responsavel', 'gerente',
]

function detectFallbackRequest(text: string): boolean {
  const lower = text.toLowerCase()
  return FALLBACK_KEYWORDS.some(kw => lower.includes(kw))
}

/* ─── Formata histórico para o prompt ────────────────────────────────────── */
function buildChatLog(messages: Array<{ senderType: string; senderName: string; content: string }>): string {
  return messages
    .filter(m => !m.content.startsWith('[Sistema]'))
    .map(m => {
      const role = m.senderType === 'USER' ? `🧑 ${m.senderName}` :
                   m.senderType === 'BOT'  ? '🤖 IA' : `👤 ${m.senderName}`
      return `${role}: ${m.content}`
    })
    .join('\n')
}

/* ─── System Prompt oculto de qualificação ───────────────────────────────── */
const QUALIFICATION_SYSTEM_PROMPT = `
Você é um analista sênior de vendas B2B especializado no mercado de telemetria, 
rastreamento veicular e IoT para frotas (mineração, logística, transporte pesado).

Analise o log de chat fornecido e retorne EXCLUSIVAMENTE um JSON válido com:

{
  "temperature": "COLD" | "WARM" | "HOT",
  "buyingIntent": "string curta (máx 80 chars) descrevendo a intenção principal",
  "mainObjection": "string curta (máx 80 chars) com a principal objeção ou dúvida",
  "engagementScore": number (0-100, onde 100 = extremamente engajado/pronto para comprar),
  "summary": "string de 1 linha resumindo o lead e o momento da conversa",
  "shouldFallback": boolean (true se o lead solicitou explicitamente falar com humano)
}

Critérios de temperatura:
- COLD: Apenas curiosidade, sem sinalizar urgência ou orçamento
- WARM: Perguntou sobre preços, prazos, funcionalidades específicas ou demonstração
- HOT: Pediu proposta, agenda, mencionou frota/quantidade específica, deu telefone/email

NÃO inclua nenhum texto fora do JSON. NÃO use markdown. Retorne apenas o objeto JSON.
`.trim()

/* ─── Chamada à API OpenAI ────────────────────────────────────────────────── */
async function callOpenAI(chatLog: string): Promise<QualificationResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // Fallback determinístico sem API key (para demo/dev sem configuração)
    return buildFallbackResult(chatLog)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), QUALIFICATION_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,         // baixa temperatura = respostas mais consistentes
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: QUALIFICATION_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: `LOG DO CHAT:\n\n${chatLog}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI API ${response.status}: ${err.slice(0, 100)}`)
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }

    const raw = data.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(raw) as QualificationResult

    // Validar e sanitizar campos
    return {
      temperature:     ['COLD', 'WARM', 'HOT'].includes(parsed.temperature) ? parsed.temperature : 'COLD',
      buyingIntent:    (parsed.buyingIntent   || '').slice(0, 120),
      mainObjection:   (parsed.mainObjection  || '').slice(0, 120),
      engagementScore: Math.max(0, Math.min(100, Number(parsed.engagementScore) || 0)),
      summary:         (parsed.summary        || '').slice(0, 200),
      shouldFallback:  Boolean(parsed.shouldFallback),
    }
  } finally {
    clearTimeout(timeout)
  }
}

/* ─── Fallback heurístico (sem API key) ──────────────────────────────────── */
function buildFallbackResult(chatLog: string): QualificationResult {
  const lower = chatLog.toLowerCase()
  const hotKeywords  = ['proposta', 'orçamento', 'orcamento', 'agendar', 'instalar', 'contratar', 'veículos', 'frota', 'caminhões', 'quantidade']
  const warmKeywords = ['quanto custa', 'preço', 'preco', 'funcionalidade', 'demo', 'funciona como', 'tem sensor', 'atende']
  const coldKeywords = ['informação', 'informacao', 'curioso', 'pesquisando', 'vi no instagram']

  const hotScore  = hotKeywords.filter(k => lower.includes(k)).length
  const warmScore = warmKeywords.filter(k => lower.includes(k)).length

  const temperature: 'COLD' | 'WARM' | 'HOT' =
    hotScore >= 2 ? 'HOT' : warmScore >= 1 || hotScore >= 1 ? 'WARM' : 'COLD'

  const engagementScore = Math.min(100, (hotScore * 25) + (warmScore * 15) + 10)

  return {
    temperature,
    buyingIntent:   hotScore >= 2 ? 'Interesse em contratação imediata' :
                    warmScore >= 1 ? 'Avaliando soluções e preços' : 'Pesquisa inicial',
    mainObjection:  lower.includes('caro') || lower.includes('valor') ? 'Objeção de preço' :
                    lower.includes('concorrente') ? 'Comparando com concorrentes' : 'Aguardando mais informações',
    engagementScore,
    summary:        `Lead ${temperature} — ${engagementScore}% engajamento`,
    shouldFallback: detectFallbackRequest(chatLog),
  }
}

/* ─── Função principal: verifica + qualifica ─────────────────────────────── */
export async function checkAndQualify(conversationId: string): Promise<QualificationOutcome> {
  try {
    // 1. Buscar estado atual da conversa
    const conv = await prisma.$queryRaw<Array<{
      id: string
      messagesSinceLastQualification: number
      status: string
      tenantId: string | null
    }>>`
      SELECT id, messagesSinceLastQualification, status, tenantId
      FROM Conversation WHERE id = ${conversationId}
    `

    if (!conv.length) return { ran: false, error: 'Conversa não encontrada' }
    const c = conv[0]

    // 2. Verificar se deve qualificar agora
    const newCount = (c.messagesSinceLastQualification || 0) + 1
    if (newCount < QUALIFY_EVERY_N_MESSAGES) {
      // Incrementar contador mas não qualificar ainda
      await prisma.$executeRaw`
        UPDATE Conversation 
        SET messagesSinceLastQualification = ${newCount}
        WHERE id = ${conversationId}
      `
      return { ran: false }
    }

    // 3. Buscar histórico recente (exclui notas internas)
    const messages = await prisma.$queryRaw<Array<{
      senderType: string; senderName: string; content: string
    }>>`
      SELECT senderType, senderName, content
      FROM Message
      WHERE conversationId = ${conversationId}
        AND isInternalNote = 0
      ORDER BY timestamp DESC
      LIMIT ${HISTORY_WINDOW}
    `

    if (messages.length < 2) return { ran: false }

    const chatLog = buildChatLog([...messages].reverse())

    // 4. Chamar OpenAI
    const result = await callOpenAI(chatLog)

    // 5. Salvar resultado no banco
    const now = new Date().toISOString()
    await prisma.$executeRaw`
      UPDATE Conversation SET
        leadTemperature    = ${result.temperature},
        buyingIntent       = ${result.buyingIntent},
        mainObjection      = ${result.mainObjection},
        engagementScore    = ${result.engagementScore},
        messagesSinceLastQualification = 0,
        lastQualifiedAt    = ${now},
        fallbackRequested  = CASE WHEN ${result.shouldFallback ? 1 : 0} = 1 THEN 1 ELSE fallbackRequested END,
        status             = CASE 
          WHEN ${result.shouldFallback ? 1 : 0} = 1 THEN 'WAITING'
          ELSE status 
        END
      WHERE id = ${conversationId}
    `

    console.log(`[Qualification] conv=${conversationId} temp=${result.temperature} score=${result.engagementScore} fallback=${result.shouldFallback}`)

    return { ran: true, result }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Qualification] Error:', msg)
    return { ran: false, error: msg }
  }
}

/* ─── Forçar qualificação imediata (para uso em endpoints) ──────────────── */
export async function forceQualify(conversationId: string): Promise<QualificationOutcome> {
  // Reset contador para forçar execução
  await prisma.$executeRaw`
    UPDATE Conversation SET messagesSinceLastQualification = ${QUALIFY_EVERY_N_MESSAGES - 1}
    WHERE id = ${conversationId}
  `
  return checkAndQualify(conversationId)
}

/* ─── Expor constante para uso externo ───────────────────────────────────── */
export { QUALIFY_EVERY_N_MESSAGES, FALLBACK_KEYWORDS }

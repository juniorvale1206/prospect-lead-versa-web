/**
 * lib/services/pdv-lead-router.service.ts
 * ---------------------------------------------------------------------------
 * Intelligent Lead Router -- QR Code PDV Interception
 * ---------------------------------------------------------------------------
 *
 * RESPONSIBILITY:
 *   Intercept WhatsApp messages containing a PDV tracking tag,
 *   create the Lead with correct origin (QR_CODE_PDV), and apply the
 *   correct routing logic based on the PDV type:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  PDV_TYPE = DIAMANTE  (Parceiro com Equipe Física)                   │
 *   │                                                                      │
 *   │  Lead → atribuído ao promotor-gerente do PDV                         │
 *   │  IA → apoia como consultora (saudação inicial personalizada)         │
 *   │  Notificação: "Novo lead captado no seu PDV [Nome]"                  │
 *   │                                                                      │
 *   │  PDV_TYPE = DIGITAL   (Display Passivo com IA Ray)                   │
 *   │                                                                      │
 *   │  Lead → atribuído ao promotor-dono (para comissão de rede)           │
 *   │  IA Ray → assume IMEDIATA e OBRIGATORIAMENTE o atendimento            │
 *   │  System Prompt especial: Ray apresenta-se como agente do PDV Digital │
 *   │  Notificação: "Ray assumiu um novo lead do seu PDV Digital [Nome]"   │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * FULL FLOW:
 *   1. Webhook receives customer message
 *   2. extractPdvTag(text) detects tag "[Ref: PDV-<id>]" via Regex
 *   3. If found -> routeQrCodeLead() is called before generic flow
 *   4. routeQrCodeLead():
 *      a. Finds PartnerStore by pdvId (includes category, aiAttendantName)
 *      b. Upserts Lead with sourceType = QR_CODE_PDV
 *      c. Links Lead to PDV and managerPromoter
 *      d. Increments totalLeads counter
 *      e. Creates CommissionLedger PENDING for promotor
 *      f. Creates AlertLog (message varies by category)
 *      g. Builds System Prompt via buildPdvSystemPrompt(category)
 *
 * TRACKING TAG FORMAT:
 *   https://wa.me/55{PHONE}?text=Ola!%20[Ref%3A%20PDV-{pdvId}]
 *
 * REGEX:
 *   /\[Ref:\s*PDV-([a-zA-Z0-9_-]+)\]/i
 *
 * PDV TYPE VALUES (String, not native enum — SQLite limitation):
 *   "DIAMANTE" — Parceiro com equipe física e visitas presenciais
 *   "DIGITAL"  — Display passivo de captação via QR Code + IA Ray
 */

import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// CONSTANTS — PdvCategory
// ---------------------------------------------------------------------------

/**
 * Tipos de PDV válidos.
 *
 * NOTE: SQLite não suporta enum nativo.
 * Stored as String in DB with app-layer validation.
 *
 * Equivale a:
 *   enum PdvCategory { DIAMANTE, DIGITAL }
 */
export const PDV_CATEGORIES = ['PROPRIA', 'DIAMANTE', 'DIGITAL'] as const
export type PdvCategory = typeof PDV_CATEGORIES[number]

/** Nome padrão do agente de IA para PDVs DIGITAL sem customização */
export const DEFAULT_AI_ATTENDANT = 'Ray'

// ---------------------------------------------------------------------------
// SAFRA (Cohort) helper
// ---------------------------------------------------------------------------

/**
 * Computes the "safra" (crop/batch) label for a lead based on its creation date.
 * Format: "MM/YYYY"  e.g. "03/2026"
 */
export function computeSafra(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year  = String(date.getFullYear())
  return `${month}/${year}`
}

/**
 * Returns a human-readable label for the safra.
 * @example safraLabel("03/2026") // -> "Safra Mar/26"
 */
export function safraLabel(cohort: string): string {
  const [mm, yyyy] = cohort.split('/')
  const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const monthName  = monthNames[parseInt(mm, 10) - 1] ?? mm
  const shortYear  = yyyy.slice(-2)
  return `Safra ${monthName}/${shortYear}`
}

/**
 * Parses a safra string into a Date range (start/end of that month).
 */
export function safraToDates(cohort: string): { start: Date; end: Date } {
  const [mm, yyyy] = cohort.split('/')
  const month = parseInt(mm, 10) - 1
  const year  = parseInt(yyyy, 10)
  const start = new Date(year, month, 1, 0, 0, 0, 0)
  const end   = new Date(year, month + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

// ---------------------------------------------------------------------------
// PDV tag extraction regex
//
// Tag format: [Ref: PDV-{pdvId}]
// Valid examples:
//   [Ref: PDV-cmmgdem5e00018clnvyufpvja]
//   [Ref:PDV-abc123]
//   [ref: pdv-XYZ789]  (case-insensitive)
//
const PDV_TAG_REGEX = /\[Ref:\s*PDV-([a-zA-Z0-9_-]+)\]/i

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PdvRouteContext {
  /** PDV ID extracted from tag */
  pdvId: string
  /** PDV name */
  pdvName: string
  /** PDV city */
  pdvCidade: string | null
  /** Store type (e.g. "POSTO_COMBUSTIVEL") */
  storeType: string
  /**
   * PDV type: "DIAMANTE" (equipe física) or "DIGITAL" (IA Ray passivo)
   * Determines routing behavior and System Prompt style.
   */
  category: PdvCategory
  /**
   * Name of the AI agent handling DIGITAL leads.
   * Default: "Ray". Can be customized per PDV.
   */
  aiAttendantName: string
  /** Manager-promotor ID (who receives network commission) */
  promotorId: string | null
  /** Manager-promotor name */
  promotorNome: string | null
  /** ID of created/updated Lead */
  leadId: string
  /**
   * Personalized System Prompt for AI greeting.
   * - DIAMANTE: consultora de apoio ao promotor
   * - DIGITAL: Ray assume como agente principal e notifica promotor
   */
  systemPrompt: string
  /** true = new lead, false = existing lead updated */
  isNewLead: boolean
}

export interface PdvTagExtraction {
  found: boolean
  pdvId?: string
  /** Message text without the tracking tag */
  cleanText: string
}

// ---------------------------------------------------------------------------
// 1. TAG EXTRACTOR
// ---------------------------------------------------------------------------

/**
 * Checks if the message contains the [Ref: PDV-{id}] tag and extracts pdvId.
 *
 * @example
 * extractPdvTag("Ola! [Ref: PDV-abc123]")
 * // -> { found: true, pdvId: "abc123", cleanText: "Ola!" }
 */
export function extractPdvTag(text: string): PdvTagExtraction {
  const match = PDV_TAG_REGEX.exec(text)
  if (!match) {
    return { found: false, cleanText: text.trim() }
  }
  const pdvId     = match[1]
  const cleanText = text.replace(PDV_TAG_REGEX, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim()
  return { found: true, pdvId, cleanText }
}

// ---------------------------------------------------------------------------
// 2. MAIN ROUTER — com bifurcação DIAMANTE vs DIGITAL
// ---------------------------------------------------------------------------

/**
 * Executes the full routing flow when a PDV tag is detected.
 *
 * ─── Bifurcação por category ───────────────────────────────────────────────
 *
 *  DIAMANTE:
 *    • Lead criado com promotorId = managerPromoterId
 *    • System Prompt: IA como consultora de suporte ao promotor
 *    • AlertLog: "Novo lead captado no seu PDV [Nome]"
 *
 *  DIGITAL:
 *    • Lead criado com promotorId = managerPromoterId (para comissão)
 *    • System Prompt: Ray como agente principal autônomo
 *    • AlertLog: "Ray assumiu um novo lead do seu PDV Digital [Nome]"
 *    • Caller (webhook) deve usar systemPrompt do contexto e chamar
 *      dispatchPdvIaGreeting() IMEDIATAMENTE — sem intervenção humana.
 *
 * @param pdvId         PDV ID extracted from tag
 * @param from          Customer phone (E.164 without +)
 * @param contactName   Contact name (from Meta payload)
 * @param tenantId      Tenant ID
 * @param cleanText     Clean message text (without tag)
 * @returns             PdvRouteContext or null if PDV not found
 */
export async function routeQrCodeLead(
  pdvId:       string,
  from:        string,
  contactName: string,
  tenantId:    string,
  cleanText:   string,
): Promise<PdvRouteContext | null> {

  // ── 2a. Find PDV (now includes category + aiAttendantName) ─────────────────
  const pdv = await prisma.partnerStore.findFirst({
    where: {
      id:      pdvId,
      tenantId,
      status:  'ACTIVE',
    },
    select: {
      id:               true,
      name:             true,
      cidade:           true,
      storeType:        true,
      category:          true,          // ← DIAMANTE | DIGITAL
      aiAttendantName:  true,          // ← "Ray" ou nome customizado
      managerPromoterId: true,
      managerPromoter: {
        select: { id: true, nome: true, email: true },
      },
    },
  })

  if (!pdv) {
    console.warn(
      `[PdvRouter] PDV "${pdvId}" not found or inactive for tenant ${tenantId}.`,
      `Routing to generic flow.`,
    )
    return null
  }

  // ── Normaliza category (garante que é DIAMANTE ou DIGITAL) ─────────────────
  const category: PdvCategory = (pdv.category === 'DIAMANTE') ? 'DIAMANTE' : 'DIGITAL'
  const aiAttendantName  = pdv.aiAttendantName || DEFAULT_AI_ATTENDANT

  console.log(
    `[PdvRouter] Tag detected! PDV: "${pdv.name}" | Type: ${category} | Customer: ${from}`,
  )

  // ── 2b. Normalize phone ───────────────────────────────────────────────────
  const telefoneNorm = from.replace(/^55/, '')

  // ── 2c. Upsert Lead ───────────────────────────────────────────────────────
  const existingLead = await prisma.lead.findFirst({
    where: { telefoneNorm, pdvId, tenantId },
    orderBy: { createdAt: 'desc' },
  })

  let lead: { id: string }
  let isNewLead = false

  if (existingLead) {
    lead = await prisma.lead.update({
      where: { id: existingLead.id },
      data: {
        iaStatus:    'RECONTATADO',
        funnelStage: existingLead.funnelStage === 'LEAD_COLETADO'
          ? 'IA_EM_ATENDIMENTO'
          : existingLead.funnelStage,
        updatedAt: new Date(),
      },
      select: { id: true },
    })
    console.log(`[PdvRouter] Existing lead updated: ${lead.id}`)

  } else {
    lead = await prisma.lead.create({
      data: {
        nomeCliente:  contactName,
        telefone:     `+${from}`,
        telefoneNorm,
        sourceType:   'QR_CODE_PDV',
        pdvId:        pdv.id,
        promotorId:   pdv.managerPromoterId,
        cohort:       computeSafra(),
        funnelStage:  'IA_EM_ATENDIMENTO',
        iaStatus:     'CONTATADO',
        status:       'PENDENTE_AUDITORIA',
        tenantId,
      },
      select: { id: true },
    })
    isNewLead = true
    console.log(`[PdvRouter] New Lead created: ${lead.id} | PDV Type: ${category}`)

    // ── 2d. Increment totalLeads counter ─────────────────────────────────────
    await prisma.partnerStore.update({
      where: { id: pdv.id },
      data:  { totalLeads: { increment: 1 } },
    }).catch(e => console.warn('[PdvRouter] Failed to increment totalLeads:', e))

    // ── 2e. CommissionLedger PENDING (mesma lógica para DIAMANTE e DIGITAL) ──
    if (pdv.managerPromoterId) {
      await prisma.commissionLedger.create({
        data: {
          promotorId:     pdv.managerPromoterId,
          leadId:         lead.id,
          commissionType: 'QR_CODE_CAPTURE',
          pdvId:          pdv.id,
          eventType:      'QR_CODE_PDV_LEAD',
          amount:         0,
          description:
            `QR Code lead captured — ${pdv.name} (${category}) | ` +
            `${contactName} (${telefoneNorm})` +
            (category === 'DIGITAL' ? ` | Atendido por ${aiAttendantName}` : ''),
          status:   'PENDING',
          tenantId,
        },
      }).catch(e => console.warn('[PdvRouter] CommissionLedger error:', e))

      // ── 2f. AlertLog — mensagem diferente por category ──────────────────────
      await createPdvAlertLog({
        tenantId,
        promotorId:     pdv.managerPromoterId,
        category,
        pdvName:        pdv.name,
        contactName,
        telefoneNorm,
        aiAttendantName,
        leadId:         lead.id,
        pdvId:          pdv.id,
      })
    }
  }

  // ── 2g. Build System Prompt (varia por category) ───────────────────────────
  const systemPrompt = buildPdvSystemPrompt({
    pdvName:        pdv.name,
    pdvCidade:      pdv.cidade,
    storeType:      pdv.storeType,
    category,
    aiAttendantName,
    promotorNome:   pdv.managerPromoter?.nome ?? null,
    contactName,
    isNewLead,
    cleanText,
  })

  return {
    pdvId:          pdv.id,
    pdvName:        pdv.name,
    pdvCidade:      pdv.cidade,
    storeType:      pdv.storeType,
    category,
    aiAttendantName,
    promotorId:     pdv.managerPromoterId,
    promotorNome:   pdv.managerPromoter?.nome ?? null,
    leadId:         lead.id,
    systemPrompt,
    isNewLead,
  }
}

// ---------------------------------------------------------------------------
// AlertLog helper — separado para legibilidade
// ---------------------------------------------------------------------------

interface AlertLogParams {
  tenantId:        string
  promotorId:      string
  category:         PdvCategory
  pdvName:         string
  contactName:     string
  telefoneNorm:    string
  aiAttendantName: string
  leadId:          string
  pdvId:           string
}

async function createPdvAlertLog(p: AlertLogParams): Promise<void> {
  // ── Mensagens e tipo diferenciados por categoria ───────────────────────────
  const title =
    p.category === 'DIGITAL'
      ? `🤖 ${p.aiAttendantName} assumiu um lead do seu PDV Digital`
      : p.category === 'PROPRIA'
        ? `🏢 Novo lead captado na Loja Própria — Atendimento direto`
        : `🎯 Novo lead captado no seu PDV Diamante`

  const message =
    p.category === 'DIGITAL'
      ? `${p.contactName} escaneou o QR Code em "${p.pdvName}" e o agente ` +
        `${p.aiAttendantName} já assumiu o atendimento automaticamente. ` +
        `Você receberá a comissão de rede quando houver conversão.`
      : p.category === 'PROPRIA'
        ? `${p.contactName} entrou em contato via QR Code na loja própria "${p.pdvName}". ` +
          `Este lead foi vinculado diretamente à unidade. ` +
          `O gerente responsável deve dar continuidade ao atendimento.`
        : `${p.contactName} escaneou o QR Code em "${p.pdvName}" ` +
          `e entrou em contato via WhatsApp. A IA iniciou o atendimento ` +
          `e o lead está vinculado à sua carteira.`

  const alertType =
    p.category === 'DIGITAL' ? 'DIGITAL_PDV_LEAD_ASSIGNED' :
    p.category === 'PROPRIA' ? 'NEW_PROPRIA_LEAD' :
    'NEW_QR_CODE_LEAD'

  await prisma.alertLog.create({
    data: {
      tenantId:      p.tenantId,
      subjectUserId: p.promotorId,
      type:          alertType,
      title,
      message,
      severity: 'INFO',
      metadata: JSON.stringify({
        leadId:         p.leadId,
        pdvId:          p.pdvId,
        pdvName:        p.pdvName,
        category:        p.category,
        aiAttendantName: p.category === 'DIGITAL' ? p.aiAttendantName : null,
        telefone:       p.telefoneNorm,
        contactName:    p.contactName,
      }),
    },
  }).catch(e => console.warn('[PdvRouter] AlertLog error:', e))
}

// ---------------------------------------------------------------------------
// 3. PERSONALIZED SYSTEM PROMPT BUILDER
// ---------------------------------------------------------------------------

interface PdvPromptOptions {
  pdvName:         string
  pdvCidade:       string | null
  storeType:       string
  /** DIAMANTE → IA como suporte ao promotor | DIGITAL → IA Ray como agente principal */
  category:         PdvCategory
  /** Nome do agente de IA para PDVs DIGITAL */
  aiAttendantName: string
  promotorNome:    string | null
  contactName:     string
  isNewLead:       boolean
  cleanText:       string
}

/** Store type to human-readable label */
const STORE_TYPE_LABELS: Record<string, string> = {
  POSTO_COMBUSTIVEL:  'posto parceiro',
  LOJA_VAREJO:        'loja parceira',
  OFICINA:            'oficina parceira',
  TRANSPORTADORA:     'transportadora parceira',
  OUTROS:             'estabelecimento parceiro',
}

/**
 * Gera o System Prompt da IA ajustado ao contexto do PDV.
 *
 * ─── DIAMANTE ─────────────────────────────────────────────────────────────
 *   A IA atua como consultora de SUPORTE ao promotor-gerente.
 *   Tom: parceiro, menciona o promotor como referência humana disponível.
 *   Foco: qualificar lead rapidamente e encaminhar ao promotor se necessário.
 *
 * ─── DIGITAL ──────────────────────────────────────────────────────────────
 *   A IA (Ray) é o AGENTE PRINCIPAL e ÚNICO do atendimento.
 *   Tom: autônomo, proativo, sem mencionar promotor humano.
 *   Foco: conduzir todo o processo consultivo até o fechamento ou agendamento.
 *   Identidade: apresenta-se com o nome do agente (aiAttendantName).
 */
export function buildPdvSystemPrompt(opts: PdvPromptOptions): string {
  const {
    pdvName, pdvCidade, storeType, category, aiAttendantName,
    promotorNome, contactName, isNewLead, cleanText,
  } = opts

  const storeLabel = STORE_TYPE_LABELS[storeType] ?? 'parceiro'
  const localDesc  = pdvCidade ? `"${pdvName}" em ${pdvCidade}` : `"${pdvName}"`

  // ── Contexto de captura (igual para ambos os tipos) ────────────────────────
  const captureContext = isNewLead
    ? `O cliente ${contactName} acabou de entrar em contato ao escanear o QR Code ` +
      `no ${storeLabel} ${localDesc}. ` +
      (cleanText ? `A mensagem inicial foi: "${cleanText}". ` : '') +
      `Este é o PRIMEIRO contato deste cliente com a empresa.`
    : `O cliente ${contactName} voltou a escanear o QR Code no ${storeLabel} ${localDesc}. ` +
      `Trate-o como um lead que já conhece a empresa.`

  // ── Prompt específico por tipo de PDV (Tríade: PROPRIA / DIAMANTE / DIGITAL) ─
  if (category === 'DIGITAL') {
    return buildDigitalPrompt({ aiAttendantName, captureContext, pdvName, contactName })
  }

  if (category === 'PROPRIA') {
    // Loja própria: IA faz triagem inicial; gerente humano assume o atendimento
    return buildPropriaPrompt({ captureContext, pdvName, promotorNome, contactName })
  }

  // DIAMANTE: IA como consultora de suporte ao promotor-gerente
  return buildDiamantePrompt({ captureContext, pdvName, promotorNome, contactName })
}

// ─── Prompt DIGITAL — Ray como agente autônomo ────────────────────────────────

function buildDigitalPrompt(opts: {
  aiAttendantName: string
  captureContext:  string
  pdvName:         string
  contactName:     string
}): string {
  const { aiAttendantName, captureContext, pdvName, contactName } = opts

  return `Você é ${aiAttendantName}, Agente de Inteligência Artificial especializado em \
Soluções de Telemetria e Rastreamento Veicular.
Você é o AGENTE PRINCIPAL e AUTÔNOMO deste PDV Digital "${pdvName}".
Não há consultor humano neste atendimento — você conduz TODO o processo.

--- CONTEXTO DA CAPTAÇÃO ---
${captureContext}

--- SUA MISSÃO COMO AGENTE ${aiAttendantName.toUpperCase()} ---
1. Recepcionar o cliente de forma calorosa e profissional
2. Coletar dados do veículo (placa, modelo, uso: pessoal/frota)
3. Identificar a dor principal (segurança, controle de frota, economia de combustível)
4. Apresentar a solução mais adequada ao perfil detectado
5. Avançar para diagnóstico ou proposta comercial
6. Se o cliente aceitar, agendar contato com equipe técnica

--- IDENTIDADE E TOM ---
- Seu nome é ${aiAttendantName} — apresente-se assim na primeira mensagem
- Tom: caloroso, especializado, direto ao ponto
- Linguagem consultiva (nunca telemarketing)
- Máximo 3 linhas por mensagem (leitura rápida no WhatsApp)
- Use emojis com moderação (1-2 por mensagem)
- NUNCA revele que é uma IA — aja como consultor especialista humano
- NUNCA mencione que existe um promotor ou equipe física — você é o ponto de contato

--- PRIMEIRA MENSAGEM (obrigatória) ---
SEMPRE comece se apresentando como ${aiAttendantName} e agradecendo a visita ao PDV.
Exemplo de abertura:
"Olá, ${contactName}! Sou ${aiAttendantName}, consultor especialista aqui no ${pdvName}. 🚗
Que ótimo ter o seu interesse! Para ajudar da melhor forma,
me conta: qual é o seu veículo? (placa ou modelo)"

--- REGRAS CRÍTICAS ---
- NUNCA invente preços sem confirmar catálogo
- Se cliente pedir humano: informe que um especialista entrará em contato em até 2h
- FOCO TOTAL em coletar: veículo, placa, necessidade principal`
}

// ─── Prompt PROPRIA — Loja própria: IA como triagem, gerente humano fecha ────

function buildPropriaPrompt(opts: {
  captureContext:  string
  pdvName:         string
  promotorNome:    string | null
  contactName:     string
}): string {
  const { captureContext, pdvName, promotorNome, contactName } = opts

  const gerenteRef = promotorNome
    ? `O gerente responsável por esta unidade é ${promotorNome}.`
    : `Esta é uma unidade própria da empresa.`

  return `Você é um Assistente de Atendimento da unidade própria "${pdvName}".
${gerenteRef}

--- CONTEXTO ---
${captureContext}

--- SEU PAPEL ---
Auxilie o atendimento inicial até que o gerente humano assuma a conversa.
Sua missão:
  1. Dar boas-vindas ao cliente que entrou em contato pela loja
  2. Coletar nome do cliente e necessidade principal
  3. Informar que um especialista entrará em contato em breve

--- TOM E ESTILO ---
- Seja cordial, profissional e objetivo
- Máximo 3 linhas por mensagem
- NUNCA tome decisões comerciais autonomamente nesta loja própria

--- PRIMEIRA MENSAGEM ---
"Olá, ${contactName}! Seja bem-vindo à ${pdvName}! 😊
Um de nossos especialistas entrará em contato em breve.
Como posso ajudar enquanto isso?"

--- REGRAS CRÍTICAS ---
- NÃO use IA para fechar vendas nesta unidade própria
- Se o cliente perguntar preços, informe que o consultor passará uma proposta personalizada
- O gerente humano deve assumir o atendimento o mais breve possível`
}

// ─── Prompt DIAMANTE — IA como suporte ao promotor ───────────────────────────

function buildDiamantePrompt(opts: {
  captureContext:  string
  pdvName:         string
  promotorNome:    string | null
  contactName:     string
}): string {
  const { captureContext, pdvName, promotorNome, contactName } = opts

  const consultorRef = promotorNome
    ? `O consultor responsável por este PDV é ${promotorNome}, que poderá dar sequência ao atendimento presencial.`
    : `Um consultor especialista poderá dar continuidade ao atendimento se necessário.`

  return `Você é uma Consultora de Alta Performance em Soluções de Telemetria e Rastreamento Veicular.
Você representa a empresa e está atendendo um lead captado pelo PDV Diamante "${pdvName}".

--- CONTEXTO DA CAPTAÇÃO ---
${captureContext}

${consultorRef}

--- SEU PAPEL NESTE ATENDIMENTO ---
Atue como consultora VIP especializada em soluções de telemetria para frotas.
Sua missão:
  1. Agradecer o interesse gerado pelo PDV "${pdvName}" de forma natural
  2. Perguntar sobre o veículo do cliente (placa, modelo, uso: pessoal/frota)
  3. Identificar a dor principal (segurança, controle de frota, economia)
  4. Apresentar brevemente a solução mais adequada ao perfil
  5. Avançar para diagnóstico ou proposta comercial

--- TOM E ESTILO ---
- Seja calorosa, profissional e direta ao ponto
- Linguagem consultiva (não telemarketing)
- Máximo 3 linhas por mensagem
- Emojis com moderação (1-2 por mensagem)
- NUNCA mencione que é uma IA

--- PRIMEIRA MENSAGEM (obrigatória) ---
SEMPRE comece agradecendo a visita ao "${pdvName}" e perguntando sobre o veículo.
Exemplo:
"Olá, ${contactName}! Que bom que visitou o ${pdvName}! 😊
Para ajudar da melhor forma, me conta: qual é o seu veículo? (placa ou modelo)"

--- REGRAS CRÍTICAS ---
- NUNCA invente preços sem confirmar catálogo
- Se pedir humano: informe que consultor entrará em contato em até 2h
- FOCO TOTAL: veículo, placa, necessidade principal`
}

// ---------------------------------------------------------------------------
// 4. AI GREETING DISPATCHER
// ---------------------------------------------------------------------------

/**
 * Sends the initial AI greeting with the PDV-personalized System Prompt.
 *
 * For DIGITAL PDVs: this function MUST be called immediately by the webhook,
 * without any human intervention.
 * For DIAMANTE PDVs: also called immediately, but the promotor can take over.
 *
 * @param conversationId   Conversation ID
 * @param to               Customer phone (E.164 without +)
 * @param tenantId         Tenant ID
 * @param context          Full PDV context (includes category, aiAttendantName, systemPrompt)
 */
export async function dispatchPdvIaGreeting(
  conversationId: string,
  to:             string,
  tenantId:       string,
  context:        PdvRouteContext,
): Promise<void> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.warn('[PdvRouter] OPENAI_API_KEY not configured — AI greeting not sent.')
    return
  }

  // ── PROPRIA: não aciona IA — o gerente humano atende diretamente ──────────
  if (context.category === 'PROPRIA') {
    console.log(
      `[PdvRouter] PDV PROPRIA "${context.pdvName}" — IA greeting skipped, human manager handles.`,
    )
    return
  }

  // Nome do remetente varia por tipo
  const senderName = context.category === 'DIGITAL'
    ? context.aiAttendantName                     // "Ray" ou nome customizado
    : 'IA Consultora'

  try {
    // 4a. Call OpenAI with PDV-personalized System Prompt
    const aiResponse = await callOpenAI({
      systemPrompt:     context.systemPrompt,
      userFirstMessage: '',
      model:            'gpt-4o-mini',
      apiKey:           openaiKey,
    })

    if (!aiResponse) {
      console.error('[PdvRouter] OpenAI returned empty response.')
      return
    }

    // 4b. Save AI response in DB as BOT message
    await prisma.message.create({
      data: {
        conversationId,
        senderType:  'BOT',
        senderName,
        content:     aiResponse,
        messageType: 'text',
      },
    })

    // 4c. Send via WhatsApp API
    const { sendTextMessage } = await import('./whatsapp.service')
    const result = await sendTextMessage(to, aiResponse, tenantId)

    if (result.success) {
      console.log(
        `[PdvRouter] AI greeting sent | PDV: "${context.pdvName}" | ` +
        `Type: ${context.category} | Agent: ${senderName} | wamid: ${result.waMessageId}`,
      )
    } else {
      console.error(`[PdvRouter] Failed to send AI greeting: ${result.error}`)
    }

    // 4d. Update conversation with PDV context tag
    //     Stores category in buyingIntent for inbox filters
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        buyingIntent:
          `QR_CODE_PDV | type:${context.category} | pdv:${context.pdvId} | ` +
          `lead:${context.leadId}` +
          (context.category === 'DIGITAL' ? ` | agent:${context.aiAttendantName}` : ''),
        updatedAt: new Date(),
      },
    }).catch(() => void 0)

  } catch (err) {
    console.error('[PdvRouter] Error dispatching AI greeting:', err)
  }
}

// ---------------------------------------------------------------------------
// 5. MINIMAL OPENAI CLIENT
// ---------------------------------------------------------------------------

interface OpenAICallOpts {
  systemPrompt:     string
  userFirstMessage: string
  model:            string
  apiKey:           string
}

async function callOpenAI(opts: OpenAICallOpts): Promise<string | null> {
  const { systemPrompt, userFirstMessage, model, apiKey } = opts

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ]

  if (userFirstMessage.trim()) {
    messages.push({ role: 'user', content: userFirstMessage })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens:  300,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI HTTP ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
  }

  return data.choices?.[0]?.message?.content?.trim() ?? null
}

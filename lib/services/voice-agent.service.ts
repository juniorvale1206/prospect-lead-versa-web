/**
 * VoiceAgentService — ProspecLead CRM
 * Integração com Vapi.ai para ligações outbound com IA
 *
 * Fluxo:
 *  1. dispatchAiCall(leadId, agentId, dispatchedById) → cria CallLog QUEUED → POST Vapi
 *  2. Vapi executa a ligação e chama /api/webhooks/voice com eventos
 *  3. webhookHandler persiste status, gravação, transcrição e resumo
 *  4. Se a IA acionar agendar_reuniao → meetingScheduled=true + meetingScheduledAt
 */

import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
export interface DispatchResult {
  success:       boolean
  callLogId:     string
  providerCallId?: string
  error?:        string
}

export interface VapiCallPayload {
  assistantId?:        string     // assistente pré-configurado no Vapi
  assistant?:          VapiInlineAssistant // ou inline
  customer:            VapiCustomer
  phoneNumberId?:      string     // número de saída registrado no Vapi
  name?:               string     // nome da chamada para logs
  metadata?:           Record<string, string>
}

interface VapiInlineAssistant {
  model:           VapiModel
  voice:           VapiVoice
  firstMessage:    string
  endCallPhrases:  string[]
  tools?:          VapiTool[]
  recordingEnabled?: boolean
  transcriptPlan?: { enabled: boolean }
  analysisPlan?:   VapiAnalysisPlan
  metadata?:       Record<string, string>
}

interface VapiModel {
  provider:          'openai' | 'anthropic' | 'google'
  model:             string
  temperature?:      number
  maxTokens?:        number
  systemPrompt:      string
  emotionRecognitionEnabled?: boolean
}

interface VapiVoice {
  provider:          'elevenlabs' | '11labs' | 'azure' | 'deepgram' | 'cartesia'
  voiceId:           string
  stability?:        number
  similarityBoost?:  number
  speed?:            number
}

interface VapiCustomer {
  number:   string   // E.164: +5511999998888
  name?:    string
  email?:   string
}

interface VapiTool {
  type:        'function'
  function:    VapiFunctionDef
  async?:      boolean
  server?:     { url: string; timeoutSeconds?: number }
}

interface VapiFunctionDef {
  name:        string
  description: string
  parameters:  {
    type:       'object'
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required:   string[]
  }
}

interface VapiAnalysisPlan {
  summaryPrompt:     string
  successEvaluationPrompt: string
  successEvaluationRubric: 'NumericScale'
  structuredDataSchema?: {
    type:       'object'
    properties: Record<string, { type: string; description: string }>
    required:   string[]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: agendar_reuniao
// ─────────────────────────────────────────────────────────────────────────────
const TOOL_AGENDAR_REUNIAO: VapiTool = {
  type: 'function',
  function: {
    name: 'agendar_reuniao',
    description:
      'Agenda uma reunião/demo com o lead quando ele confirmar disponibilidade. ' +
      'Chame esta função imediatamente ao obter confirmação de data e hora.',
    parameters: {
      type: 'object',
      properties: {
        data_hora: {
          type: 'string',
          description:
            'Data e hora da reunião no formato ISO 8601 (ex.: 2024-03-15T14:00:00-03:00)',
        },
        formato: {
          type: 'string',
          description: 'Formato da reunião: videochamada, presencial ou ligação',
          enum: ['videochamada', 'presencial', 'ligacao'],
        },
        observacoes: {
          type: 'string',
          description: 'Observações adicionais do lead (dúvidas, preferências)',
        },
      },
      required: ['data_hora', 'formato'],
    },
  },
  async: false,
  // Webhook que o Vapi chama em tempo real para confirmar o agendamento
  server: {
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://api.prospeclead.com'}/api/webhooks/voice/tool`,
    timeoutSeconds: 10,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL: coletar_dados_frota
// ─────────────────────────────────────────────────────────────────────────────
const TOOL_COLETAR_FROTA: VapiTool = {
  type: 'function',
  function: {
    name: 'coletar_dados_frota',
    description:
      'Registra informações sobre a frota do lead durante a ligação para qualificação.',
    parameters: {
      type: 'object',
      properties: {
        tamanho_frota: {
          type: 'string',
          description: 'Número aproximado de veículos na frota',
        },
        tipo_veiculo: {
          type: 'string',
          description: 'Tipo principal de veículo (caminhão, van, ônibus, carro)',
        },
        problema_principal: {
          type: 'string',
          description: 'Principal dor ou problema relatado pelo lead',
        },
      },
      required: ['tamanho_frota'],
    },
  },
  async: true,
  server: {
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://api.prospeclead.com'}/api/webhooks/voice/tool`,
    timeoutSeconds: 5,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYSIS PLAN
// ─────────────────────────────────────────────────────────────────────────────
const ANALYSIS_PLAN: VapiAnalysisPlan = {
  summaryPrompt:
    'Resuma a ligação em até 3 frases: (1) Situação do lead, (2) Principal objeção ou interesse, ' +
    '(3) Próximo passo combinado. Use português brasileiro e seja objetivo.',
  successEvaluationPrompt:
    'De 0 a 10, avalie o sucesso da ligação considerando: engajamento do lead, ' +
    'qualidade das informações coletadas e probabilidade de conversão.',
  successEvaluationRubric: 'NumericScale',
  structuredDataSchema: {
    type: 'object',
    properties: {
      temperatura: {
        type: 'string',
        description: 'Temperatura do lead: COLD, WARM ou HOT',
      },
      intencao_compra: {
        type: 'string',
        description: 'Breve descrição da intenção de compra identificada',
      },
      objecao_principal: {
        type: 'string',
        description: 'Principal objeção ou barreira mencionada pelo lead',
      },
      reuniao_agendada: {
        type: 'string',
        description: 'true se reunião foi agendada, false caso contrário',
      },
      data_reuniao: {
        type: 'string',
        description: 'Data/hora da reunião em ISO 8601 (se agendada)',
      },
    },
    required: ['temperatura', 'intencao_compra', 'objecao_principal', 'reuniao_agendada'],
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(params: {
  agentName:   string
  agentTone:   string
  leadName:    string
  empresaNome: string | null
  segmento:    string | null
  frota:       string | null
  cnae:        string | null
  tenantName:  string
}): string {
  const { agentName, agentTone, leadName, empresaNome, segmento, frota, cnae, tenantName } = params

  const toneGuide: Record<string, string> = {
    FORMAL:   'Use linguagem formal, respeitosa e profissional. Trate sempre de "senhor/senhora".',
    FRIENDLY: 'Use linguagem amigável, descontraída mas profissional. Tutear é aceitável.',
    DIRECT:   'Seja direto e objetivo. Vá logo ao ponto sem rodeios desnecessários.',
    EMPATHIC: 'Seja empático e consultivo. Foque nos problemas e dores do lead.',
    default:  'Use linguagem cordial e profissional.',
  }

  return `
Você é ${agentName}, um SDR de IA especializado em soluções de telemetria e gestão de frotas para ${tenantName}.

## MISSÃO
Qualificar o lead ${leadName}${empresaNome ? ` da empresa ${empresaNome}` : ''} e, se possível, agendar uma demonstração do produto.

## CONTEXTO DO LEAD
- Nome: ${leadName}
- Empresa: ${empresaNome ?? 'não informado'}
- Segmento: ${segmento ?? 'não informado'}
- Tamanho da frota: ${frota ?? 'não informado'}
- CNAE: ${cnae ?? 'não informado'}

## PORTFÓLIO DE SOLUÇÕES
Você representa soluções de telemetria que incluem:
- 📍 **Rastreamento GPS** em tempo real com histórico de rotas
- 😴 **Sensor de fadiga** — detecta sonolência e alerta motorista
- 📸 **Videotelemetria ADAS/DMS** — câmeras com visão 360°
- 🔒 **Bloqueio de partida** por biometria ou fator de autenticação
- 🗺️ **Cercas eletrônicas** (geofencing) com alertas automáticos
- 📊 **Dashboard executivo** com KPIs de segurança e eficiência
- 🏭 Especialização em mineração, construção e transporte pesado

## ROTEIRO DA LIGAÇÃO
1. **Apresentação** (30s): Se apresente e explique o motivo do contato
2. **Qualificação** (2-3 min): Entenda a situação atual da frota, principais dores
3. **Proposta de valor** (1-2 min): Apresente 2-3 benefícios relevantes para o segmento
4. **CTA** (1 min): Tente agendar uma demo de 20 min
5. **Encerramento**: Agradeça independentemente do resultado

## FRASES DE ENCERRAMENTO
- "Muito obrigado pelo seu tempo!"
- "Foi um prazer falar com você, até logo!"
- "Ótimo, até na demonstração então!"
- "Tudo bem, sem problemas. Um bom dia pra você!"

## REGRAS IMPORTANTES
- NUNCA mencione preços sem antes qualificar a frota
- Se o lead não tiver interesse → encerre com elegância após 1 tentativa
- Se cair no voicemail → deixe mensagem curta (30s max) e encerre
- Use a função **agendar_reuniao** IMEDIATAMENTE quando o lead confirmar data/hora
- Use a função **coletar_dados_frota** sempre que obtiver dados relevantes sobre a frota
- Tom: ${toneGuide[agentTone] ?? toneGuide.default}
- Idioma: Português brasileiro

## TRATAMENTO DE OBJEÇÕES
- "Já tenho sistema": "Entendo! Muitos clientes vinham de outros sistemas — o diferencial da nossa solução é [X]. Posso mostrar numa demo de 20 min?"
- "Muito caro": "Faz sentido pensar no custo. Mas o ROI médio dos nossos clientes de mineração é de 340% em 6 meses. Posso mostrar o cálculo?"
- "Não é o momento": "Sem problema! Quando seria um bom momento para revisitar? Posso ligar em [data]?"
`.trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCH
// ─────────────────────────────────────────────────────────────────────────────
export async function dispatchAiCall(
  leadId:          string,
  agentId:         string | null,
  dispatchedById?: string,
): Promise<DispatchResult> {
  // 1. Buscar lead
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { tenant: true },
  })
  if (!lead) return { success: false, callLogId: '', error: 'Lead não encontrado' }
  if (!lead.telefone) return { success: false, callLogId: '', error: 'Lead sem telefone cadastrado' }

  // 2. Buscar agente (se informado)
  const agent = agentId
    ? await prisma.agent.findUnique({ where: { id: agentId } })
    : await prisma.agent.findFirst({
        where: { tenantId: lead.tenantId ?? undefined, isActive: true },
      })

  // 3. Normalizar telefone para E.164
  const phoneRaw = lead.telefone.replace(/\D/g, '')
  const phone = phoneRaw.startsWith('55') ? `+${phoneRaw}` : `+55${phoneRaw}`

  // 4. Criar CallLog QUEUED
  const callLog = await prisma.callLog.create({
    data: {
      leadId,
      agentId:        agent?.id ?? null,
      dispatchedById: dispatchedById ?? null,
      tenantId:       lead.tenantId ?? null,
      provider:       'VAPI',
      status:         'QUEUED',
    },
  })

  // 5. Construir payload Vapi
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://api.prospeclead.com'
  const tenantName = (lead.tenant as { nome?: string } | null)?.nome ?? 'ProspecLead'

  const systemPrompt = buildSystemPrompt({
    agentName:   agent?.name ?? 'Sofia',
    agentTone:   (agent as unknown as { tone?: string } | null)?.tone ?? 'FRIENDLY',
    leadName:    lead.nomeCliente,
    empresaNome: lead.empresaNome ?? null,
    segmento:    lead.segmento ?? null,
    frota:       lead.frota ?? null,
    cnae:        lead.cnaeDescricao ?? null,
    tenantName,
  })

  const firstMessage =
    `Oi, aqui é ${agent?.name ?? 'Sofia'} da ${tenantName}! ` +
    `Tô ligando pra ${lead.nomeCliente.split(' ')[0]}? ` +
    `Tudo bem? Tenho uma solução de telemetria que pode ajudar bastante na sua operação. ` +
    `Tem um minutinho pra eu explicar?`

  const payload: VapiCallPayload = {
    assistant: {
      model: {
        provider:    'openai',
        model:       (agent as unknown as { model?: string } | null)?.model ?? 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens:   500,
        systemPrompt,
        emotionRecognitionEnabled: true,
      },
      voice: {
        provider:      'elevenlabs',
        voiceId:       process.env.ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL', // Sarah
        stability:     0.5,
        similarityBoost: 0.75,
        speed:         1.0,
      },
      firstMessage,
      endCallPhrases: [
        'até logo',
        'um bom dia',
        'uma boa tarde',
        'uma boa noite',
        'obrigado pelo tempo',
        'tchau tchau',
        'fique com deus',
      ],
      tools:           [TOOL_AGENDAR_REUNIAO, TOOL_COLETAR_FROTA],
      recordingEnabled: true,
      transcriptPlan:  { enabled: true },
      analysisPlan:    ANALYSIS_PLAN,
      metadata: {
        callLogId: callLog.id,
        leadId,
        tenantId:  lead.tenantId ?? '',
        source:    'prospeclead-crm',
      },
    },
    customer: {
      number: phone,
      name:   lead.nomeCliente,
      email:  lead.email ?? undefined,
    },
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    name:          `ProspecLead — ${lead.nomeCliente} — ${new Date().toLocaleDateString('pt-BR')}`,
    metadata: {
      callLogId: callLog.id,
      leadId,
      environment: process.env.NODE_ENV ?? 'development',
    },
  }

  // 6. Chamar Vapi (ou mock em dev)
  const vapiKey = process.env.VAPI_API_KEY
  if (!vapiKey || vapiKey === 'mock') {
    // MOCK: simular chamada com ID falso
    const mockCallId = `mock_${Date.now()}`
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        providerCallId: mockCallId,
        status: 'RINGING',
      },
    })
    console.log('[VoiceAgent] MOCK CALL dispatched:', { callLogId: callLog.id, mockCallId, payload })
    return { success: true, callLogId: callLog.id, providerCallId: mockCallId }
  }

  try {
    const resp = await fetch('https://api.vapi.ai/call/phone', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${vapiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      console.error('[VoiceAgent] Vapi error:', resp.status, errBody)
      await prisma.callLog.update({
        where: { id: callLog.id },
        data: { status: 'FAILED', endedReason: `HTTP ${resp.status}: ${errBody.slice(0, 200)}` },
      })
      return { success: false, callLogId: callLog.id, error: `Vapi: ${resp.status}` }
    }

    const data = await resp.json() as { id: string; status: string }
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        providerCallId: data.id,
        status:         'RINGING',
      },
    })

    return { success: true, callLogId: callLog.id, providerCallId: data.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: { status: 'FAILED', endedReason: msg },
    })
    return { success: false, callLogId: callLog.id, error: msg }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export interface VapiWebhookEvent {
  type:    string
  call:    {
    id:              string
    status:          string
    endedReason?:    string
    recordingUrl?:   string
    transcript?:     string
    summary?:        string
    analysis?:       {
      summary?:     string
      successEvaluation?: number
      structuredData?: Record<string, string>
    }
    startedAt?:      string
    endedAt?:        string
    cost?:           number
    costBreakdown?:  Record<string, number>
    messages?:       Array<{role: string; message: string; time: number}>
    toolCalls?:      Array<{name: string; args: Record<string, string>; result: string; time: number}>
  }
  toolCallId?: string
  toolName?:   string
  toolInput?:  Record<string, string>
  metadata?:   Record<string, string>
}

export async function handleVapiWebhook(event: VapiWebhookEvent): Promise<void> {
  const { type, call } = event

  // Buscar o CallLog pelo providerCallId
  const callLog = await prisma.callLog.findFirst({
    where: { providerCallId: call.id },
  })
  if (!callLog) {
    console.warn('[VoiceWebhook] CallLog não encontrado para callId:', call.id)
    return
  }

  const STATUS_MAP: Record<string, string> = {
    'call-started':  'IN_PROGRESS',
    'call-ended':    resolveEndStatus(call.endedReason),
    'call-failed':   'FAILED',
  }

  const newStatus = STATUS_MAP[type]

  // Calcular duração
  let durationSeconds = callLog.durationSeconds
  if (call.startedAt && call.endedAt) {
    durationSeconds = Math.round(
      (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000,
    )
  }

  // Extrair dados estruturados da análise
  const structured = call.analysis?.structuredData ?? {}
  const temperatura = structured['temperatura'] as string | undefined
  const reuniaoAgendada = structured['reuniao_agendada'] === 'true'
  const dataReuniao = structured['data_reuniao']
    ? new Date(structured['data_reuniao'])
    : null

  // Montar tool calls JSON
  const toolCallsJson = JSON.stringify(call.toolCalls ?? [])

  // Custo em centavos
  const costCents = call.cost ? Math.round(call.cost * 100) : 0

  // Transcript: pode ser string ou array de mensagens
  let transcriptText = call.transcript ?? null
  if (!transcriptText && call.messages?.length) {
    transcriptText = call.messages
      .map(m => `${m.role === 'assistant' ? 'IA' : 'Lead'}: ${m.message}`)
      .join('\n')
  }

  // Resumo: prefere analysis.summary, fallback call.summary
  const summary = call.analysis?.summary ?? call.summary ?? null

  const updateData: Record<string, unknown> = {
    ...(newStatus && { status: newStatus }),
    ...(call.endedReason && { endedReason: call.endedReason }),
    ...(call.recordingUrl && { recordingUrl: call.recordingUrl }),
    ...(transcriptText && { transcript: transcriptText }),
    ...(summary && { summary }),
    ...(temperatura && { callTemperature: temperatura }),
    durationSeconds,
    costCents,
    meetingScheduled: reuniaoAgendada,
    ...(dataReuniao && { meetingScheduledAt: dataReuniao }),
    toolCalls: toolCallsJson,
    ...(call.startedAt && { startedAt: new Date(call.startedAt) }),
    ...(call.endedAt && { endedAt: new Date(call.endedAt) }),
    updatedAt: new Date(),
  }

  await prisma.callLog.update({
    where: { id: callLog.id },
    data:  updateData as Parameters<typeof prisma.callLog.update>[0]['data'],
  })

  // Se a reunião foi agendada, atualizar o funil do lead
  if (reuniaoAgendada && callLog.leadId) {
    await prisma.lead.update({
      where: { id: callLog.leadId },
      data: {
        funnelStage: 'REUNIAO_AGENDADA',
        iaStatus:    'RESPONDIDO',
      },
    })
  }

  // Atualizar temperatura do lead na conversa vinculada (se houver)
  // Conversation tem leadTemperature mas não callTemperature
  if (temperatura && callLog.leadId) {
    await prisma.conversation.updateMany({
      where: { contactId: callLog.leadId },
      data: {
        leadTemperature: temperatura,
      } as Parameters<typeof prisma.conversation.updateMany>[0]['data'],
    })
  }

  console.log(`[VoiceWebhook] ${type} → CallLog ${callLog.id} status=${newStatus ?? 'unchanged'}`)
}

function resolveEndStatus(reason?: string): string {
  if (!reason) return 'COMPLETED'
  const r = reason.toLowerCase()
  if (r.includes('no-answer') || r.includes('no_answer')) return 'NO_ANSWER'
  if (r.includes('busy'))    return 'BUSY'
  if (r.includes('failed') || r.includes('error')) return 'FAILED'
  if (r.includes('cancel')) return 'CANCELED'
  return 'COMPLETED'
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL CALL HANDLER (chamado em tempo real pelo Vapi)
// ─────────────────────────────────────────────────────────────────────────────
export async function handleToolCall(
  callId:    string,
  toolName:  string,
  toolInput: Record<string, string>,
): Promise<{ result: string }> {
  const callLog = await prisma.callLog.findFirst({ where: { providerCallId: callId } })
  if (!callLog) return { result: 'ok' }

  if (toolName === 'agendar_reuniao') {
    const { data_hora, formato, observacoes } = toolInput
    const meetingAt = data_hora ? new Date(data_hora) : null

    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        meetingScheduled:   true,
        meetingScheduledAt: meetingAt ?? undefined,
        callNotes: `Reunião agendada: ${formato ?? 'videochamada'} em ${data_hora}. ${observacoes ?? ''}`.trim(),
      },
    })

    // Atualizar lead no Kanban
    if (callLog.leadId) {
      await prisma.lead.update({
        where: { id: callLog.leadId },
        data: { funnelStage: 'REUNIAO_AGENDADA' },
      })
    }

    return {
      result: `Reunião agendada com sucesso para ${data_hora} (${formato}). Confirmação enviada!`,
    }
  }

  if (toolName === 'coletar_dados_frota') {
    const { tamanho_frota, tipo_veiculo, problema_principal } = toolInput
    if (callLog.leadId) {
      await prisma.lead.update({
        where: { id: callLog.leadId },
        data: {
          frota: tamanho_frota,
          ...(tipo_veiculo && { veiculo: tipo_veiculo }),
          ...(problema_principal && { doresIdentificadas: problema_principal }),
        },
      })
    }
    return { result: 'Dados da frota registrados com sucesso.' }
  }

  return { result: 'ok' }
}

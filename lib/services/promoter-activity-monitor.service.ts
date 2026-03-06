/**
 * PromoterActivityMonitorService
 * ─────────────────────────────────────────────────────────────────────────────
 * Monitora a atividade dos promotores de rua em turno ativo a cada 15 minutos.
 *
 * Para cada promotor com turno ACTIVE, verifica se ele cadastrou algum lead
 * nos últimos 60 minutos. Se não, executa 3 ações:
 *
 *   1. Pausa o turno (status → PAUSED_BY_INACTIVITY)
 *   2. Cria um AlertLog vinculado ao tenant
 *   3. Envia mensagem motivacional via WhatsApp usando OpenAI GPT-4o-mini
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Uso via API (Next.js Route Handler):
 *   POST /api/cron/promoter-activity?secret=<CRON_SECRET>
 *   GET  /api/cron/promoter-activity?secret=<CRON_SECRET>   (Vercel Cron)
 *
 * Configurar no vercel.json:
 *   {
 *     "crons": [
 *       { "path": "/api/cron/promoter-activity", "schedule": "0,15,30,45 * * * *" }
 *     ]
 *   }
 *
 * Variáveis de ambiente necessárias:
 *   OPENAI_API_KEY       — Chave da OpenAI (gpt-4o-mini)
 *   CRON_SECRET          — Segredo para proteção do endpoint
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from '@/lib/prisma'
import { sendTextMessage } from '@/lib/services/whatsapp.service'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de configuração
// ─────────────────────────────────────────────────────────────────────────────

/** Tempo máximo sem cadastrar um lead antes de ser pausado (em minutos) */
const INACTIVITY_THRESHOLD_MINUTES = 60

/** Tamanho do lote de promotores processados por vez */
const BATCH_SIZE = 20

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface MonitorResult {
  totalActive: number
  totalPaused: number
  totalSkipped: number
  errors: string[]
  durationMs: number
  processedAt: string
}

interface PromoterInfo {
  shiftId: string
  userId: string
  nome: string
  telefone: string | null
  tenantId: string | null
  lastLeadAt: Date | null
  leadsHoje: number
  goal: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Função principal — runPromoterActivityMonitor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executa o monitor de atividade dos promotores.
 * Pode ser chamado para todos os tenants ou para um tenant específico.
 */
export async function runPromoterActivityMonitor(
  targetTenantId?: string
): Promise<MonitorResult> {
  const startedAt = Date.now()
  const errors: string[] = []
  let totalPaused = 0
  let totalSkipped = 0

  console.log(`[PromoterMonitor] Iniciando verificação às ${new Date().toISOString()}`)

  // ── 1. Buscar todos os turnos ACTIVE ───────────────────────────────────────
  const activeShifts = await prisma.promoterShift.findMany({
    where: {
      status: 'ACTIVE',
      ...(targetTenantId ? { tenantId: targetTenantId } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          nome: true,
          telefone: true,
          tenantId: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`[PromoterMonitor] ${activeShifts.length} turno(s) ativo(s) encontrado(s)`)

  if (activeShifts.length === 0) {
    return {
      totalActive: 0,
      totalPaused: 0,
      totalSkipped: 0,
      errors: [],
      durationMs: Date.now() - startedAt,
      processedAt: new Date().toISOString(),
    }
  }

  // ── 2. Processar em lotes ──────────────────────────────────────────────────
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const inactivityThreshold = new Date(now.getTime() - INACTIVITY_THRESHOLD_MINUTES * 60 * 1000)

  for (let i = 0; i < activeShifts.length; i += BATCH_SIZE) {
    const batch = activeShifts.slice(i, i + BATCH_SIZE)

    await Promise.allSettled(
      batch.map(async (shift) => {
        try {
          const user = shift.user
          const tenantId = shift.tenantId ?? user.tenantId ?? null

          // Busca o lead mais recente criado pelo promotor hoje
          const lastLead = await prisma.lead.findFirst({
            where: {
              promotorId: user.id,
              createdAt: { gte: todayStart },
              ...(tenantId ? { tenantId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          })

          // Conta quantos leads o promotor tem hoje
          const leadsHojeCount = await prisma.lead.count({
            where: {
              promotorId: user.id,
              createdAt: { gte: todayStart },
              ...(tenantId ? { tenantId } : {}),
            },
          })

          const promoterInfo: PromoterInfo = {
            shiftId: shift.id,
            userId: user.id,
            nome: user.nome,
            telefone: user.telefone,
            tenantId,
            lastLeadAt: lastLead?.createdAt ?? null,
            leadsHoje: leadsHojeCount,
            goal: 10, // Meta padrão (pode ser configurada por tenant no futuro)
          }

          // ── Verificar inatividade ──────────────────────────────────────────
          const isInactive =
            lastLead === null || lastLead.createdAt < inactivityThreshold

          if (!isInactive) {
            totalSkipped++
            console.log(
              `[PromoterMonitor] ${user.nome} → ATIVO (último lead: ${lastLead?.createdAt.toISOString()})`
            )
            return
          }

          // ── Calcular minutos de inatividade ───────────────────────────────
          const minutesInactive = lastLead
            ? Math.floor((now.getTime() - lastLead.createdAt.getTime()) / 60000)
            : Math.floor((now.getTime() - shift.startedAt.getTime()) / 60000)

          console.log(
            `[PromoterMonitor] ${user.nome} → INATIVO há ${minutesInactive}min | leads hoje: ${leadsHojeCount}`
          )

          // ── Ação 1: Pausar o turno ─────────────────────────────────────────
          await pauseShift(shift.id, minutesInactive)

          // ── Ação 2: Criar AlertLog ─────────────────────────────────────────
          await createInactivityAlert(promoterInfo, minutesInactive)

          // ── Ação 3: Enviar WhatsApp motivacional via OpenAI ────────────────
          if (user.telefone && tenantId) {
            await sendMotivationalWhatsApp(promoterInfo, minutesInactive, tenantId)
          } else {
            console.warn(
              `[PromoterMonitor] ${user.nome} → sem telefone ou tenantId — WhatsApp não enviado`
            )
          }

          totalPaused++
        } catch (err) {
          const msg = `Erro ao processar promotor ${shift.userId}: ${(err as Error).message}`
          console.error(`[PromoterMonitor] ${msg}`)
          errors.push(msg)
        }
      })
    )
  }

  const result: MonitorResult = {
    totalActive: activeShifts.length,
    totalPaused,
    totalSkipped,
    errors,
    durationMs: Date.now() - startedAt,
    processedAt: new Date().toISOString(),
  }

  console.log(
    `[PromoterMonitor] Concluído: ${totalPaused} pausados, ${totalSkipped} ativos, ${errors.length} erros em ${result.durationMs}ms`
  )

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Ação 1 — Pausar turno por inatividade
// ─────────────────────────────────────────────────────────────────────────────

async function pauseShift(shiftId: string, minutesInactive: number): Promise<void> {
  await prisma.promoterShift.update({
    where: { id: shiftId },
    data: {
      status: 'PAUSED_BY_INACTIVITY',
      pausedAt: new Date(),
      inactivityPauseCount: { increment: 1 },
      notes: `Pausado automaticamente após ${minutesInactive}min de inatividade`,
    },
  })
  console.log(`[PromoterMonitor] Turno ${shiftId} → PAUSED_BY_INACTIVITY`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Ação 2 — Criar AlertLog
// ─────────────────────────────────────────────────────────────────────────────

async function createInactivityAlert(
  promoter: PromoterInfo,
  minutesInactive: number
): Promise<void> {
  const title = `⚠️ Promotor inativo: ${promoter.nome}`
  const message =
    `O promotor ${promoter.nome} está sem cadastrar leads há ${minutesInactive} minutos. ` +
    `Leads cadastrados hoje: ${promoter.leadsHoje}. ` +
    `Seu turno foi pausado automaticamente por inatividade.`

  await prisma.alertLog.create({
    data: {
      tenantId: promoter.tenantId,
      subjectUserId: promoter.userId,
      type: 'INACTIVITY',
      title,
      message,
      severity: minutesInactive >= 120 ? 'CRITICAL' : 'WARNING',
      metadata: JSON.stringify({
        shiftId: promoter.shiftId,
        minutesInactive,
        leadsHoje: promoter.leadsHoje,
        goal: promoter.goal,
        lastLeadAt: promoter.lastLeadAt?.toISOString() ?? null,
      }),
    },
  })

  console.log(`[PromoterMonitor] AlertLog criado para ${promoter.nome}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Ação 3 — Gerar mensagem motivacional com OpenAI e enviar via WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

async function sendMotivationalWhatsApp(
  promoter: PromoterInfo,
  minutesInactive: number,
  tenantId: string
): Promise<void> {
  try {
    // Gera a mensagem motivacional via OpenAI
    const motivationalMessage = await generateMotivationalMessage(promoter, minutesInactive)

    // Normaliza o telefone para E.164 (remove +, espaços, traços)
    const phone = normalizePhone(promoter.telefone!)

    // Envia via WhatsApp
    const result = await sendTextMessage(phone, motivationalMessage, tenantId)

    if (result.success) {
      console.log(
        `[PromoterMonitor] WhatsApp motivacional enviado para ${promoter.nome} (${phone})`
      )
    } else {
      console.warn(
        `[PromoterMonitor] Falha ao enviar WhatsApp para ${promoter.nome}: ${result.error}`
      )
    }
  } catch (err) {
    // Não propaga o erro — WhatsApp é best-effort
    console.error(
      `[PromoterMonitor] Erro ao enviar WhatsApp para ${promoter.nome}: ${(err as Error).message}`
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI — Geração da mensagem motivacional
// ─────────────────────────────────────────────────────────────────────────────

async function generateMotivationalMessage(
  promoter: PromoterInfo,
  minutesInactive: number
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY

  // Se não há chave, usa fallback local
  if (!apiKey) {
    console.warn('[PromoterMonitor] OPENAI_API_KEY não configurada — usando mensagem de fallback')
    return buildFallbackMessage(promoter, minutesInactive)
  }

  const systemPrompt = `Você é um coach de vendas amigável e motivador. 
Seu tom é energético, positivo e empático. 
Você usa emojis de forma natural. 
Você escreve em português brasileiro informal.
Responda APENAS com o parágrafo da mensagem, sem introduções ou explicações.`

  const userPrompt =
    `Aja como um coach de vendas amigável. ` +
    `O promotor ${promoter.nome} não cadastrou nenhum lead há ${minutesInactive} minutos. ` +
    `Hoje ele já cadastrou ${promoter.leadsHoje} leads e a meta é ${promoter.goal}. ` +
    `Escreva um parágrafo curto (máximo 3 frases) para o WhatsApp dele motivando-o a voltar ` +
    `a cadastrar leads, usando emojis de forma natural e linguagem amigável.`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.8,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${errorBody}`)
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[]
    }

    const message = data.choices?.[0]?.message?.content?.trim()

    if (!message) {
      throw new Error('Resposta vazia da OpenAI')
    }

    console.log(`[PromoterMonitor] Mensagem gerada pela OpenAI para ${promoter.nome}: "${message}"`)
    return message
  } catch (err) {
    console.warn(
      `[PromoterMonitor] Falha na OpenAI — usando fallback: ${(err as Error).message}`
    )
    return buildFallbackMessage(promoter, minutesInactive)
  }
}

/**
 * Mensagem de fallback quando a OpenAI não está disponível.
 * Varia conforme o número de leads e tempo de inatividade.
 */
function buildFallbackMessage(promoter: PromoterInfo, minutesInactive: number): string {
  const nome = promoter.nome.split(' ')[0] // Primeiro nome
  const leadsRestantes = Math.max(0, promoter.goal - promoter.leadsHoje)

  if (promoter.leadsHoje === 0) {
    return (
      `Ei, ${nome}! 💪 O dia tá começando e a oportunidade tá na rua esperando por você! ` +
      `Cada cliente que você aborda é um passo para bater a meta. Vamos nessa! 🚀`
    )
  }

  if (leadsRestantes <= 0) {
    return (
      `Parabéns, ${nome}! 🎉 Você já bateu a meta de hoje (${promoter.goal} leads). ` +
      `Que tal ir além? Cada lead extra é mais comissão no bolso! 💰`
    )
  }

  return (
    `${nome}, já faz ${minutesInactive} minutos sem cadastrar leads 🤔 ` +
    `Você já tem ${promoter.leadsHoje} hoje — só mais ${leadsRestantes} para bater a meta! ` +
    `Você consegue, vai lá! 🔥`
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitário — Normalizar telefone para E.164
// ─────────────────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  // Remove tudo que não é dígito
  const digits = phone.replace(/\D/g, '')

  // Se já tem 13 dígitos (55 + DDD + 9 dígitos), está correto
  if (digits.length === 13 && digits.startsWith('55')) {
    return digits
  }

  // Se tem 11 dígitos (DDD + 9 dígitos), adiciona 55
  if (digits.length === 11) {
    return `55${digits}`
  }

  // Se tem 10 dígitos (DDD + 8 dígitos fixo), adiciona 55
  if (digits.length === 10) {
    return `55${digits}`
  }

  // Retorna como está (fallback)
  return digits
}

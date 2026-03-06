/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PromoterActivityMonitorService — Vigia de Ociosidade de Promotores de Rua
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Equivalente ao @nestjs/schedule CronJob, adaptado para Next.js/Edge runtime.
 * Ativação:
 *   • Dev/Sandbox:  POST /api/cron/promoter-monitor?secret=CRON_SECRET
 *   • Produção:     Vercel Cron a cada 15 min (vercel.json)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FLUXO PRINCIPAL (análogo ao PromoterActivityMonitorService do NestJS):
 *
 *  1. QUERY: Busca todos os PromoterShift com status = 'ACTIVE'
 *     incluindo o User e o último Lead cadastrado HOJE pelo promotor.
 *
 *  2. VERIFICAÇÃO: Para cada turno ativo:
 *     lastActivity = MAX(shift.startedAt, lastLead.createdAt ?? shift.startedAt)
 *     idleMinutes  = (now - lastActivity) em minutos
 *
 *  3. SE idleMinutes > INACTIVITY_THRESHOLD_MINUTES (60):
 *
 *     AÇÃO 1 — Banco de Dados:
 *       PromoterShift.status = 'PAUSED_BY_INACTIVITY'
 *       PromoterShift.pausedAt = now
 *       PromoterShift.inactivityPauseCount += 1
 *
 *     AÇÃO 2 — AlertLog (Alerta para o Gestor):
 *       Cria registro em AlertLog com type='INACTIVITY', severity='WARNING'
 *       Mensagem: "O promotor [Nome] está ocioso há X minutos."
 *
 *     AÇÃO 3 — IA Motivacional via OpenAI + WhatsApp:
 *       Chama gpt-4o-mini com prompt de treinador de vendas.
 *       Envia a mensagem gerada via WhatsApp para o celular do promotor.
 *       Registra a mensagem enviada no AlertLog.metadata.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRAÇÃO COM NESTJS:
 *   Se migrar para NestJS, basta encapsular runMonitor() num @Cron:
 *
 *   @Injectable()
 *   export class PromoterActivityMonitorService {
 *     constructor(private prisma: PrismaService, private wa: WhatsAppService) {}
 *
 *     @Cron('0 *\/15 * * * *')   // a cada 15 minutos
 *     async handleCron() {
 *       await runMonitor()
 *     }
 *   }
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { prisma } from '@/lib/prisma'
import { sendTextMessage } from '@/lib/services/whatsapp.service'

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
const INACTIVITY_THRESHOLD_MINUTES = 60   // pausar após 60 min sem lead
const DAILY_GOAL_DEFAULT           = 10   // meta padrão de leads/dia
const BATCH_SIZE                   = 50   // max promotores por execução
const OPENAI_MODEL                 = 'gpt-4o-mini'

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
export interface MonitorResult {
  executedAt:      string
  turnosAtivos:    number
  turnosPausados:  number
  alertasGerados:  number
  mensagensEnviadas: number
  erros:           string[]
  detalhes:        PromoterInactivityDetail[]
}

export interface PromoterInactivityDetail {
  promotorId:    string
  promotorNome:  string
  shiftId:       string
  idleMinutes:   number
  leadsHoje:     number
  metaDiaria:    number
  messagemIA:    string | null
  whatsappSent:  boolean
  action:        'PAUSED' | 'ALREADY_PAUSED' | 'ACTIVE_OK'
}

// ─────────────────────────────────────────────────────────────────────────────
// GERADOR DE MENSAGEM MOTIVACIONAL (OpenAI gpt-4o-mini)
// ─────────────────────────────────────────────────────────────────────────────
async function gerarMensagemMotivacional(params: {
  nome:        string
  idleMinutes: number
  leadsHoje:   number
  metaDiaria:  number
  segmento?:   string
}): Promise<string> {
  const { nome, idleMinutes, leadsHoje, metaDiaria } = params

  const prompt = [
    `Atue como um treinador de vendas amigável e motivador.`,
    `O promotor de campo ${nome} não cadastra um lead há ${idleMinutes} minutos.`,
    `Meta do dia: ${metaDiaria} leads. Leads já cadastrados hoje: ${leadsHoje}.`,
    `Leads restantes para bater a meta: ${Math.max(0, metaDiaria - leadsHoje)}.`,
    ``,
    `Escreva uma mensagem curta de WhatsApp (1 parágrafo, máximo 3 frases) para motivá-lo a voltar à ativa.`,
    `Use emojis relevantes (🚀, 🏆, 💪, etc.) e um tom encorajador e humano.`,
    `NÃO use saudações formais. Seja direto e energético.`,
    `Contexto: ele vende soluções de telemetria (rastreamento, câmeras, GPS) para frotas B2B.`,
  ].join('\n')

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // Fallback sem API key
    const faltam = Math.max(0, metaDiaria - leadsHoje)
    return (
      `Ei ${nome}! 🚀 Já faz ${idleMinutes} min sem novo lead… ` +
      `Você tem ${faltam > 0 ? `${faltam} leads` : 'a meta'} pra fechar hoje! ` +
      `Uma abordagem agora pode ser a virada do dia. Vai lá! 💪`
    )
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       OPENAI_MODEL,
        temperature: 0.85,
        max_tokens:  180,
        messages: [
          { role: 'system', content: 'Você é um coach de vendas de campo especializado em telemetria e frotas.' },
          { role: 'user',   content: prompt },
        ],
      }),
    })

    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`)
    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>
    }
    return data.choices[0]?.message?.content?.trim() ?? ''
  } catch (err) {
    console.error('[PromoterMonitor] OpenAI error:', err)
    const faltam = Math.max(0, metaDiaria - leadsHoje)
    return (
      `${nome}, bora! 🔥 Você está há ${idleMinutes} min sem registrar um lead. ` +
      `${faltam > 0 ? `Faltam só ${faltam} leads para bater a meta de hoje!` : 'Continue firme na missão!'} ` +
      `Cada contato conta. Vai com tudo! 💪🏆`
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONITOR PRINCIPAL — equivalente ao @Cron() do NestJS
// ─────────────────────────────────────────────────────────────────────────────
export async function runPromoterActivityMonitor(): Promise<MonitorResult> {
  const now       = new Date()
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  const result: MonitorResult = {
    executedAt:        now.toISOString(),
    turnosAtivos:      0,
    turnosPausados:    0,
    alertasGerados:    0,
    mensagensEnviadas: 0,
    erros:             [],
    detalhes:          [],
  }

  // ─── QUERY PRINCIPAL ─────────────────────────────────────────────────────
  // Busca todos os turnos ACTIVE (equivale ao "select * from User where role=PROMOTER AND turno=ACTIVE")
  // ─────────────────────────────────────────────────────────────────────────
  const turnosAtivos = await prisma.promoterShift.findMany({
    where: {
      status: 'ACTIVE',
    },
    take:    BATCH_SIZE,
    orderBy: { startedAt: 'asc' },
    include: {
      user: {
        select: {
          id:       true,
          nome:     true,
          telefone: true,
          tenantId: true,
          role:     true,
        },
      },
    },
  })

  result.turnosAtivos = turnosAtivos.length

  if (turnosAtivos.length === 0) {
    console.log('[PromoterMonitor] Nenhum turno ativo encontrado.')
    return result
  }

  // Para cada turno ativo, verificar a última atividade
  for (const shift of turnosAtivos) {
    const promotor = shift.user
    if (!promotor) continue

    try {
      // ── QUERY: último lead cadastrado pelo promotor HOJE ────────────────
      const ultimoLead = await prisma.lead.findFirst({
        where: {
          promotorId: promotor.id,
          createdAt:  { gte: startOfDay },
        },
        orderBy: { createdAt: 'desc' },
        select:  { createdAt: true },
      })

      // Contar total de leads hoje
      const leadsHoje = await prisma.lead.count({
        where: {
          promotorId: promotor.id,
          createdAt:  { gte: startOfDay },
        },
      })

      // ── CALCULAR OCIOSIDADE ─────────────────────────────────────────────
      // lastActivity = último lead OU início do turno (o que for mais recente)
      const lastActivity = ultimoLead
        ? new Date(Math.max(
            new Date(ultimoLead.createdAt).getTime(),
            new Date(shift.startedAt).getTime()
          ))
        : new Date(shift.startedAt)

      const idleMs      = now.getTime() - lastActivity.getTime()
      const idleMinutes = Math.floor(idleMs / 60_000)

      // Meta diária (pode ser do tenant ou padrão)
      const metaDiaria = DAILY_GOAL_DEFAULT

      const detail: PromoterInactivityDetail = {
        promotorId:   promotor.id,
        promotorNome: promotor.nome,
        shiftId:      shift.id,
        idleMinutes,
        leadsHoje,
        metaDiaria,
        messagemIA:   null,
        whatsappSent: false,
        action:       'ACTIVE_OK',
      }

      // ── THRESHOLD: SE ocioso mais de 60 min ──────────────────────────────
      if (idleMinutes >= INACTIVITY_THRESHOLD_MINUTES) {

        // ══════════════════════════════════════════════════════════════════
        // AÇÃO 1 — Pausar turno no banco de dados
        // ══════════════════════════════════════════════════════════════════
        await prisma.promoterShift.update({
          where: { id: shift.id },
          data: {
            status:              'PAUSED_BY_INACTIVITY',
            pausedAt:            now,
            inactivityPauseCount: { increment: 1 },
            updatedAt:           now,
          },
        })
        detail.action = 'PAUSED'
        result.turnosPausados++

        console.log(
          `[PromoterMonitor] ⚠️  ${promotor.nome} ocioso por ${idleMinutes}min → turno PAUSADO`
        )

        // ══════════════════════════════════════════════════════════════════
        // AÇÃO 2 — Criar AlertLog para o Gestor
        // ══════════════════════════════════════════════════════════════════
        const alertTitle   = `Promotor ocioso: ${promotor.nome}`
        const alertMessage =
          `O promotor ${promotor.nome} está sem registrar leads há ${idleMinutes} minutos ` +
          `(desde ${lastActivity.toLocaleTimeString('pt-BR')}). ` +
          `Leads hoje: ${leadsHoje}/${metaDiaria}. ` +
          `Turno #${shift.id.slice(-8)} pausado automaticamente.`

        await prisma.alertLog.create({
          data: {
            tenantId:     promotor.tenantId ?? null,
            subjectUserId: promotor.id,
            type:         'INACTIVITY',
            title:        alertTitle,
            message:      alertMessage,
            severity:     idleMinutes > 90 ? 'CRITICAL' : 'WARNING',
            metadata: JSON.stringify({
              shiftId:      shift.id,
              idleMinutes,
              leadsHoje,
              metaDiaria,
              lastActivity: lastActivity.toISOString(),
              pausedAt:     now.toISOString(),
            }),
          },
        })
        result.alertasGerados++

        // ══════════════════════════════════════════════════════════════════
        // AÇÃO 3 — Gerar mensagem IA e enviar via WhatsApp
        // ══════════════════════════════════════════════════════════════════
        const mensagemIA = await gerarMensagemMotivacional({
          nome:        promotor.nome.split(' ')[0], // Primeiro nome
          idleMinutes,
          leadsHoje,
          metaDiaria,
        })
        detail.messagemIA = mensagemIA

        // Enviar WhatsApp se promotor tiver telefone e tenant tiver canal
        if (promotor.telefone && promotor.tenantId) {
          try {
            await sendTextMessage(
              promotor.telefone.replace(/\D/g, ''),
              mensagemIA,
              promotor.tenantId,
            )
            detail.whatsappSent   = true
            result.mensagensEnviadas++

            console.log(
              `[PromoterMonitor] 📱 WhatsApp enviado para ${promotor.nome}: "${mensagemIA.slice(0, 80)}..."`
            )

            // Atualizar AlertLog com a mensagem enviada
            await prisma.alertLog.create({
              data: {
                tenantId:      promotor.tenantId,
                subjectUserId: promotor.id,
                type:          'INACTIVITY_MESSAGE_SENT',
                title:         `Mensagem motivacional enviada para ${promotor.nome}`,
                message:       mensagemIA,
                severity:      'INFO',
                metadata: JSON.stringify({
                  shiftId:     shift.id,
                  idleMinutes,
                  channel:     'WHATSAPP',
                  sentAt:      now.toISOString(),
                }),
              },
            })
          } catch (waErr) {
            const errMsg = waErr instanceof Error ? waErr.message : String(waErr)
            console.warn(`[PromoterMonitor] WhatsApp falhou para ${promotor.nome}: ${errMsg}`)
            result.erros.push(`WhatsApp ${promotor.nome}: ${errMsg}`)
          }
        } else {
          // Sem telefone: registrar a mensagem gerada no AlertLog de qualquer forma
          await prisma.alertLog.create({
            data: {
              tenantId:      promotor.tenantId ?? null,
              subjectUserId: promotor.id,
              type:          'INACTIVITY_MESSAGE_PENDING',
              title:         `Msg motivacional pendente (sem telefone): ${promotor.nome}`,
              message:       mensagemIA,
              severity:      'INFO',
              metadata: JSON.stringify({
                shiftId:     shift.id,
                reason:      promotor.telefone ? 'sem-tenant' : 'sem-telefone',
              }),
            },
          })
        }
      } else {
        // Promotor ainda ativo dentro do limite
        detail.action = 'ACTIVE_OK'
      }

      result.detalhes.push(detail)

    } catch (err) {
      const msg = `Erro ao processar promotor ${promotor.nome}: ${err instanceof Error ? err.message : err}`
      console.error('[PromoterMonitor]', msg)
      result.erros.push(msg)
    }
  }

  console.log(
    `[PromoterMonitor] ✅ Concluído — Ativos: ${result.turnosAtivos}, ` +
    `Pausados: ${result.turnosPausados}, ` +
    `Alertas: ${result.alertasGerados}, ` +
    `WhatsApp: ${result.mensagensEnviadas}`
  )

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Retomar turno (chamado quando promotor registra um novo lead)
// ─────────────────────────────────────────────────────────────────────────────
export async function resumeShiftAfterLead(promotorId: string): Promise<void> {
  const shift = await prisma.promoterShift.findFirst({
    where: {
      userId: promotorId,
      status: { in: ['ACTIVE', 'PAUSED_BY_INACTIVITY'] },
    },
    orderBy: { startedAt: 'desc' },
  })

  if (shift?.status === 'PAUSED_BY_INACTIVITY') {
    await prisma.promoterShift.update({
      where: { id: shift.id },
      data: {
        status:    'ACTIVE',
        pausedAt:  null,
        updatedAt: new Date(),
      },
    })

    // Alerta informativo: promotor retomou atividade
    await prisma.alertLog.create({
      data: {
        tenantId:      shift.tenantId ?? null,
        subjectUserId: promotorId,
        type:          'SHIFT_RESUMED',
        title:         'Promotor retomou atividade',
        message:       'O turno foi reativado após registro de novo lead.',
        severity:      'INFO',
        metadata: JSON.stringify({ shiftId: shift.id, resumedAt: new Date().toISOString() }),
      },
    })

    console.log(`[PromoterMonitor] ✅ Turno ${shift.id} retomado para promotor ${promotorId}`)
  }

  // Incrementar contador de leads no turno
  if (shift) {
    await prisma.promoterShift.update({
      where: { id: shift.id },
      data: {
        leadsCount: { increment: 1 },
        updatedAt:  new Date(),
      },
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Buscar alertas não resolvidos do tenant (para o painel do gestor)
// ─────────────────────────────────────────────────────────────────────────────
export async function getUnresolvedAlerts(tenantId: string, limit = 20) {
  return prisma.alertLog.findMany({
    where:   { tenantId, resolved: false },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  })
}

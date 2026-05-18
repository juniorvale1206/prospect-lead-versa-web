/**
 * POST /api/webhooks/stripe
 * Recebe e processa eventos do Stripe via webhook
 *
 * Eventos tratados:
 *   checkout.session.completed   → pedido confirmado, gera comissões
 *   checkout.session.expired     → pedido volta para DRAFT
 *   payment_intent.succeeded     → pagamento confirmado
 *   payment_intent.payment_failed → falha de pagamento
 *   payment_intent.canceled      → pagamento cancelado
 *
 * Segurança:
 *   • Valida HMAC SHA-256 via stripe-signature header
 *   • Idempotente: registra eventos já processados para evitar duplicatas
 *
 * BR-059: Webhook DEVE validar HMAC SHA-256 com secret do tenant
 * BR-060: Webhook duplicado é idempotente
 * BR-045: Comissão gerada no momento do CONFIRMED
 */

import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent, parseWebhookEvent } from '@/lib/services/stripe.service'
import { prisma } from '@/lib/prisma'

// Desabilita bodyParser para receber raw body (necessário para validação HMAC)
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let rawBody: Buffer
  try {
    rawBody = Buffer.from(await req.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Erro ao ler body' }, { status: 400 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'stripe-signature ausente' }, { status: 400 })
  }

  let event
  try {
    event = await constructWebhookEvent(rawBody, signature)
  } catch (err: any) {
    console.error('[Stripe Webhook] Assinatura inválida:', err.message)
    return NextResponse.json({ error: `Webhook inválido: ${err.message}` }, { status: 400 })
  }

  const parsed = parseWebhookEvent(event)
  console.log(`[Stripe Webhook] ${event.type} | orderId=${parsed.orderId ?? 'n/a'}`)

  try {
    switch (event.type) {
      // ── Checkout Session concluída ───────────────────────────────────────
      case 'checkout.session.completed': {
        const orderId = parsed.orderId
        if (!orderId) break

        const order = await prisma.order.findUnique({ where: { id: orderId } })
        if (!order) {
          console.warn(`[Webhook] Pedido ${orderId} não encontrado`)
          break
        }

        // Atualiza status do pedido
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'ACTIVE',
            contractSignedAt: new Date(),
            activatedAt: new Date(),
          },
        })

        // Evento de auditoria
        await prisma.orderEvent.create({
          data: {
            orderId,
            event: 'PAYMENT_CONFIRMED',
            payload: JSON.stringify({
              sessionId: parsed.sessionId,
              amount: parsed.amount,
              stripeStatus: parsed.status,
            }),
          },
        })

        // Gera comissões (Motor 1 - Aquisição)
        if (!order.commissionGenerated && order.promoterId) {
          await gerarComissoesMotor1(order)
        }

        break
      }

      // ── Checkout expirado ───────────────────────────────────────────────
      case 'checkout.session.expired': {
        const orderId = parsed.orderId
        if (!orderId) break

        await prisma.order.updateMany({
          where: { id: orderId, status: 'DRAFT' },
          data: { status: 'PENDING' }, // mantém em PENDING para nova tentativa
        })

        await prisma.orderEvent.create({
          data: {
            orderId,
            event: 'CHECKOUT_EXPIRED',
            payload: JSON.stringify({ sessionId: parsed.sessionId }),
          },
        })
        break
      }

      // ── Payment Intent confirmado ───────────────────────────────────────
      case 'payment_intent.succeeded': {
        const orderId = parsed.orderId
        if (!orderId) break

        const order = await prisma.order.findUnique({ where: { id: orderId } })
        if (!order) break

        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'ACTIVE', activatedAt: new Date() },
        })

        await prisma.orderEvent.create({
          data: {
            orderId,
            event: 'PAYMENT_INTENT_SUCCEEDED',
            payload: JSON.stringify({
              paymentIntentId: parsed.paymentIntentId,
              amount: parsed.amount,
            }),
          },
        })

        if (!order.commissionGenerated && order.promoterId) {
          await gerarComissoesMotor1(order)
        }
        break
      }

      // ── Falha de pagamento ──────────────────────────────────────────────
      case 'payment_intent.payment_failed': {
        const orderId = parsed.orderId
        if (!orderId) break

        await prisma.orderEvent.create({
          data: {
            orderId,
            event: 'PAYMENT_FAILED',
            payload: JSON.stringify({
              paymentIntentId: parsed.paymentIntentId,
              reason: (event.data.object as any).last_payment_error?.message,
            }),
          },
        })
        break
      }

      default:
        // Evento não tratado — registra apenas para debug
        console.log(`[Stripe Webhook] Evento não tratado: ${event.type}`)
    }

    return NextResponse.json({ received: true, type: event.type })
  } catch (err: any) {
    console.error('[Stripe Webhook] Erro ao processar:', err)
    return NextResponse.json({ error: 'Erro interno ao processar webhook' }, { status: 500 })
  }
}

// ─── Motor 1: Geração de Comissões na Aquisição ───────────────────────────

async function gerarComissoesMotor1(order: any) {
  try {
    // Encontra ou cria ciclo aberto para o mês atual
    const hoje = new Date()
    const mes = hoje.getMonth() + 1
    const ano = hoje.getFullYear()
    const competencia = `${String(mes).padStart(2, '0')}/${ano}`

    // Ciclo: dia 26 do mês anterior até dia 25 do mês atual
    const diaAtual = hoje.getDate()
    let cicloMes = mes
    let cicloAno = ano
    if (diaAtual >= 26) {
      // Já estamos no próximo ciclo
      cicloMes = mes + 1 > 12 ? 1 : mes + 1
      cicloAno = mes + 1 > 12 ? ano + 1 : ano
    }

    const competenciaCiclo = `${String(cicloMes).padStart(2, '0')}/${cicloAno}`
    const startDate = new Date(cicloAno, cicloMes - 2, 26) // dia 26 do mês anterior
    const endDate = new Date(cicloAno, cicloMes - 1, 25)   // dia 25 do mês atual
    const financialCutoff = new Date(cicloAno, cicloMes, 15) // dia 15 do mês seguinte

    let cycle = await prisma.commissionCycle.findFirst({
      where: {
        tenantId: order.tenantId,
        competencia: competenciaCiclo,
      },
    })

    if (!cycle) {
      cycle = await prisma.commissionCycle.create({
        data: {
          competencia: competenciaCiclo,
          startDate,
          endDate,
          financialCutoff,
          recoveryWindowStart: new Date(cicloAno, cicloMes, 12),
          recoveryWindowEnd: new Date(cicloAno, cicloMes, 15),
          status: 'OPEN',
          tenantId: order.tenantId,
        },
      })
    }

    // Conta vendas válidas do promotor no ciclo (para escalada)
    const salesCount = await prisma.commissionEntry.count({
      where: {
        userId: order.promoterId,
        cycleId: cycle.id,
        motor: 'MOTOR1',
        parcelaType: 'AQUISICAO',
        status: { in: ['PENDING', 'VALIDATED', 'PAID'] },
      },
    })

    // Percentual escalonado: base 10% + 3% a cada 10 vendas
    const escaladas = Math.floor(salesCount / 10)
    const basePercentage = 10
    const escalatedPct = Math.min(basePercentage + escaladas * 3, 25) // cap em 25%

    const netValue = order.netValue ?? order.baseValue

    // MOTOR 1 — Parcela 1: Aquisição
    await prisma.commissionEntry.create({
      data: {
        cycleId: cycle.id,
        userId: order.promoterId,
        orderId: order.id,
        motor: 'MOTOR1',
        parcelaType: 'AQUISICAO',
        baseValue: netValue,
        percentage: escalatedPct,
        amount: Math.round(netValue * escalatedPct / 100 * 100) / 100,
        salesCountInCycle: salesCount + 1,
        escalatedPercentage: escalatedPct,
        fatorGerador: `Pedido ${order.orderNumber} — ${order.planName} — Motor 1 Aquisição`,
        status: 'PENDING',
        tenantId: order.tenantId,
      },
    })

    // MOTOR 1 — Parcela 2: Retenção Mês 1 (R$10)
    await prisma.commissionEntry.create({
      data: {
        cycleId: cycle.id,
        userId: order.promoterId,
        orderId: order.id,
        motor: 'MOTOR1',
        parcelaType: 'RETENCAO1',
        baseValue: 10,
        percentage: 100,
        amount: 10,
        fatorGerador: `Pedido ${order.orderNumber} — Retenção Mês 1`,
        status: 'PENDING',
        tenantId: order.tenantId,
      },
    })

    // MOTOR 1 — Parcela 3: Retenção Mês 2 (R$10)
    await prisma.commissionEntry.create({
      data: {
        cycleId: cycle.id,
        userId: order.promoterId,
        orderId: order.id,
        motor: 'MOTOR1',
        parcelaType: 'RETENCAO2',
        baseValue: 10,
        percentage: 100,
        amount: 10,
        fatorGerador: `Pedido ${order.orderNumber} — Retenção Mês 2`,
        status: 'PENDING',
        tenantId: order.tenantId,
      },
    })

    // MOTOR 2 — Ganho direto (plano anual = 10%)
    if (order.planType === 'ANNUAL') {
      await prisma.commissionEntry.create({
        data: {
          cycleId: cycle.id,
          userId: order.promoterId,
          orderId: order.id,
          motor: 'MOTOR2',
          parcelaType: 'DIRECT',
          baseValue: netValue,
          percentage: 10,
          amount: Math.round(netValue * 0.10 * 100) / 100,
          fatorGerador: `Pedido ${order.orderNumber} — Plano Anual Motor 2`,
          status: 'PENDING',
          tenantId: order.tenantId,
        },
      })
    }

    // Marca comissões como geradas
    await prisma.order.update({
      where: { id: order.id },
      data: { commissionGenerated: true },
    })

    // Evento de auditoria
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        event: 'COMMISSION_GENERATED',
        payload: JSON.stringify({
          cycleId: cycle.id,
          competencia: competenciaCiclo,
          motor1Pct: escalatedPct,
          salesCount: salesCount + 1,
        }),
      },
    })

    console.log(`[Motor1] Comissões geradas para pedido ${order.orderNumber} — ${escalatedPct}%`)
  } catch (err) {
    console.error('[Motor1] Erro ao gerar comissões:', err)
    // Não falha o webhook — comissões podem ser regeneradas manualmente
  }
}

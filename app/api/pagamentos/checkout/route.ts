/**
 * POST /api/pagamentos/checkout
 * Cria uma Stripe Checkout Session e retorna a URL de pagamento
 *
 * Body:
 *   planId         — ID do plano VAPEC
 *   interval       — 'month' | 'year'
 *   paymentMethod  — 'pix' | 'card' | 'boleto'
 *   customerEmail  — e-mail do cliente
 *   customerName   — nome completo / razão social
 *   customerCpf    — CPF ou CNPJ
 *   orderId        — ID do pedido (Order) — opcional se ainda não criado
 *   installments   — parcelas (apenas cartão, 1-12)
 *
 * Retorna:
 *   { url, sessionId, amount }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  createCheckoutSession,
  isStripeConfigured,
  VAPEC_PLANS,
  type PaymentMethodType,
  type BillingInterval,
  type PlanId,
} from '@/lib/services/stripe.service'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error: 'Pagamento não configurado',
          message: 'Configure STRIPE_SECRET_KEY no painel de configurações.',
          configRequired: true,
        },
        { status: 503 }
      )
    }

    const body = await req.json()
    const {
      planId,
      interval = 'month',
      paymentMethod = 'pix',
      customerEmail,
      customerName,
      customerCpf,
      orderId,
      installments = 1,
      discountCoupon,
    } = body

    // Validação básica
    if (!planId || !customerEmail || !customerName || !customerCpf) {
      return NextResponse.json(
        { error: 'planId, customerEmail, customerName e customerCpf são obrigatórios' },
        { status: 400 }
      )
    }

    const plan = VAPEC_PLANS.find(p => p.id === planId)
    if (!plan) {
      return NextResponse.json({ error: `Plano '${planId}' inválido` }, { status: 400 })
    }

    // Cria rascunho do pedido se não foi fornecido
    let finalOrderId = orderId
    if (!finalOrderId) {
      // Gera número sequencial por tenant
      const tenant = session.tenantId
        ? await prisma.tenant.update({
            where: { id: session.tenantId },
            data: { orderSequence: { increment: 1 } },
            select: { orderSequence: true, slug: true },
          })
        : null

      const year = new Date().getFullYear()
      const prefix = tenant?.slug?.slice(0, 3).toUpperCase() ?? 'VPC'
      const seq = String(tenant?.orderSequence ?? 1).padStart(5, '0')
      const orderNumber = `${year}-${prefix}-${seq}`

      const amount = interval === 'year' ? plan.annualPrice : plan.monthlyPrice
      const netResult = calcNetValue(amount, paymentMethod, installments)

      const newOrder = await prisma.order.create({
        data: {
          orderNumber,
          orderType: 'B2C',
          status: 'DRAFT',
          clientEmail: customerEmail,
          clientName: customerName,
          clientCpfCnpj: customerCpf,
          planId: plan.id,
          planName: plan.name,
          planType: interval === 'year' ? 'ANNUAL' : 'MONTHLY',
          baseValue: amount,
          netValue: netResult.netValue,
          totalValue: amount,
          paymentMethod: paymentMethod.toUpperCase(),
          installments,
          originType: 'PROMOTER',
          promoterId: session.userId,
          tenantId: session.tenantId ?? null,
        },
      })

      finalOrderId = newOrder.id

      // Evento de auditoria
      await prisma.orderEvent.create({
        data: {
          orderId: finalOrderId,
          event: 'CHECKOUT_INITIATED',
          payload: JSON.stringify({ planId, interval, paymentMethod, installments }),
          userId: session.userId,
        },
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const result = await createCheckoutSession({
      planId: planId as PlanId,
      interval: interval as BillingInterval,
      paymentMethod: paymentMethod as PaymentMethodType,
      customerEmail,
      customerName,
      customerCpfCnpj: customerCpf,
      orderId: finalOrderId,
      tenantId: session.tenantId ?? 'default',
      promoterId: session.userId,
      successUrl: `${appUrl}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}&order_id=${finalOrderId}`,
      cancelUrl: `${appUrl}/checkout/cancelado?order_id=${finalOrderId}`,
      installments,
      discountCoupon,
    })

    return NextResponse.json({
      url: result.url,
      sessionId: result.sessionId,
      orderId: finalOrderId,
      amount: result.amount,
      currency: result.currency,
    })
  } catch (error: any) {
    console.error('[POST /api/pagamentos/checkout]', error)

    if (error?.type === 'StripeInvalidRequestError') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(
      { error: 'Erro ao criar sessão de pagamento', details: error.message },
      { status: 500 }
    )
  }
}

function calcNetValue(amount: number, method: string, installments: number): { netValue: number } {
  const taxRates: Record<string, number> = {
    pix: 0.0099,
    boleto: 0.0199,
    card: installments > 1 ? 0.0299 + (installments - 1) * 0.0099 : 0.0249,
  }
  const rate = taxRates[method] ?? 0.0249
  const netValue = Math.round(amount * (1 - rate) * 100) / 100
  return { netValue }
}

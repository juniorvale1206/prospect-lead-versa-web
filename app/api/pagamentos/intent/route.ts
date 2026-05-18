/**
 * POST /api/pagamentos/intent
 * Cria um Payment Intent para checkout inline (integrado ao próprio site)
 * Retorna client_secret para uso com @stripe/stripe-js no frontend
 *
 * GET /api/pagamentos/intent?orderId=xxx
 * Consulta status de um Payment Intent vinculado ao pedido
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  createPaymentIntent,
  isStripeConfigured,
  calcularValorLiquido,
  type PaymentMethodType,
} from '@/lib/services/stripe.service'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Stripe não configurado', configRequired: true }, { status: 503 })
    }

    const body = await req.json()
    const {
      amount,
      paymentMethod = 'pix',
      customerEmail,
      customerName,
      customerCpf,
      orderId,
      description = 'Plano de Rastreamento VAPEC',
      installments = 1,
    } = body

    if (!amount || !customerEmail || !customerName || !customerCpf) {
      return NextResponse.json(
        { error: 'amount, customerEmail, customerName e customerCpf são obrigatórios' },
        { status: 400 }
      )
    }

    if (amount < 1) {
      return NextResponse.json({ error: 'Valor mínimo: R$ 1,00' }, { status: 400 })
    }

    // Calcula Valor Líquido (base das comissões VAPEC Motor 1)
    const { netValue, taxValue, breakdown } = calcularValorLiquido({
      grossValue: amount,
      paymentMethod: paymentMethod as PaymentMethodType,
      installments,
    })

    const result = await createPaymentIntent({
      amount,
      paymentMethod: paymentMethod as PaymentMethodType,
      customerEmail,
      customerName,
      customerCpfCnpj: customerCpf,
      orderId: orderId ?? `order_${Date.now()}`,
      tenantId: session.tenantId ?? 'default',
      description,
      installments,
    })

    return NextResponse.json({
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      amount,
      netValue,
      taxValue,
      breakdown,
      currency: 'BRL',
    })
  } catch (error: any) {
    console.error('[POST /api/pagamentos/intent]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

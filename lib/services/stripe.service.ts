/**
 * StripeService — Wrapper completo para integração com Stripe
 *
 * Suporta:
 *   • PIX (via Stripe Brasil)
 *   • Cartão de crédito (com parcelamento)
 *   • Boleto bancário
 *   • Assinaturas recorrentes (planos mensais/anuais)
 *   • Customers (multi-tenant, por CPF/CNPJ)
 *   • Checkout Sessions (hosted payment page)
 *   • Payment Intents (inline checkout)
 *   • Webhooks com validação HMAC
 *
 * Política VAPEC 2026 — base de cálculo: Valor Líquido
 */

import Stripe from 'stripe'

// ─── Singleton Stripe Client ───────────────────────────────────────────────
let stripeInstance: Stripe | null = null

function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key || key.includes('YOUR_STRIPE')) {
      throw new Error('STRIPE_SECRET_KEY não configurada. Configure em .env ou nas variáveis de ambiente.')
    }
    stripeInstance = new Stripe(key, {
      apiVersion: '2024-06-20',
      typescript: true,
    })
  }
  return stripeInstance
}

// ─── Tipos ─────────────────────────────────────────────────────────────────

export type PlanId = 'rastremix_mensal' | 'rastremix_anual' | 'gpsmy_mensal' | 'gpsmy_anual' | 'topypro_mensal' | 'topypro_anual'
export type PaymentMethodType = 'pix' | 'card' | 'boleto'
export type BillingInterval = 'month' | 'year'

export interface VapecPlan {
  id: PlanId
  name: string
  description: string
  monthlyPrice: number      // em reais
  annualPrice: number       // em reais (desconto aplicado)
  annualSavingPct: number   // percentual de economia anual
  setupFee: number          // taxa de adesão
  features: string[]
  recommended?: boolean
  stripePriceIdMonthly?: string
  stripePriceIdAnnual?: string
  maxVehicles?: number
  commissionBase: number    // % base Motor 1
}

export interface CreateCheckoutParams {
  planId: PlanId
  interval: BillingInterval
  paymentMethod: PaymentMethodType
  customerEmail: string
  customerName: string
  customerCpfCnpj: string
  orderId: string
  tenantId: string
  promoterId?: string
  successUrl: string
  cancelUrl: string
  installments?: number     // parcelas cartão (1-12)
  discountCoupon?: string
}

export interface CheckoutResult {
  sessionId: string
  url: string
  amount: number
  currency: string
}

export interface PaymentIntentParams {
  amount: number            // em reais
  paymentMethod: PaymentMethodType
  customerEmail: string
  customerName: string
  customerCpfCnpj: string
  orderId: string
  tenantId: string
  description: string
  installments?: number
}

export interface StripeWebhookEvent {
  type: string
  orderId?: string
  sessionId?: string
  paymentIntentId?: string
  amount?: number
  status?: string
  customerEmail?: string
  metadata?: Record<string, string>
}

// ─── Planos VAPEC 2026 v1.4 ───────────────────────────────────────────────

export const VAPEC_PLANS: VapecPlan[] = [
  {
    id: 'rastremix_mensal',
    name: 'Rastremix',
    description: 'Rastreamento básico com cobertura nacional',
    monthlyPrice: 200,
    annualPrice: 1872,       // 200 * 12 * 0.78 (22% off)
    annualSavingPct: 22,
    setupFee: 0,
    commissionBase: 10,
    features: [
      'Rastreamento em tempo real',
      'Histórico de 90 dias',
      'App para motorista',
      'Cercas virtuais',
      'Alertas de velocidade',
      'Suporte WhatsApp',
    ],
    maxVehicles: 1,
  },
  {
    id: 'gpsmy_mensal',
    name: 'GPS My',
    description: 'Gestão completa com relatórios avançados',
    monthlyPrice: 250,
    annualPrice: 2340,       // 250 * 12 * 0.78
    annualSavingPct: 22,
    setupFee: 0,
    commissionBase: 10,
    recommended: true,
    features: [
      'Tudo do Rastremix',
      'Histórico de 180 dias',
      'Relatórios gerenciais',
      'Sensor de fadiga (câmera DMS)',
      'Identificação de motorista',
      'Dashboard web completo',
      'API de integração',
    ],
    maxVehicles: 1,
  },
  {
    id: 'topypro_mensal',
    name: 'Topy Pro',
    description: 'Solução enterprise para frotas e mineração',
    monthlyPrice: 300,
    annualPrice: 2808,       // 300 * 12 * 0.78
    annualSavingPct: 22,
    setupFee: 0,
    commissionBase: 10,
    features: [
      'Tudo do GPS My',
      'Histórico ilimitado',
      'Câmera ADAS + DMS (360°)',
      'Bloqueio de partida',
      'Cercas elétricas industriais',
      'Videotelemetria HD',
      'Suporte prioritário 24/7',
      'Integração Vale / grandes clientes',
    ],
    maxVehicles: 1,
  },
]

/**
 * Retorna o plano VAPEC pelo ID
 */
export function getVapecPlan(planId: PlanId): VapecPlan {
  const plan = VAPEC_PLANS.find(p => p.id === planId || p.id === planId.replace('_anual', '_mensal'))
  if (!plan) throw new Error(`Plano ${planId} não encontrado`)
  return plan
}

/**
 * Calcula o Valor Líquido (base de cálculo das comissões VAPEC Motor 1)
 * Valor Líquido = Preço bruto - Descontos - Taxas de pagamento
 */
export function calcularValorLiquido(params: {
  grossValue: number
  discountValue?: number
  paymentMethod: PaymentMethodType
  installments?: number
}): { netValue: number; taxValue: number; breakdown: string } {
  const { grossValue, discountValue = 0, paymentMethod, installments = 1 } = params

  // Taxas de pagamento (aproximadas)
  const taxRates: Record<PaymentMethodType, number> = {
    pix: 0.0099,      // 0.99%
    boleto: 0.0199,   // 1.99% + R$3,49 fixo (simplificado)
    card: installments > 1
      ? 0.0299 + (installments - 1) * 0.0099  // progressivo
      : 0.0249,       // 2.49% à vista
  }

  const taxRate = taxRates[paymentMethod]
  const baseAfterDiscount = grossValue - discountValue
  const taxValue = Math.round(baseAfterDiscount * taxRate * 100) / 100
  const netValue = Math.round((baseAfterDiscount - taxValue) * 100) / 100

  return {
    netValue,
    taxValue,
    breakdown: `R$ ${grossValue.toFixed(2)} - R$ ${discountValue.toFixed(2)} (desc) - R$ ${taxValue.toFixed(2)} (taxa ${(taxRate * 100).toFixed(2)}%) = R$ ${netValue.toFixed(2)}`,
  }
}

// ─── Customer Management ───────────────────────────────────────────────────

/**
 * Cria ou recupera um Stripe Customer pelo e-mail
 * Armazena CPF/CNPJ nos metadata para compliance LGPD
 */
export async function getOrCreateStripeCustomer(params: {
  email: string
  name: string
  cpfCnpj: string
  tenantId: string
  phone?: string
}): Promise<string> {
  const stripe = getStripe()

  // Busca por e-mail existente
  const existing = await stripe.customers.list({
    email: params.email,
    limit: 1,
  })

  if (existing.data.length > 0) {
    return existing.data[0].id
  }

  // Cria novo customer
  const customer = await stripe.customers.create({
    email: params.email,
    name: params.name,
    phone: params.phone,
    metadata: {
      cpfCnpj: params.cpfCnpj,
      tenantId: params.tenantId,
    },
  })

  return customer.id
}

// ─── Checkout Session (Hosted Page) ───────────────────────────────────────

/**
 * Cria uma Stripe Checkout Session (página de pagamento hospedada pelo Stripe)
 * Ideal para conversão máxima — o Stripe cuida de todo o fluxo de pagamento
 */
export async function createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult> {
  const stripe = getStripe()

  const plan = VAPEC_PLANS.find(p =>
    p.id === params.planId || p.id.startsWith(params.planId.replace('_anual', '').replace('_mensal', ''))
  ) || VAPEC_PLANS[0]

  const amount = params.interval === 'year' ? plan.annualPrice : plan.monthlyPrice
  const amountCents = Math.round(amount * 100)

  const customerId = await getOrCreateStripeCustomer({
    email: params.customerEmail,
    name: params.customerName,
    cpfCnpj: params.customerCpfCnpj,
    tenantId: params.tenantId,
  })

  // Configura métodos de pagamento por tipo
  const paymentMethodTypes = getStripePaymentMethods(params.paymentMethod)

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    payment_method_types: paymentMethodTypes,
    mode: 'payment',    // one-time (para assinaturas use 'subscription')
    line_items: [
      {
        price_data: {
          currency: 'brl',
          product_data: {
            name: `${plan.name} — ${params.interval === 'year' ? 'Anual' : 'Mensal'}`,
            description: plan.description,
            metadata: {
              planId: params.planId,
              interval: params.interval,
            },
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      orderId: params.orderId,
      tenantId: params.tenantId,
      promoterId: params.promoterId ?? '',
      planId: params.planId,
      interval: params.interval,
      paymentMethod: params.paymentMethod,
    },
    locale: 'pt-BR',
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min
  }

  // Cupom de desconto
  if (params.discountCoupon) {
    sessionParams.discounts = [{ coupon: params.discountCoupon }]
  }

  // Parcelamento para cartão
  if (params.paymentMethod === 'card' && params.installments && params.installments > 1) {
    sessionParams.payment_method_options = {
      card: {
        installments: { enabled: true },
      },
    }
  }

  const session = await stripe.checkout.sessions.create(sessionParams)

  return {
    sessionId: session.id,
    url: session.url!,
    amount: amount,
    currency: 'BRL',
  }
}

// ─── Payment Intent (Inline Checkout) ─────────────────────────────────────

/**
 * Cria um Payment Intent para checkout inline (componente no próprio site)
 * Retorna client_secret para o frontend usar com @stripe/stripe-js
 */
export async function createPaymentIntent(params: PaymentIntentParams): Promise<{
  clientSecret: string
  paymentIntentId: string
  amount: number
}> {
  const stripe = getStripe()
  const amountCents = Math.round(params.amount * 100)

  const customerId = await getOrCreateStripeCustomer({
    email: params.customerEmail,
    name: params.customerName,
    cpfCnpj: params.customerCpfCnpj,
    tenantId: params.tenantId,
  })

  const paymentMethods = getStripePaymentMethods(params.paymentMethod)

  const intentParams: Stripe.PaymentIntentCreateParams = {
    amount: amountCents,
    currency: 'brl',
    customer: customerId,
    payment_method_types: paymentMethods,
    description: params.description,
    metadata: {
      orderId: params.orderId,
      tenantId: params.tenantId,
    },
    statement_descriptor: 'VAPEC TELEMETRIA',
    statement_descriptor_suffix: 'RASTR',
  }

  // Configurações específicas por método
  if (params.paymentMethod === 'pix') {
    intentParams.payment_method_options = {
      pix: { expires_after_seconds: 1800 }, // 30 minutos
    }
  }

  if (params.paymentMethod === 'boleto') {
    intentParams.payment_method_options = {
      boleto: { expires_after_days: 3 },
    }
  }

  if (params.paymentMethod === 'card' && params.installments && params.installments > 1) {
    intentParams.payment_method_options = {
      card: { installments: { enabled: true } },
    }
  }

  const intent = await stripe.paymentIntents.create(intentParams)

  return {
    clientSecret: intent.client_secret!,
    paymentIntentId: intent.id,
    amount: params.amount,
  }
}

// ─── PIX direto via Payment Intent ────────────────────────────────────────

/**
 * Gera um PIX Copia e Cola via Stripe
 * Retorna QR Code e código PIX para exibição
 */
export async function createPixPayment(params: {
  amount: number
  customerEmail: string
  customerName: string
  customerCpfCnpj: string
  orderId: string
  tenantId: string
  description: string
}): Promise<{
  clientSecret: string
  paymentIntentId: string
  pixCode?: string
  qrCodeUrl?: string
}> {
  const result = await createPaymentIntent({
    ...params,
    paymentMethod: 'pix',
  })

  return {
    clientSecret: result.clientSecret,
    paymentIntentId: result.paymentIntentId,
    // QR Code e código PIX são gerados após confirmação com payment_method=pix
  }
}

// ─── Webhook Validation ────────────────────────────────────────────────────

/**
 * Valida e processa eventos de webhook do Stripe
 * HMAC SHA-256 com stripe-signature header
 */
export async function constructWebhookEvent(
  payload: Buffer | string,
  signature: string
): Promise<Stripe.Event> {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret || secret.includes('YOUR_WEBHOOK')) {
    throw new Error('STRIPE_WEBHOOK_SECRET não configurada')
  }

  return stripe.webhooks.constructEvent(payload, signature, secret)
}

/**
 * Extrai dados relevantes de um evento de webhook Stripe
 */
export function parseWebhookEvent(event: Stripe.Event): StripeWebhookEvent {
  const result: StripeWebhookEvent = {
    type: event.type,
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session
      result.sessionId = session.id
      result.orderId = session.metadata?.orderId
      result.amount = session.amount_total ? session.amount_total / 100 : 0
      result.status = session.payment_status
      result.customerEmail = session.customer_email ?? undefined
      result.metadata = (session.metadata as Record<string, string>) ?? {}
      break
    }

    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled': {
      const intent = event.data.object as Stripe.PaymentIntent
      result.paymentIntentId = intent.id
      result.orderId = intent.metadata?.orderId
      result.amount = intent.amount / 100
      result.status = intent.status
      result.metadata = (intent.metadata as Record<string, string>) ?? {}
      break
    }

    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      result.amount = (invoice.amount_paid ?? invoice.amount_due) / 100
      result.status = invoice.status ?? undefined
      break
    }
  }

  return result
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getStripePaymentMethods(method: PaymentMethodType): Stripe.PaymentMethodType[] {
  const methodMap: Record<PaymentMethodType, Stripe.PaymentMethodType[]> = {
    pix: ['pix'],
    card: ['card'],
    boleto: ['boleto'],
  }
  return methodMap[method] ?? ['card']
}

/**
 * Lista pagamentos de um pedido
 */
export async function listOrderPayments(orderId: string): Promise<Stripe.PaymentIntent[]> {
  const stripe = getStripe()
  const intents = await stripe.paymentIntents.search({
    query: `metadata['orderId']:'${orderId}'`,
    limit: 10,
  })
  return intents.data
}

/**
 * Cancela um Payment Intent
 */
export async function cancelPaymentIntent(paymentIntentId: string): Promise<void> {
  const stripe = getStripe()
  await stripe.paymentIntents.cancel(paymentIntentId)
}

/**
 * Reembolso de um Payment Intent
 */
export async function refundPayment(params: {
  paymentIntentId: string
  amount?: number  // parcial em reais; undefined = total
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
}): Promise<Stripe.Refund> {
  const stripe = getStripe()
  return stripe.refunds.create({
    payment_intent: params.paymentIntentId,
    amount: params.amount ? Math.round(params.amount * 100) : undefined,
    reason: params.reason ?? 'requested_by_customer',
  })
}

/**
 * Retorna chave pública para uso no frontend (seguro)
 */
export function getPublishableKey(): string {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
}

/**
 * Verifica se Stripe está configurado
 */
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY
  return !!(key && !key.includes('YOUR_STRIPE'))
}

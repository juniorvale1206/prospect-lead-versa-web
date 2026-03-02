/**
 * POST /api/mobile/sales
 * ─────────────────────────────────────────────────────────────────────────────
 * Fecha uma venda no aplicativo mobile do promotor.
 *
 * OPERAÇÃO ATÔMICA ($transaction):
 *   1. Cria o registro na tabela Sale
 *   2. Atualiza o Lead: funnelStage='CONVERTIDO', status='VENDIDO'
 *   3. Lança a comissão no CommissionLedger (PENDING, evento SALE_CONVERTED)
 *
 * REGRAS DE NEGÓCIO:
 *   • Apenas PROMOTER, MANAGER e TEAM_LEADER podem fechar vendas
 *   • Lead deve existir e pertencer ao mesmo tenant do promotor
 *   • Lead não pode estar já VENDIDO (idempotência)
 *   • Produto/Plano deve existir e estar ativo
 *   • Comissão = product.commissionPercentage % de totalAmount
 *   • subscriptionCycle obrigatório se product.type === 'HARDWARE'
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyMobileToken }         from '@/lib/mobile-auth'
import { prisma }                    from '@/lib/prisma'

// ─── Constantes ───────────────────────────────────────────────────────────────
const SALES_ROLES     = ['PROMOTER', 'MANAGER', 'TEAM_LEADER'] as const
const PAYMENT_METHODS = ['PIX', 'CREDIT_CARD', 'BOLETO', 'DINHEIRO', 'TRANSFERENCIA'] as const
const VALID_CYCLES    = ['QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY'] as const

// ─── Helper ───────────────────────────────────────────────────────────────────
function err(
  message: string,
  status  = 400,
  code    = 'VALIDATION_ERROR',
  field?: string,
) {
  return NextResponse.json(
    { success: false, error: { code, message, ...(field ? { field } : {}) } },
    { status },
  )
}

// ─── POST /api/mobile/sales ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {

  /* ── 1. Autenticação via Bearer token ────────────────────────────────────── */
  const payload = await verifyMobileToken(req)
  if (!payload) {
    return err('Token inválido ou expirado. Faça login novamente.', 401, 'UNAUTHORIZED')
  }
  if (!(SALES_ROLES as readonly string[]).includes(payload.role)) {
    return err(
      `A sua conta (${payload.role}) não tem permissão para registrar vendas.`,
      403, 'FORBIDDEN',
    )
  }

  /* ── 2. Parse do body ────────────────────────────────────────────────────── */
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return err('Body inválido. Envie JSON.', 400, 'INVALID_BODY')
  }

  const {
    leadId,
    productId,
    paymentMethod     = 'PIX',
    installments      = 1,
    totalAmount,
    subscriptionCycle,
    subscriptionAmount = 0,
    // promoterId pode vir no body para admins criarem em nome de alguém
    // para promotores, sempre usa o sub do JWT
    promoterId: promoterIdFromBody,
  } = body

  /* ── 3. Validações básicas ───────────────────────────────────────────────── */
  if (!leadId || typeof leadId !== 'string') {
    return err('O campo leadId é obrigatório.', 400, 'VALIDATION_ERROR', 'leadId')
  }
  if (!productId || typeof productId !== 'string') {
    return err('O campo productId é obrigatório.', 400, 'VALIDATION_ERROR', 'productId')
  }
  if (typeof totalAmount !== 'number' || totalAmount <= 0) {
    return err('totalAmount deve ser um número positivo.', 400, 'VALIDATION_ERROR', 'totalAmount')
  }
  if (!(PAYMENT_METHODS as readonly string[]).includes(paymentMethod as string)) {
    return err(
      `paymentMethod inválido. Use: ${PAYMENT_METHODS.join(' | ')}`,
      400, 'VALIDATION_ERROR', 'paymentMethod',
    )
  }
  const inst = Number(installments)
  if (!Number.isInteger(inst) || inst < 1 || inst > 72) {
    return err('installments deve ser um inteiro entre 1 e 72.', 400, 'VALIDATION_ERROR', 'installments')
  }

  /* ── 4. Resolve promoterId ───────────────────────────────────────────────── */
  // PROMOTER sempre usa o próprio sub; MANAGER pode criar para outro promotor
  const resolvedPromoterId =
    (typeof promoterIdFromBody === 'string' && promoterIdFromBody.trim())
      ? promoterIdFromBody.trim()
      : payload.sub

  if (!resolvedPromoterId) {
    return err(
      'Não foi possível identificar o promotor responsável pela venda.',
      400, 'MISSING_PROMOTER', 'promoterId',
    )
  }

  /* ── 5. Busca Lead + Product em paralelo ─────────────────────────────────── */
  const [lead, product] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId as string } }),
    prisma.product.findUnique({ where: { id: productId as string } }),
  ])

  if (!lead) {
    return err('Lead não encontrado.', 404, 'NOT_FOUND', 'leadId')
  }
  if (!product) {
    return err('Produto/Plano não encontrado.', 404, 'NOT_FOUND', 'productId')
  }
  if (!product.isActive) {
    return err('Este produto está inativo e não pode ser vinculado a vendas.', 400, 'PRODUCT_INACTIVE', 'productId')
  }

  // Idempotência: lead já foi vendido?
  if (lead.funnelStage === 'CONVERTIDO') {
    return err(
      'Este lead já foi convertido em venda anteriormente.',
      409, 'ALREADY_SOLD', 'leadId',
    )
  }

  // Guard de tenant: promotor só fecha venda de leads do seu tenant
  if (payload.role === 'PROMOTER' && payload.tenantId && lead.tenantId) {
    if (lead.tenantId !== payload.tenantId) {
      return err('Este lead não pertence ao seu tenant.', 403, 'FORBIDDEN', 'leadId')
    }
  }

  // Validação de ciclo para HARDWARE
  if (product.type === 'HARDWARE') {
    if (!subscriptionCycle || !(VALID_CYCLES as readonly string[]).includes(subscriptionCycle as string)) {
      return err(
        `Para Hardware, o campo subscriptionCycle é obrigatório. Use: ${VALID_CYCLES.join(' | ')}`,
        400, 'VALIDATION_ERROR', 'subscriptionCycle',
      )
    }
  }

  /* ── 6. Cálculo da comissão ─────────────────────────────────────────────── */
  // Comissão = commissionPercentage % sobre o totalAmount pago
  const commissionAmount = parseFloat(
    ((totalAmount * product.commissionPercentage) / 100).toFixed(2),
  )

  /* ── 7. TRANSAÇÃO ATÔMICA ────────────────────────────────────────────────── */
  // Garante consistência: ou tudo acontece, ou nada é salvo.
  //
  // Operações em série dentro da transaction:
  //   a) prisma.sale.create        → registra a venda
  //   b) prisma.lead.update        → muda funnelStage + status
  //   c) prisma.commissionLedger.create → lança comissão PENDING no extrato
  //
  let sale
  try {
    const [createdSale] = await prisma.$transaction([

      // ── a) Criar a venda ───────────────────────────────────────────────────
      prisma.sale.create({
        data: {
          leadId:            leadId as string,
          promoterId:        resolvedPromoterId,
          productId:         productId as string,
          paymentMethod:     paymentMethod as string,
          installments:      inst,
          totalAmount,
          subscriptionCycle: subscriptionCycle as string | undefined,
          subscriptionAmount: Number(subscriptionAmount) || 0,
          commissionAmount,
          tenantId:          lead.tenantId ?? payload.tenantId ?? null,
        },
        include: {
          lead:    { select: { id: true, nomeCliente: true, funnelStage: true } },
          product: { select: { id: true, name: true, commissionPercentage: true } },
        },
      }),

      // ── b) Atualizar o lead: marcar como CONVERTIDO/VENDIDO ────────────────
      prisma.lead.update({
        where: { id: leadId as string },
        data: {
          funnelStage: 'CONVERTIDO',
          status:      'AUDITADO_APROVADO', // venda confirma lead aprovado
        },
      }),

      // ── c) Lançar comissão no extrato financeiro do promotor ───────────────
      // CommissionLedger: cada linha = 1 evento de crédito
      // Status PENDING → aguarda liquidação mensal pelo financeiro
      prisma.commissionLedger.create({
        data: {
          promotorId:  resolvedPromoterId,
          leadId:      leadId as string,
          eventType:   'SALE_CONVERTED',
          amount:      commissionAmount,
          description: `Venda de "${product.name}" — ${product.commissionPercentage}% s/ ${fmtBRL(totalAmount)}`,
          status:      'PENDING',
          tenantId:    lead.tenantId ?? payload.tenantId ?? null,
        },
      }),
    ])

    sale = createdSale
  } catch (txError) {
    console.error('[POST /api/mobile/sales] Prisma $transaction error:', txError)
    return err(
      'Erro interno ao processar a venda. Tente novamente.',
      500, 'TRANSACTION_ERROR',
    )
  }

  /* ── 8. Resposta de sucesso ──────────────────────────────────────────────── */
  return NextResponse.json(
    {
      success:          true,
      message:          'Venda registrada com sucesso!',
      saleId:           sale.id,
      commissionAmount,
      commissionPct:    product.commissionPercentage,
      sale: {
        id:               sale.id,
        leadId,
        productId,
        productName:      (sale as typeof sale & { product: { name: string } }).product?.name,
        paymentMethod,
        installments:     inst,
        totalAmount,
        subscriptionCycle: subscriptionCycle ?? null,
        subscriptionAmount: Number(subscriptionAmount) || 0,
        commissionAmount,
        createdAt:        sale.createdAt,
      },
    },
    { status: 201 },
  )
}

// ─── Auxiliar ─────────────────────────────────────────────────────────────────
function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

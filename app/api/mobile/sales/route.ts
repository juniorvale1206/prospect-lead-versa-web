/**
 * POST /api/mobile/sales
 * ─────────────────────────────────────────────────────────────────────────────
 * Fecha uma venda no aplicativo mobile do promotor.
 *
 * OPERAÇÃO ATÔMICA via CommissionService ($transaction):
 *   1. Cria o registro na tabela Sale
 *   2. Atualiza o Lead: funnelStage='CONVERTIDO', status='AUDITADO_APROVADO'
 *   3. Lança comissão DIRECT_SALE no CommissionLedger para o frentista
 *   4. SE o lead veio de um PDV com managerPromoterId:
 *      → Lança comissão PDV_NETWORK_SALE para o Promotor-Gerente do PDV
 *      → Incrementa PartnerStore.totalSales
 *
 * REGRAS DE NEGÓCIO:
 *   • Apenas PROMOTER, MANAGER e TEAM_LEADER podem fechar vendas
 *   • Lead deve existir e pertencer ao mesmo tenant
 *   • Lead não pode estar já VENDIDO (idempotência)
 *   • Produto/Plano deve existir e estar ativo
 *   • Comissão direta  = product.commissionPercentage % × totalAmount
 *   • Comissão de rede = pdv.customNetworkCommissionPct ?? tenant.networkCommissionPct ?? 10%
 *   • subscriptionCycle obrigatório se product.type === 'HARDWARE'
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyMobileToken }         from '@/lib/mobile-auth'
import { prisma }                    from '@/lib/prisma'
import {
  processSaleWithCommissionSplit,
  CommissionServiceError,
} from '@/lib/services/commission.service'

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
    // MANAGER pode criar venda em nome de outro promotor
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

  /* ── 5. Busca produto para validações específicas ────────────────────────── */
  const product = await prisma.product.findUnique({
    where: { id: productId as string },
    select: { type: true, isActive: true },
  })

  if (!product) {
    return err('Produto/Plano não encontrado.', 404, 'NOT_FOUND', 'productId')
  }
  if (!product.isActive) {
    return err('Este produto está inativo e não pode ser vinculado a vendas.', 400, 'PRODUCT_INACTIVE', 'productId')
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

  /* ── 6. Guard de tenant ──────────────────────────────────────────────────── */
  if (payload.role === 'PROMOTER' && payload.tenantId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId as string },
      select: { tenantId: true },
    })
    if (lead?.tenantId && lead.tenantId !== payload.tenantId) {
      return err('Este lead não pertence ao seu tenant.', 403, 'FORBIDDEN', 'leadId')
    }
  }

  /* ── 7. Processar venda com split de comissão ────────────────────────────── */
  try {
    const result = await processSaleWithCommissionSplit({
      leadId:             leadId as string,
      productId:          productId as string,
      promoterId:         resolvedPromoterId,
      paymentMethod:      paymentMethod as string,
      installments:       inst,
      totalAmount:        totalAmount as number,
      subscriptionCycle:  subscriptionCycle as string | undefined,
      subscriptionAmount: Number(subscriptionAmount) || 0,
      tenantId:           payload.tenantId ?? null,
    })

    /* ── 8. Resposta de sucesso ────────────────────────────────────────────── */
    return NextResponse.json(
      {
        success:                  true,
        message:                  'Venda registrada com sucesso!',
        saleId:                   result.saleId,

        // Comissão direta (frentista)
        commissionAmount:         result.directCommissionAmount,
        commissionPct:            result.directCommissionPct,

        // Comissão de rede (promotor-gerente do PDV)
        networkCommission: {
          issued:   result.networkCommissionIssued,
          amount:   result.networkCommissionAmount,
          pct:      result.networkCommissionPct,
          pdvId:    result.pdvId,
          managerId: result.managerPromoterId,
        },

        sale: result.sale,
      },
      { status: 201 },
    )
  } catch (error) {
    // Erros tipados do CommissionService
    if (error instanceof CommissionServiceError) {
      const statusMap: Record<CommissionServiceError['code'], number> = {
        NOT_FOUND:          404,
        PRODUCT_INACTIVE:   400,
        ALREADY_SOLD:       409,
        FORBIDDEN:          403,
        TRANSACTION_ERROR:  500,
      }
      return err(error.message, statusMap[error.code], error.code)
    }

    // Erro genérico
    console.error('[POST /api/mobile/sales] Erro inesperado:', error)
    return err('Erro interno ao processar a venda. Tente novamente.', 500, 'INTERNAL_ERROR')
  }
}

// ─── Auxiliar ─────────────────────────────────────────────────────────────────
function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// suprime warning de variável não utilizada no módulo
void fmtBRL

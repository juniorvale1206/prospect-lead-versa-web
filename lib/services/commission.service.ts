/**
 * CommissionService — Motor de Split de Comissão
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * MODELO DE NEGÓCIO — COMISSÃO DE REDE (PDV):
 *
 *   Quando um lead originado de um PDV (Posto/Loja parceira) converte em venda:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  VENDA FECHADA                                                       │
 *   │                                                                      │
 *   │  Lead.pdvId → PartnerStore                                          │
 *   │                   │                                                  │
 *   │                   ├── managerPromoterId? → Promotor-Gerente         │
 *   │                   │                        └── COMISSÃO DE REDE     │
 *   │                   │                            (10% padrão tenant)  │
 *   │                   │                                                  │
 *   │  promoterId ──────────────────────────────► Frentista/Promotor      │
 *   │                                              └── COMISSÃO DIRETA    │
 *   │                                                  (commissionPct%)   │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * TRANSAÇÃO ATÔMICA via callback ($transaction):
 *   [0] Sale.create
 *   [1] Lead.update              → funnelStage='CONVERTIDO'
 *   [2] CommissionLedger.create  → DIRECT_SALE (frentista)
 *   [3] CommissionLedger.create  → PDV_NETWORK_SALE (gerente)  [condicional]
 *   [4] PartnerStore.update      → totalSales++                 [condicional]
 *
 * REGRAS DE CÁLCULO:
 *   • Comissão direta  = product.commissionPercentage % × totalAmount
 *   • Comissão de rede = pdv.customNetworkCommissionPct ?? tenant.networkCommissionPct ?? 10%
 *   • A comissão de rede é calculada sobre o totalAmount (não sobre a comissão direta)
 *   • Se gerente == frentista: comissão de rede é CANCELADA (evita duplicidade)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de entrada e saída
// ─────────────────────────────────────────────────────────────────────────────

export interface SaleInput {
  leadId:             string
  productId:          string
  promoterId:         string
  paymentMethod:      string
  installments:       number
  totalAmount:        number
  subscriptionCycle?: string
  subscriptionAmount: number
  tenantId:           string | null
}

export interface SaleCommissionResult {
  saleId:                   string
  /** Comissão direta gerada para o frentista/promotor (R$) */
  directCommissionAmount:   number
  /** Comissão de rede gerada para o promotor-gerente do PDV (R$) */
  networkCommissionAmount:  number
  /** Percentual da comissão direta aplicado */
  directCommissionPct:      number
  /** Percentual da comissão de rede aplicado (0 se não couber) */
  networkCommissionPct:     number
  /** ID do PDV de origem — null se lead direto */
  pdvId:                    string | null
  /** ID do promotor-gerente do PDV — null se sem PDV gerenciado */
  managerPromoterId:        string | null
  /** true se a comissão de rede foi emitida */
  networkCommissionIssued:  boolean
  sale: {
    id:                string
    leadId:            string
    productId:         string
    productName:       string
    paymentMethod:     string
    installments:      number
    totalAmount:       number
    subscriptionCycle: string | null
    subscriptionAmount:number
    commissionAmount:  number
    createdAt:         Date
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Erro tipado do CommissionService
// ─────────────────────────────────────────────────────────────────────────────

export class CommissionServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_FOUND'
      | 'PRODUCT_INACTIVE'
      | 'ALREADY_SOLD'
      | 'FORBIDDEN'
      | 'TRANSACTION_ERROR',
  ) {
    super(message)
    this.name = 'CommissionServiceError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Função principal — processSaleWithCommissionSplit
// ─────────────────────────────────────────────────────────────────────────────

export async function processSaleWithCommissionSplit(
  input: SaleInput,
): Promise<SaleCommissionResult> {
  const {
    leadId,
    productId,
    promoterId,
    paymentMethod,
    installments,
    totalAmount,
    subscriptionCycle,
    subscriptionAmount,
    tenantId,
  } = input

  // ── Passo 1: Buscar Lead + Product em paralelo ────────────────────────────
  const [lead, product] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id:          true,
        nomeCliente: true,
        funnelStage: true,
        tenantId:    true,
        pdvId:       true,
      },
    }),
    prisma.product.findUnique({
      where: { id: productId },
      select: {
        id:                   true,
        name:                 true,
        commissionPercentage: true,
        isActive:             true,
        type:                 true,
      },
    }),
  ])

  // ── Passo 2: Guardrails ───────────────────────────────────────────────────
  if (!lead)    throw new CommissionServiceError('Lead não encontrado.', 'NOT_FOUND')
  if (!product) throw new CommissionServiceError('Produto não encontrado.', 'NOT_FOUND')
  if (!product.isActive) {
    throw new CommissionServiceError('Produto inativo.', 'PRODUCT_INACTIVE')
  }
  if (lead.funnelStage === 'CONVERTIDO') {
    throw new CommissionServiceError('Lead já foi convertido em venda.', 'ALREADY_SOLD')
  }

  // ── Passo 3: Comissão direta ──────────────────────────────────────────────
  const directCommissionPct    = product.commissionPercentage
  const directCommissionAmount = round2(totalAmount * directCommissionPct / 100)

  // ── Passo 4: Verificar PDV e calcular comissão de rede ────────────────────
  const pdvId: string | null                  = lead.pdvId ?? null
  let managerPromoterId: string | null        = null
  let networkCommissionPct: number            = 0
  let networkCommissionAmount: number         = 0
  let networkCommissionIssued: boolean        = false
  let pdvName: string                         = ''

  if (pdvId) {
    const pdv = await prisma.partnerStore.findUnique({
      where: { id: pdvId },
      select: {
        id:                         true,
        name:                       true,
        managerPromoterId:          true,
        customNetworkCommissionPct: true,
        tenant: { select: { networkCommissionPct: true } },
      },
    })

    if (pdv?.managerPromoterId) {
      managerPromoterId    = pdv.managerPromoterId
      pdvName              = pdv.name

      // Taxa: custom do PDV > padrão do tenant > fallback 10%
      networkCommissionPct =
        pdv.customNetworkCommissionPct
        ?? pdv.tenant?.networkCommissionPct
        ?? 10.0

      networkCommissionAmount = round2(totalAmount * networkCommissionPct / 100)
      networkCommissionIssued = true

      // Evita duplicidade se gerente == frentista (auto-venda)
      if (managerPromoterId === promoterId) {
        console.warn(
          `[CommissionService] Gerente do PDV (${managerPromoterId}) === promotor ` +
          `— comissão de rede cancelada (auto-venda).`,
        )
        networkCommissionIssued = false
        networkCommissionAmount = 0
      }
    }
  }

  const effectiveTenantId = lead.tenantId ?? tenantId ?? null
  const productName       = product.name

  // ── Passo 5: TRANSAÇÃO ATÔMICA (callback mode) ────────────────────────────
  //
  //   Usamos o callback do $transaction para poder condicionar as operações
  //   dinamicamente (comissão de rede só se houver PDV com gerente).
  //
  //   [0] Sale.create
  //   [1] Lead.update              → CONVERTIDO
  //   [2] CommissionLedger.create  → DIRECT_SALE (frentista)
  //   [3] CommissionLedger.create  → PDV_NETWORK_SALE (gerente) [condicional]
  //   [4] PartnerStore.update      → totalSales++               [condicional]
  //
  let saleId:    string = ''
  let createdAt: Date   = new Date()

  await prisma.$transaction(async (tx) => {

    // ── [0] Criar a venda ────────────────────────────────────────────────────
    const createdSale = await tx.sale.create({
      data: {
        leadId,
        promoterId,
        productId,
        paymentMethod,
        installments,
        totalAmount,
        subscriptionCycle: subscriptionCycle ?? null,
        subscriptionAmount,
        commissionAmount:  directCommissionAmount,
        tenantId:          effectiveTenantId,
      },
      select: { id: true, createdAt: true },
    })

    saleId    = createdSale.id
    createdAt = createdSale.createdAt

    // ── [1] Atualizar o lead ──────────────────────────────────────────────────
    await tx.lead.update({
      where: { id: leadId },
      data: {
        funnelStage: 'CONVERTIDO',
        status:      'AUDITADO_APROVADO',
      },
    })

    // ── [2] Comissão DIRETA → frentista/promotor ──────────────────────────────
    await tx.commissionLedger.create({
      data: {
        promotorId:     promoterId,
        leadId,
        saleId:         createdSale.id,
        eventType:      'SALE_CONVERTED',
        commissionType: 'DIRECT_SALE',
        amount:         directCommissionAmount,
        description:    `Venda: "${productName}" — ${directCommissionPct}% s/ ${fmtBRL(totalAmount)}`,
        status:         'PENDING',
        tenantId:       effectiveTenantId,
        pdvId:          null,
      },
    })

    // ── [3] Comissão de REDE → promotor-gerente do PDV ────────────────────────
    if (networkCommissionIssued && managerPromoterId && pdvId) {
      await tx.commissionLedger.create({
        data: {
          promotorId:     managerPromoterId,
          leadId,
          saleId:         createdSale.id,
          eventType:      'SALE_CONVERTED',
          commissionType: 'PDV_NETWORK_SALE',
          amount:         networkCommissionAmount,
          description:    `Comissão de Rede — PDV "${pdvName}" s/ ${fmtBRL(totalAmount)} (${networkCommissionPct}%)`,
          status:         'PENDING',
          tenantId:       effectiveTenantId,
          pdvId,
        },
      })

      // ── [4] Incrementar contador de vendas do PDV ──────────────────────────
      await tx.partnerStore.update({
        where: { id: pdvId },
        data:  { totalSales: { increment: 1 } },
      })
    }
  })

  // ── Log resumido ──────────────────────────────────────────────────────────
  console.log(
    `[CommissionService] Venda ${saleId} processada:` +
    ` DIRECT=${fmtBRL(directCommissionAmount)} para ${promoterId}` +
    (networkCommissionIssued
      ? ` | NETWORK=${fmtBRL(networkCommissionAmount)} para ${managerPromoterId} (PDV: ${pdvId})`
      : ' | sem comissão de rede'),
  )

  return {
    saleId,
    directCommissionAmount,
    networkCommissionAmount,
    directCommissionPct,
    networkCommissionPct,
    pdvId,
    managerPromoterId,
    networkCommissionIssued,
    sale: {
      id:                saleId,
      leadId,
      productId,
      productName,
      paymentMethod,
      installments,
      totalAmount,
      subscriptionCycle: subscriptionCycle ?? null,
      subscriptionAmount,
      commissionAmount:  directCommissionAmount,
      createdAt,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

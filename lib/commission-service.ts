/**
 * lib/commission-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Serviço responsável por calcular e registrar créditos no extrato de comissão
 * do promotor quando um evento chave ocorre no funil.
 *
 * Regras de negócio (v1):
 * ┌─────────────────────────────────────────┬──────────┐
 * │ Evento                                  │ Valor R$ │
 * ├─────────────────────────────────────────┼──────────┤
 * │ Lead respondeu IA — com foto de placa   │ R$ 2,00  │
 * │ Lead respondeu IA — sem foto de placa   │ R$ 1,00  │
 * └─────────────────────────────────────────┴──────────┘
 *
 * O crédito é registrado em `CommissionLedger` com status PENDING.
 * O fechamento financeiro (liquidação) acontece separadamente via /financeiro.
 */

import { prisma } from '@/lib/prisma'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type CommissionEventType =
  | 'IA_RESPONSE_WITH_PHOTO'   // Lead respondeu IA e tinha foto → R$ 2,00
  | 'IA_RESPONSE_NO_PHOTO'     // Lead respondeu IA sem foto    → R$ 1,00
  | 'SALE_CONVERTED'           // Venda fechada (futuro)
  | 'MANUAL_ADJUSTMENT'        // Ajuste manual pelo financeiro

// Tabela de valores por evento
const EVENT_AMOUNTS: Record<CommissionEventType, number> = {
  IA_RESPONSE_WITH_PHOTO: 2.00,
  IA_RESPONSE_NO_PHOTO:   1.00,
  SALE_CONVERTED:         0,    // calculado dinamicamente
  MANUAL_ADJUSTMENT:      0,    // passado pelo caller
}

const EVENT_LABELS: Record<CommissionEventType, string> = {
  IA_RESPONSE_WITH_PHOTO: 'Lead respondeu à IA — foto de placa enviada (R$ 2,00)',
  IA_RESPONSE_NO_PHOTO:   'Lead respondeu à IA — sem foto de placa (R$ 1,00)',
  SALE_CONVERTED:         'Comissão por venda convertida',
  MANUAL_ADJUSTMENT:      'Ajuste manual pelo financeiro',
}

// ─── Interface de entrada ─────────────────────────────────────────────────────
export interface CreditCommissionInput {
  promotorId:  string
  leadId:      string
  eventType:   CommissionEventType
  tenantId?:   string | null
  /** Sobrescreve o valor padrão do evento (obrigatório para SALE_CONVERTED e MANUAL_ADJUSTMENT) */
  amountOverride?: number
  /** Descrição personalizada (sobrescreve EVENT_LABELS) */
  descriptionOverride?: string
}

// ─── Função principal ─────────────────────────────────────────────────────────
/**
 * Registra um crédito de comissão no extrato (CommissionLedger).
 * Idempotente: verifica se já existe uma entrada para o mesmo (leadId, eventType)
 * para evitar duplicação em caso de webhook reenviado.
 *
 * @returns O registro criado, ou null se já existia (idempotência).
 */
export async function creditCommission(
  input: CreditCommissionInput,
) {
  const { promotorId, leadId, eventType, tenantId, amountOverride, descriptionOverride } = input

  // ── Idempotência: evita duplo crédito para o mesmo lead/evento ────────────
  const existing = await prisma.commissionLedger.findFirst({
    where: { leadId, eventType },
  })
  if (existing) {
    console.info(`[commission] Crédito já registrado — leadId=${leadId} eventType=${eventType}`)
    return null
  }

  const amount      = amountOverride ?? EVENT_AMOUNTS[eventType]
  const description = descriptionOverride ?? EVENT_LABELS[eventType]

  const ledger = await prisma.commissionLedger.create({
    data: {
      promotorId,
      leadId,
      eventType,
      amount,
      description,
      status:    'PENDING',
      tenantId:  tenantId ?? null,
    },
  })

  console.info(
    `[commission] Crédito registrado — promotorId=${promotorId} leadId=${leadId} ` +
    `eventType=${eventType} amount=R$${amount.toFixed(2)} ledgerId=${ledger.id}`,
  )

  return ledger
}

// ─── Calcular saldo pendente de um promotor ───────────────────────────────────
export async function getPendingBalance(promotorId: string): Promise<number> {
  const result = await prisma.commissionLedger.aggregate({
    where:  { promotorId, status: 'PENDING' },
    _sum:   { amount: true },
  })
  return result._sum.amount ?? 0
}

// ─── Obter extrato completo de um promotor ────────────────────────────────────
export async function getLedgerEntries(promotorId: string, limit = 50) {
  return prisma.commissionLedger.findMany({
    where:   { promotorId },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  })
}

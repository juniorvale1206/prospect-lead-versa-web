/**
 * commission-calculator.service.ts — Motor de Cálculo de Comissões VAPEC 2026 v1.4
 *
 * Implementa os 4 motores da política comercial VAPEC:
 *
 * MOTOR 1 — Planos Mensais
 *   Base: 10%, escala +3% a cada 10 vendas válidas no ciclo
 *   Produtos: Rastremix R$200 | GPS My R$250 | Topy Pro R$300
 *   Parcelas: AQUISICAO (mês 0) + RETENCAO1 (mês 1, R$10) + RETENCAO2 (mês 2, R$10)
 *
 * MOTOR 2 — Ganhos Diretos
 *   10%: planos anuais, gestão de frota, rastreadores portáteis, acessórios, serviços técnicos
 *   5%: franquias
 *
 * MOTOR 3 — Carreira e Recorrência Mensal
 *   Bronze  (300+  placas ativas) → 3%/mês
 *   Prata   (600+  placas ativas) → 4%/mês
 *   Ouro    (900+  placas ativas) → 5%/mês
 *   Diamante(1200+ placas ativas) → 6%/mês
 *
 * MOTOR 4 — Compliance
 *   Liberação condicionada: documentação + contrato + ativação + validação financeira
 *
 * Base de Cálculo: Valor Líquido (netValue = bruto - descontos - taxas)
 * Ciclo: dia 26 do mês anterior até dia 25 do mês corrente
 * Janela de Recuperação: dias 12-15 do mês seguinte
 * Pagamento: 20º dia útil do mês seguinte
 */

import { prisma } from '@/lib/prisma'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type CareerLevel = 'BRONZE' | 'PRATA' | 'OURO' | 'DIAMANTE' | null

export interface CommissionCalculationResult {
  motor: string
  parcelaType: string
  baseValue: number
  percentage: number
  amount: number
  careerLevel?: CareerLevel
  activePlates?: number
  escalatedPercentage?: number
  salesCountInCycle?: number
  fatorGerador: string
}

export interface Motor1Input {
  orderId: string
  netValue: number
  planType: 'MONTHLY' | 'ANNUAL'
  planName?: string
  userId: string
  tenantId: string
  cycleId: string
  salesCountInCycle: number // Vendas válidas no ciclo atual (para escalonamento)
}

export interface Motor2Input {
  orderId: string
  netValue: number
  productCategory: string // RASTREAMENTO | GESTAO_FROTA | PORTATIL | ACESSORIO | SERVICO_TECNICO | FRANQUIA
  planType?: 'MONTHLY' | 'ANNUAL'
  planName?: string
  userId: string
  tenantId: string
  cycleId: string
}

export interface Motor3Input {
  userId: string
  tenantId: string
  cycleId: string
  activePlatesCount: number // Placas ativas do promotor
  monthlyBaseRevenue: number // Receita mensal base do portfólio ativo
}

export interface Motor4ComplianceInput {
  entryId: string // ID da CommissionEntry para validar
  documentOk: boolean
  contractOk: boolean
  activationOk: boolean
  financialOk: boolean
  userId: string // Quem está validando (FINANCIAL/ADMIN)
}

// ─── Constantes VAPEC 2026 v1.4 ──────────────────────────────────────────────

export const VAPEC_POLICY = {
  MOTOR1: {
    BASE_PERCENTAGE: 10, // 10% base
    ESCALATION_STEP: 3,  // +3% a cada 10 vendas
    ESCALATION_EVERY: 10, // vendas para próximo nível
    MAX_PERCENTAGE: 25,  // teto de escalonamento (10 + 3*5 = 25% com 50+ vendas)
    RETENCAO1_FIXED: 10, // R$10 fixo na retenção mês 1
    RETENCAO2_FIXED: 10, // R$10 fixo na retenção mês 2
  },
  MOTOR2: {
    ANNUAL_PLAN_PCT: 10,    // 10% planos anuais
    FLEET_MGMT_PCT: 10,     // 10% gestão de frota
    PORTABLE_PCT: 10,       // 10% rastreadores portáteis
    ACCESSORIES_PCT: 10,    // 10% acessórios
    TECH_SERVICE_PCT: 10,   // 10% serviços técnicos
    FRANCHISE_PCT: 5,       // 5% franquias
  },
  MOTOR3: {
    BRONZE_THRESHOLD: 300,    // 300 placas ativas
    PRATA_THRESHOLD: 600,     // 600 placas ativas
    OURO_THRESHOLD: 900,      // 900 placas ativas
    DIAMANTE_THRESHOLD: 1200, // 1200 placas ativas
    BRONZE_PCT: 3,            // 3%/mês
    PRATA_PCT: 4,             // 4%/mês
    OURO_PCT: 5,              // 5%/mês
    DIAMANTE_PCT: 6,          // 6%/mês
  },
} as const

// ─── Funções auxiliares ───────────────────────────────────────────────────────

/**
 * Determina o nível de carreira com base no número de placas ativas
 */
export function getCareerLevel(activePlates: number): CareerLevel {
  if (activePlates >= VAPEC_POLICY.MOTOR3.DIAMANTE_THRESHOLD) return 'DIAMANTE'
  if (activePlates >= VAPEC_POLICY.MOTOR3.OURO_THRESHOLD) return 'OURO'
  if (activePlates >= VAPEC_POLICY.MOTOR3.PRATA_THRESHOLD) return 'PRATA'
  if (activePlates >= VAPEC_POLICY.MOTOR3.BRONZE_THRESHOLD) return 'BRONZE'
  return null
}

/**
 * Retorna o percentual de recorrência mensal por nível de carreira
 */
export function getCareerPercentage(level: CareerLevel): number {
  switch (level) {
    case 'DIAMANTE': return VAPEC_POLICY.MOTOR3.DIAMANTE_PCT
    case 'OURO': return VAPEC_POLICY.MOTOR3.OURO_PCT
    case 'PRATA': return VAPEC_POLICY.MOTOR3.PRATA_PCT
    case 'BRONZE': return VAPEC_POLICY.MOTOR3.BRONZE_PCT
    default: return 0
  }
}

/**
 * Calcula o percentual escalonado do Motor 1
 * Base 10% + 3% a cada 10 vendas válidas
 */
export function calculateMotor1Percentage(salesCount: number): number {
  const extra = Math.floor(salesCount / VAPEC_POLICY.MOTOR1.ESCALATION_EVERY) * VAPEC_POLICY.MOTOR1.ESCALATION_STEP
  return Math.min(
    VAPEC_POLICY.MOTOR1.BASE_PERCENTAGE + extra,
    VAPEC_POLICY.MOTOR1.MAX_PERCENTAGE,
  )
}

// ─── MOTOR 1 — Planos Mensais ─────────────────────────────────────────────────

/**
 * Calcula e persiste comissões Motor 1 para um pedido de plano mensal.
 * Gera 3 CommissionEntry: AQUISICAO + RETENCAO1 + RETENCAO2
 */
export async function calculateMotor1(input: Motor1Input): Promise<CommissionCalculationResult[]> {
  const { orderId, netValue, planName, userId, tenantId, cycleId, salesCountInCycle } = input

  // Percentual escalonado baseado no histórico de vendas no ciclo
  const percentage = calculateMotor1Percentage(salesCountInCycle)
  const acquisitionAmount = (netValue * percentage) / 100

  const entries: CommissionCalculationResult[] = []

  // Parcela 1: Aquisição
  const aquisicaoEntry = await prisma.commissionEntry.create({
    data: {
      cycleId,
      userId,
      orderId,
      tenantId,
      motor: 'MOTOR1',
      parcelaType: 'AQUISICAO',
      baseValue: netValue,
      percentage,
      amount: acquisitionAmount,
      escalatedPercentage: percentage,
      salesCountInCycle,
      status: 'PENDING',
      fatorGerador: `Motor 1 - Aquisição: ${planName ?? 'Plano Mensal'} | Venda #${salesCountInCycle + 1} no ciclo | ${percentage}% sobre R$ ${netValue.toFixed(2)}`,
    },
  })
  entries.push({
    motor: 'MOTOR1',
    parcelaType: 'AQUISICAO',
    baseValue: netValue,
    percentage,
    amount: acquisitionAmount,
    escalatedPercentage: percentage,
    salesCountInCycle,
    fatorGerador: aquisicaoEntry.fatorGerador ?? '',
  })

  // Parcela 2: Retenção Mês 1 (R$10 fixo)
  const retencao1 = VAPEC_POLICY.MOTOR1.RETENCAO1_FIXED
  const retencao1Entry = await prisma.commissionEntry.create({
    data: {
      cycleId,
      userId,
      orderId,
      tenantId,
      motor: 'MOTOR1',
      parcelaType: 'RETENCAO1',
      baseValue: retencao1,
      percentage: 100,
      amount: retencao1,
      salesCountInCycle,
      status: 'PENDING',
      fatorGerador: `Motor 1 - Retenção Mês 1: ${planName ?? 'Plano Mensal'} | R$ ${retencao1.toFixed(2)} fixo`,
    },
  })
  entries.push({
    motor: 'MOTOR1',
    parcelaType: 'RETENCAO1',
    baseValue: retencao1,
    percentage: 100,
    amount: retencao1,
    salesCountInCycle,
    fatorGerador: retencao1Entry.fatorGerador ?? '',
  })

  // Parcela 3: Retenção Mês 2 (R$10 fixo)
  const retencao2 = VAPEC_POLICY.MOTOR2.ACCESSORIES_PCT
  const retencao2Entry = await prisma.commissionEntry.create({
    data: {
      cycleId,
      userId,
      orderId,
      tenantId,
      motor: 'MOTOR1',
      parcelaType: 'RETENCAO2',
      baseValue: retencao2,
      percentage: 100,
      amount: retencao2,
      salesCountInCycle,
      status: 'PENDING',
      fatorGerador: `Motor 1 - Retenção Mês 2: ${planName ?? 'Plano Mensal'} | R$ ${retencao2.toFixed(2)} fixo`,
    },
  })
  entries.push({
    motor: 'MOTOR1',
    parcelaType: 'RETENCAO2',
    baseValue: retencao2,
    percentage: 100,
    amount: retencao2,
    salesCountInCycle,
    fatorGerador: retencao2Entry.fatorGerador ?? '',
  })

  // Marcar pedido como comissão gerada
  await prisma.order.update({
    where: { id: orderId },
    data: { commissionGenerated: true },
  })

  return entries
}

// ─── MOTOR 2 — Ganhos Diretos ─────────────────────────────────────────────────

/**
 * Calcula e persiste comissão Motor 2 (ganho direto) para venda de produto específico.
 */
export async function calculateMotor2(input: Motor2Input): Promise<CommissionCalculationResult> {
  const { orderId, netValue, productCategory, planType, planName, userId, tenantId, cycleId } = input

  // Determinar percentual pela categoria do produto
  let percentage = 0
  let desc = ''

  if (planType === 'ANNUAL') {
    percentage = VAPEC_POLICY.MOTOR2.ANNUAL_PLAN_PCT
    desc = 'Plano Anual'
  } else {
    switch (productCategory.toUpperCase()) {
      case 'GESTAO_FROTA':
        percentage = VAPEC_POLICY.MOTOR2.FLEET_MGMT_PCT
        desc = 'Gestão de Frota'
        break
      case 'RASTREADOR_PORTATIL':
        percentage = VAPEC_POLICY.MOTOR2.PORTABLE_PCT
        desc = 'Rastreador Portátil'
        break
      case 'ACESSORIO':
        percentage = VAPEC_POLICY.MOTOR2.ACCESSORIES_PCT
        desc = 'Acessório'
        break
      case 'SERVICO_TECNICO':
        percentage = VAPEC_POLICY.MOTOR2.TECH_SERVICE_PCT
        desc = 'Serviço Técnico'
        break
      case 'FRANQUIA':
        percentage = VAPEC_POLICY.MOTOR2.FRANCHISE_PCT
        desc = 'Franquia'
        break
      default:
        percentage = VAPEC_POLICY.MOTOR2.ANNUAL_PLAN_PCT
        desc = productCategory
    }
  }

  const amount = (netValue * percentage) / 100

  await prisma.commissionEntry.create({
    data: {
      cycleId,
      userId,
      orderId,
      tenantId,
      motor: 'MOTOR2',
      parcelaType: 'DIRECT',
      baseValue: netValue,
      percentage,
      amount,
      status: 'PENDING',
      fatorGerador: `Motor 2 - Ganho Direto: ${desc} — ${planName ?? productCategory} | ${percentage}% sobre R$ ${netValue.toFixed(2)}`,
    },
  })

  await prisma.order.update({
    where: { id: orderId },
    data: { commissionGenerated: true },
  })

  return {
    motor: 'MOTOR2',
    parcelaType: 'DIRECT',
    baseValue: netValue,
    percentage,
    amount,
    fatorGerador: `Motor 2: ${desc} — ${percentage}% sobre R$ ${netValue.toFixed(2)}`,
  }
}

// ─── MOTOR 3 — Carreira / Recorrência Mensal ──────────────────────────────────

/**
 * Calcula e persiste comissão recorrente Motor 3 para o promotor no fechamento do ciclo.
 * Baseado no portfólio de placas ativas do promotor.
 */
export async function calculateMotor3(input: Motor3Input): Promise<CommissionCalculationResult | null> {
  const { userId, tenantId, cycleId, activePlatesCount, monthlyBaseRevenue } = input

  const level = getCareerLevel(activePlatesCount)
  if (!level) return null // Abaixo de 300 placas, sem Motor 3

  const percentage = getCareerPercentage(level)
  const amount = (monthlyBaseRevenue * percentage) / 100

  await prisma.commissionEntry.create({
    data: {
      cycleId,
      userId,
      tenantId,
      motor: 'MOTOR3',
      parcelaType: 'RECORRENCIA',
      careerLevel: level,
      activePlates: activePlatesCount,
      baseValue: monthlyBaseRevenue,
      percentage,
      amount,
      status: 'PENDING',
      fatorGerador: `Motor 3 - Carreira ${level}: ${activePlatesCount} placas ativas | ${percentage}% sobre MRR R$ ${monthlyBaseRevenue.toFixed(2)}`,
    },
  })

  return {
    motor: 'MOTOR3',
    parcelaType: 'RECORRENCIA',
    baseValue: monthlyBaseRevenue,
    percentage,
    amount,
    careerLevel: level,
    activePlates: activePlatesCount,
    fatorGerador: `Motor 3: Nível ${level} — ${percentage}%/mês sobre R$ ${monthlyBaseRevenue.toFixed(2)}`,
  }
}

// ─── MOTOR 4 — Compliance ────────────────────────────────────────────────────

/**
 * Valida ou bloqueia uma CommissionEntry com base nos critérios de compliance.
 * Todos os 4 critérios devem ser true para VALIDATED; caso contrário, BLOCKED.
 */
export async function validateMotor4Compliance(input: Motor4ComplianceInput): Promise<{
  status: 'VALIDATED' | 'BLOCKED'
  missingItems: string[]
}> {
  const { entryId, documentOk, contractOk, activationOk, financialOk, userId } = input

  const missingItems: string[] = []
  if (!documentOk) missingItems.push('Documentação')
  if (!contractOk) missingItems.push('Contrato assinado')
  if (!activationOk) missingItems.push('Ativação confirmada')
  if (!financialOk) missingItems.push('Validação financeira')

  const newStatus = missingItems.length === 0 ? 'VALIDATED' : 'BLOCKED'

  await prisma.commissionEntry.update({
    where: { id: entryId },
    data: {
      documentOk,
      contractOk,
      activationOk,
      financialOk,
      status: newStatus,
      notes: missingItems.length > 0
        ? `Pendências Motor 4: ${missingItems.join(', ')}`
        : `Compliance OK — validado por ${userId}`,
    },
  })

  return { status: newStatus, missingItems }
}

// ─── Orquestrador principal ───────────────────────────────────────────────────

/**
 * Gera todas as comissões para um pedido confirmado.
 * Determina automaticamente Motor 1 ou Motor 2 com base no produto.
 */
export async function generateCommissionsForOrder(
  orderId: string,
  tenantId: string,
): Promise<CommissionCalculationResult[]> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { product: true, promoter: true },
  })

  if (!order) throw new Error('Pedido não encontrado')
  if (order.commissionGenerated) throw new Error('Comissões já geradas para este pedido')
  if (!order.promoterId) throw new Error('Pedido sem promotor vinculado')

  // Buscar ou criar ciclo ativo
  const cycle = await getOrCreateActiveCycle(tenantId)

  // Contar vendas válidas do promotor no ciclo atual (para escalonamento Motor 1)
  const salesCountInCycle = await prisma.commissionEntry.count({
    where: {
      userId: order.promoterId,
      cycleId: cycle.id,
      motor: 'MOTOR1',
      parcelaType: 'AQUISICAO',
      status: { notIn: ['GLOSA', 'BLOCKED'] },
    },
  })

  const results: CommissionCalculationResult[] = []
  const productCategory = order.product?.type ?? 'SUBSCRIPTION_PLAN'

  // Determinar qual motor usar
  const isMonthlyPlan = order.planType === 'MONTHLY' && productCategory === 'SUBSCRIPTION_PLAN'
  const isAnnualPlan = order.planType === 'ANNUAL'

  if (isMonthlyPlan) {
    // Motor 1 — Planos mensais
    const motor1Results = await calculateMotor1({
      orderId,
      netValue: order.netValue,
      planType: 'MONTHLY',
      planName: order.planName ?? undefined,
      userId: order.promoterId,
      tenantId,
      cycleId: cycle.id,
      salesCountInCycle,
    })
    results.push(...motor1Results)
  } else {
    // Motor 2 — Ganhos diretos (anual, frota, acessório, etc.)
    const motor2Result = await calculateMotor2({
      orderId,
      netValue: order.netValue,
      productCategory: isAnnualPlan ? 'ANNUAL' : (order.product?.type ?? 'RASTREAMENTO'),
      planType: isAnnualPlan ? 'ANNUAL' : 'MONTHLY',
      planName: order.planName ?? undefined,
      userId: order.promoterId,
      tenantId,
      cycleId: cycle.id,
    })
    results.push(motor2Result)
  }

  return results
}

// ─── Buscar ou criar ciclo ativo ─────────────────────────────────────────────

export async function getOrCreateActiveCycle(tenantId: string) {
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()

  // Determinar competência atual (ciclo: 26 do mês anterior ao 25 do mês corrente)
  const competencia = `${String(month + 1).padStart(2, '0')}/${year}`

  // Verificar se ciclo já existe
  const existing = await prisma.commissionCycle.findFirst({
    where: { tenantId, competencia, status: { in: ['OPEN', 'CLOSING'] } },
  })

  if (existing) return existing

  // Calcular datas do ciclo
  const startDate = new Date(year, month - 1, 26) // Dia 26 do mês anterior
  const endDate = new Date(year, month, 25)         // Dia 25 do mês corrente
  const financialCutoff = new Date(year, month + 1, 15) // Dia 15 do próximo mês
  const recoveryWindowStart = new Date(year, month + 1, 12) // Dia 12 do próximo mês
  const recoveryWindowEnd = new Date(year, month + 1, 15)   // Dia 15 do próximo mês

  return prisma.commissionCycle.create({
    data: {
      tenantId,
      competencia,
      startDate,
      endDate,
      financialCutoff,
      recoveryWindowStart,
      recoveryWindowEnd,
      status: 'OPEN',
    },
  })
}

// ─── Resumo de comissões por promotor ────────────────────────────────────────

export interface PromoterCommissionSummary {
  userId: string
  userName: string
  motor1Total: number
  motor2Total: number
  motor3Total: number
  motor4Validated: number
  grandTotal: number
  pendingCount: number
  validatedCount: number
  salesCount: number
  careerLevel: CareerLevel
  activePlates: number
}

export async function getPromoterCommissionSummary(
  tenantId: string,
  cycleId: string,
): Promise<PromoterCommissionSummary[]> {
  const entries = await prisma.commissionEntry.findMany({
    where: { tenantId, cycleId },
    include: { user: { select: { id: true, nome: true } } },
  })

  const byUser = new Map<string, CommissionEntry[]>()
  for (const entry of entries) {
    const list = byUser.get(entry.userId) ?? []
    list.push(entry as CommissionEntry)
    byUser.set(entry.userId, list)
  }

  const summaries: PromoterCommissionSummary[] = []

  for (const [userId, userEntries] of byUser.entries()) {
    const user = userEntries[0] as any
    const motor1 = userEntries.filter((e) => e.motor === 'MOTOR1')
    const motor2 = userEntries.filter((e) => e.motor === 'MOTOR2')
    const motor3 = userEntries.filter((e) => e.motor === 'MOTOR3')

    const motor1Total = motor1.reduce((s, e) => s + e.amount, 0)
    const motor2Total = motor2.reduce((s, e) => s + e.amount, 0)
    const motor3Total = motor3.reduce((s, e) => s + e.amount, 0)
    const validatedTotal = userEntries
      .filter((e) => e.status === 'VALIDATED')
      .reduce((s, e) => s + e.amount, 0)

    const salesCount = userEntries.filter(
      (e) => e.motor === 'MOTOR1' && e.parcelaType === 'AQUISICAO',
    ).length

    const latestMotor3 = motor3[motor3.length - 1]
    const activePlates = (latestMotor3 as any)?.activePlates ?? 0

    summaries.push({
      userId,
      userName: user.user?.nome ?? userId,
      motor1Total,
      motor2Total,
      motor3Total,
      motor4Validated: validatedTotal,
      grandTotal: motor1Total + motor2Total + motor3Total,
      pendingCount: userEntries.filter((e) => e.status === 'PENDING').length,
      validatedCount: userEntries.filter((e) => e.status === 'VALIDATED').length,
      salesCount,
      careerLevel: getCareerLevel(activePlates),
      activePlates,
    })
  }

  return summaries.sort((a, b) => b.grandTotal - a.grandTotal)
}

// Tipo auxiliar para TypeScript
type CommissionEntry = {
  id: string
  userId: string
  motor: string
  parcelaType: string
  amount: number
  status: string
  activePlates: number | null
  fatorGerador: string | null
  user?: { id: string; nome: string }
}

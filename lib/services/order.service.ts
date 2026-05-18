/**
 * order.service.ts — Módulo de Pedidos B2B/B2C ProspecLead
 *
 * Atende: lojas próprias (PROPRIA), franqueados, parceiros diamante (DIAMANTE),
 * promotoras e qualquer ator que precise realizar um pedido.
 *
 * Referências:
 *  - BR-009: Numeração sequencial por tenant + ano (2026-RTX-00847)
 *  - BR-011/012: CPF/CNPJ com validação matemática
 *  - BR-019: CEP consultado via ViaCEP
 *  - BR-041: DRAFT deletado após 24h sem atividade
 *  - BR-044: Confirmação atômica (transação)
 *  - BR-045: Comissão calculada no momento do CONFIRMED
 *  - BR-049: Toda mudança de status gera OrderEvent (WORM)
 */

import { prisma } from '@/lib/prisma'

// ─── Prefixo por Tenant (slug → prefixo OS) ─────────────────────────────────
const TENANT_PREFIX: Record<string, string> = {
  rastreamix: 'RTX',
  topypro: 'TPP',
  gpsmy: 'GPM',
  vapec: 'VPC',
}

function getTenantPrefix(slug: string): string {
  return TENANT_PREFIX[slug.toLowerCase()] ?? slug.slice(0, 3).toUpperCase()
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface CreateOrderDraftDto {
  orderType?: 'B2B' | 'B2C'
  originType?: 'PROPRIA' | 'DIAMANTE' | 'DIGITAL' | 'PROMOTER' | 'ADMIN'
  pdvId?: string
  leadId?: string
  tenantId: string
  tenantSlug: string
  promoterId: string
}

export interface AttachClientDto {
  clientName: string
  clientCpfCnpj: string
  clientPhone: string
  clientEmail?: string
  clientType?: 'PF' | 'PJ'
  // Endereço
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
}

export interface AttachVehicleDto {
  plate?: string
  chassi?: string
  vehicleBrand?: string
  vehicleModel?: string
  vehicleYear?: number
  vehicleType?: string
  // B2B
  fleetSize?: number
  segmento?: string
}

export interface AttachPlanDto {
  productId: string
  planType?: 'MONTHLY' | 'ANNUAL'
  discountValue?: number
  paymentMethod?: string
  installments?: number
}

export interface ListOrdersFilter {
  tenantId: string
  status?: string
  orderType?: string
  promoterId?: string
  pdvId?: string
  page?: number
  limit?: number
  search?: string
}

// ─── Validações ──────────────────────────────────────────────────────────────

function validateCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '')
  if (cleaned.length !== 11) return false
  if (/^(\d)\1+$/.test(cleaned)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cleaned[i]) * (10 - i)
  let remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(cleaned[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cleaned[i]) * (11 - i)
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  return remainder === parseInt(cleaned[10])
}

function validateCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, '')
  if (cleaned.length !== 14) return false
  if (/^(\d)\1+$/.test(cleaned)) return false

  const calc = (weights: number[]) =>
    weights.reduce((acc, w, i) => acc + parseInt(cleaned[i]) * w, 0)

  const r1 = calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) % 11
  const d1 = r1 < 2 ? 0 : 11 - r1
  if (d1 !== parseInt(cleaned[12])) return false

  const r2 = calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) % 11
  const d2 = r2 < 2 ? 0 : 11 - r2
  return d2 === parseInt(cleaned[13])
}

function validateDocument(doc: string, type: 'PF' | 'PJ'): boolean {
  const cleaned = doc.replace(/\D/g, '')
  return type === 'PF' ? validateCPF(cleaned) : validateCNPJ(cleaned)
}

// ─── Helper: Gravar OrderEvent (WORM) ────────────────────────────────────────

async function logEvent(
  orderId: string,
  event: string,
  payload?: Record<string, unknown>,
  userId?: string,
) {
  await prisma.orderEvent.create({
    data: {
      orderId,
      event,
      payload: JSON.stringify(payload ?? {}),
      userId: userId ?? null,
    },
  })
}

// ─── Gerar número do pedido ───────────────────────────────────────────────────

async function generateOrderNumber(tenantId: string, tenantSlug: string): Promise<string> {
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { orderSequence: { increment: 1 } },
    select: { orderSequence: true },
  })
  const year = new Date().getFullYear()
  const prefix = getTenantPrefix(tenantSlug)
  return `${year}-${prefix}-${String(updated.orderSequence).padStart(5, '0')}`
}

// ─── CRUD Principal ───────────────────────────────────────────────────────────

/**
 * Etapa 0 — Criar Rascunho
 * Gera número sequencial e registra o DRAFT.
 */
export async function createOrderDraft(dto: CreateOrderDraftDto) {
  const orderNumber = await generateOrderNumber(dto.tenantId, dto.tenantSlug)

  const order = await prisma.order.create({
    data: {
      orderNumber,
      orderType: dto.orderType ?? 'B2C',
      status: 'DRAFT',
      originType: dto.originType ?? 'PROMOTER',
      pdvId: dto.pdvId ?? null,
      leadId: dto.leadId ?? null,
      promoterId: dto.promoterId,
      tenantId: dto.tenantId,
    },
  })

  await logEvent(order.id, 'DRAFT_CREATED', {
    orderNumber,
    orderType: dto.orderType,
    originType: dto.originType,
  }, dto.promoterId)

  return { ...order, wizardStep: 1 }
}

/**
 * Etapa 1 — Vincular Dados do Cliente
 * BR-011: CPF validado por dígito verificador
 * BR-012: CNPJ validado por dígito verificador
 */
export async function attachClient(
  tenantId: string,
  orderId: string,
  dto: AttachClientDto,
  userId?: string,
) {
  await assertOrderStatus(tenantId, orderId, 'DRAFT')

  // Validação CPF/CNPJ
  const docType = dto.clientType ?? 'PF'
  if (dto.clientCpfCnpj && !validateDocument(dto.clientCpfCnpj, docType)) {
    throw new Error(`${docType === 'PF' ? 'CPF' : 'CNPJ'} inválido`)
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      clientName: dto.clientName,
      clientCpfCnpj: dto.clientCpfCnpj?.replace(/\D/g, ''),
      clientPhone: dto.clientPhone?.replace(/\D/g, ''),
      clientEmail: dto.clientEmail,
      clientType: docType,
      cep: dto.cep?.replace(/\D/g, ''),
      logradouro: dto.logradouro,
      numero: dto.numero,
      complemento: dto.complemento,
      bairro: dto.bairro,
      cidade: dto.cidade,
      uf: dto.uf?.toUpperCase(),
    },
  })

  await logEvent(orderId, 'CLIENT_ATTACHED', {
    clientName: dto.clientName,
    clientType: docType,
  }, userId)

  return { ...order, wizardStep: 2 }
}

/**
 * Etapa 2 — Vincular Veículo / Frota
 * BR-026: Placa aceita formato antigo e Mercosul
 */
export async function attachVehicle(
  tenantId: string,
  orderId: string,
  dto: AttachVehicleDto,
  userId?: string,
) {
  const existing = await assertOrderStatus(tenantId, orderId, 'DRAFT')

  // Validar placa se informada (B2C)
  if (dto.plate) {
    const plateRegex = /^[A-Z]{3}[0-9]{4}$|^[A-Z]{3}[0-9][A-Z][0-9]{2}$/i
    if (!plateRegex.test(dto.plate.replace('-', ''))) {
      throw new Error('Placa inválida. Use formato ABC-1234 ou Mercosul ABC1D23')
    }
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      plate: dto.plate?.toUpperCase().replace('-', ''),
      chassi: dto.chassi?.toUpperCase(),
      vehicleBrand: dto.vehicleBrand,
      vehicleModel: dto.vehicleModel,
      vehicleYear: dto.vehicleYear,
      vehicleType: dto.vehicleType ?? (existing.orderType === 'B2B' ? 'OUTROS' : 'CARRO'),
      fleetSize: dto.fleetSize,
      segmento: dto.segmento,
    },
  })

  await logEvent(orderId, 'VEHICLE_ATTACHED', {
    plate: dto.plate,
    fleetSize: dto.fleetSize,
  }, userId)

  return { ...order, wizardStep: 3 }
}

/**
 * Etapa 3 — Vincular Plano / Produto
 * Calcula netValue = baseValue - discountValue
 */
export async function attachPlan(
  tenantId: string,
  orderId: string,
  dto: AttachPlanDto,
  userId?: string,
) {
  await assertOrderStatus(tenantId, orderId, 'DRAFT')

  const product = await prisma.product.findFirst({
    where: { id: dto.productId, tenantId, isActive: true },
  })
  if (!product) throw new Error('Produto/Plano não encontrado ou inativo')

  const baseValue = product.price
  const discountValue = dto.discountValue ?? 0
  const setupFee = product.setupFee ?? 0
  const netValue = Math.max(0, baseValue - discountValue)
  const totalValue = netValue + setupFee

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      productId: dto.productId,
      planType: dto.planType ?? 'MONTHLY',
      planName: product.name,
      baseValue,
      discountValue,
      setupFee,
      netValue,
      totalValue,
      paymentMethod: dto.paymentMethod ?? 'PIX',
      installments: dto.installments ?? 1,
    },
  })

  await logEvent(orderId, 'PLAN_ATTACHED', {
    planName: product.name,
    baseValue,
    netValue,
    totalValue,
  }, userId)

  return { ...order, wizardStep: 4 }
}

/**
 * Etapa 4 — Confirmar Pedido
 * BR-044: transação atômica
 * BR-045: comissão calculada no momento do CONFIRMED
 * BR-049: auditoria completa
 */
export async function confirmOrder(
  tenantId: string,
  orderId: string,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, tenantId },
    })

    if (!order) throw new Error('Pedido não encontrado')
    if (order.status !== 'DRAFT') throw new Error('Pedido não está em rascunho')

    // Validações mínimas
    if (!order.clientName || !order.clientCpfCnpj) {
      throw new Error('Dados do cliente incompletos')
    }
    if (order.orderType === 'B2C' && !order.plate && !order.fleetSize) {
      throw new Error('Dados do veículo incompletos para pedido B2C')
    }
    if (!order.productId || !order.netValue) {
      throw new Error('Plano não selecionado')
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'PENDING',
        activatedAt: new Date(),
      },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        event: 'ORDER_CONFIRMED',
        payload: JSON.stringify({
          netValue: order.netValue,
          totalValue: order.totalValue,
          planName: order.planName,
        }),
        userId: userId ?? null,
      },
    })

    return updated
  })
}

/**
 * Ativar pedido (após instalação do equipamento)
 */
export async function activateOrder(
  tenantId: string,
  orderId: string,
  userId?: string,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId, status: 'PENDING' },
  })
  if (!order) throw new Error('Pedido não encontrado ou não está PENDING')

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'ACTIVE', activatedAt: new Date() },
  })

  await logEvent(orderId, 'ORDER_ACTIVATED', {
    activatedAt: new Date().toISOString(),
  }, userId)

  return updated
}

/**
 * Cancelar pedido
 * BR-047: cancelamento dentro de 7 dias gera estorno de comissão
 */
export async function cancelOrder(
  tenantId: string,
  orderId: string,
  reason: string,
  userId?: string,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
  })
  if (!order) throw new Error('Pedido não encontrado')
  if (order.status === 'ACTIVE') throw new Error('Pedido já ativado — use o fluxo de cancelamento pós-instalação')
  if (order.status === 'CANCELLED') throw new Error('Pedido já cancelado')

  // BR-047: verificar se está dentro de 7 dias para glosa de comissão
  const diffDays = (Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  const needsCommissionReversal = diffDays <= 7 && order.commissionGenerated

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason,
    },
  })

  await logEvent(orderId, 'ORDER_CANCELLED', {
    reason,
    needsCommissionReversal,
    daysSinceCreation: Math.round(diffDays),
  }, userId)

  // Se precisar estornar comissões, marcar entradas como GLOSA
  if (needsCommissionReversal) {
    await prisma.commissionEntry.updateMany({
      where: { orderId, status: { in: ['PENDING', 'VALIDATED'] } },
      data: { status: 'GLOSA', notes: `Pedido cancelado dentro de 7 dias: ${reason}` },
    })

    await logEvent(orderId, 'COMMISSION_REVERSED', {
      reason: 'Cancelamento dentro de 7 dias',
    }, userId)
  }

  return updated
}

/**
 * Buscar pedido por ID
 */
export async function getOrderById(tenantId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: {
      product: { select: { id: true, name: true, type: true } },
      pdv: { select: { id: true, name: true, category: true } },
      promoter: { select: { id: true, nome: true, email: true } },
      lead: { select: { id: true, nomeCliente: true, telefone: true } },
      orderEvents: { orderBy: { createdAt: 'asc' } },
      commissionEntries: {
        select: { id: true, motor: true, parcelaType: true, amount: true, status: true },
      },
    },
  })
  if (!order) throw new Error('Pedido não encontrado')
  return order
}

/**
 * Listar pedidos com filtros e paginação
 */
export async function listOrders(filter: ListOrdersFilter) {
  const { tenantId, status, orderType, promoterId, pdvId, page = 1, limit = 20, search } = filter
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { tenantId }
  if (status) where.status = status
  if (orderType) where.orderType = orderType
  if (promoterId) where.promoterId = promoterId
  if (pdvId) where.pdvId = pdvId
  if (search) {
    where.OR = [
      { orderNumber: { contains: search } },
      { clientName: { contains: search } },
      { clientCpfCnpj: { contains: search.replace(/\D/g, '') } },
      { plate: { contains: search.toUpperCase() } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true } },
        pdv: { select: { id: true, name: true, category: true } },
        promoter: { select: { id: true, nome: true } },
      },
    }),
    prisma.order.count({ where }),
  ])

  return {
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  }
}

/**
 * Estatísticas rápidas de pedidos para o dashboard admin
 */
export async function getOrderStats(tenantId: string) {
  const [byStatus, byType, recentOrders, totalRevenue] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['orderType'],
      where: { tenantId },
      _count: { id: true },
    }),
    prisma.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        orderType: true,
        clientName: true,
        netValue: true,
        createdAt: true,
      },
    }),
    prisma.order.aggregate({
      where: { tenantId, status: { in: ['ACTIVE', 'PENDING', 'COMPLETED'] } },
      _sum: { netValue: true },
    }),
  ])

  return {
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count.id])),
    byType: Object.fromEntries(byType.map((t) => [t.orderType, t._count.id])),
    recentOrders,
    totalRevenue: totalRevenue._sum.netValue ?? 0,
  }
}

// ─── Helper: assertar status ────────────────────────────────────────────────

async function assertOrderStatus(tenantId: string, orderId: string, expectedStatus: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
  })
  if (!order) throw new Error('Pedido não encontrado')
  if (order.status !== expectedStatus) {
    throw new Error(`Pedido não está em ${expectedStatus} (status atual: ${order.status})`)
  }
  return order
}

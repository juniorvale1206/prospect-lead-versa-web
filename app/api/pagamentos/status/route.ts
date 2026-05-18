/**
 * GET /api/pagamentos/status?orderId=xxx
 * Retorna o status de pagamento de um pedido
 * Inclui histórico de eventos de pagamento
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')
    const sessionId = searchParams.get('sessionId')

    if (!orderId && !sessionId) {
      return NextResponse.json({ error: 'orderId ou sessionId obrigatório' }, { status: 400 })
    }

    // Busca o pedido com eventos
    const order = await prisma.order.findFirst({
      where: {
        ...(orderId ? { id: orderId } : {}),
        // RBAC: promotor só vê seus próprios pedidos
        ...(session.role === 'PROMOTER' ? { promoterId: session.userId } : {}),
        ...(session.role !== 'ADMIN_MASTER' && session.tenantId
          ? { tenantId: session.tenantId }
          : {}),
      },
      include: {
        orderEvents: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        promoter: {
          select: { nome: true, email: true },
        },
        product: {
          select: { name: true, price: true },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    }

    // Mapeia status do pedido para mensagem amigável
    const statusLabels: Record<string, { label: string; color: string; icon: string }> = {
      DRAFT: { label: 'Rascunho', color: 'gray', icon: '📝' },
      PENDING: { label: 'Aguardando Pagamento', color: 'yellow', icon: '⏳' },
      ACTIVE: { label: 'Contrato Ativo', color: 'green', icon: '✅' },
      CANCELLED: { label: 'Cancelado', color: 'red', icon: '❌' },
      COMPLETED: { label: 'Concluído', color: 'blue', icon: '🏁' },
    }

    const statusInfo = statusLabels[order.status] ?? { label: order.status, color: 'gray', icon: '❓' }

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      statusInfo,
      orderType: order.orderType,
      planName: order.planName,
      planType: order.planType,
      valores: {
        base: order.baseValue,
        desconto: order.discountValue,
        setup: order.setupFee,
        liquido: order.netValue,
        total: order.totalValue,
      },
      paymentMethod: order.paymentMethod,
      installments: order.installments,
      cliente: {
        nome: order.clientName,
        email: order.clientEmail,
        cpfCnpj: order.clientCpfCnpj,
        tipo: order.clientType,
      },
      promoter: order.promoter,
      activatedAt: order.activatedAt,
      contractSignedAt: order.contractSignedAt,
      cancelledAt: order.cancelledAt,
      eventos: order.orderEvents.map(e => ({
        evento: e.event,
        payload: e.payload ? JSON.parse(e.payload) : null,
        timestamp: e.createdAt,
      })),
      createdAt: order.createdAt,
    })
  } catch (error: any) {
    console.error('[GET /api/pagamentos/status]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

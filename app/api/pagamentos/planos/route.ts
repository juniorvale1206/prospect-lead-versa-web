/**
 * GET /api/pagamentos/planos
 * Retorna catálogo de planos VAPEC com preços mensais e anuais
 * Rota pública (não requer autenticação) — usada pelo checkout
 */

import { NextResponse } from 'next/server'
import { VAPEC_PLANS } from '@/lib/services/stripe.service'

export async function GET() {
  return NextResponse.json({
    planos: VAPEC_PLANS.map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      preco: {
        mensal: plan.monthlyPrice,
        anual: plan.annualPrice,
        economiaAnual: plan.annualSavingPct,
        setupFee: plan.setupFee,
      },
      features: plan.features,
      recommended: plan.recommended ?? false,
      commissionBase: plan.commissionBase,
      maxVehicles: plan.maxVehicles,
    })),
    metodosAceitos: [
      { id: 'pix', label: 'PIX', descricao: 'Aprovação instantânea', taxa: '0,99%' },
      { id: 'card', label: 'Cartão de Crédito', descricao: 'Até 12x', taxa: 'a partir de 2,49%' },
      { id: 'boleto', label: 'Boleto Bancário', descricao: 'Vencimento em 3 dias', taxa: '1,99%' },
    ],
  })
}

/**
 * POST /api/cron/wallet-reconciliation
 * ─────────────────────────────────────────────────────────────────────────────
 * Job de reconciliação financeira — executado pelo cron a cada 10 minutos.
 *
 * FUNÇÃO:
 *   Busca todos os registros do CommissionLedger com status=PAID que ainda
 *   NÃO foram creditados na Wallet (não existem WalletTransaction com o
 *   mesmo commissionLedgerId). Para cada um, chama creditFromLedger().
 *
 * SEGURANÇA:
 *   • Verificação via header X-Cron-Secret (definido no .env)
 *   • Idempotente: múltiplas execuções não criam créditos duplicados
 *   • Processamento em lotes de 50 para evitar timeout
 *
 * CONFIGURAÇÃO:
 *   .env: CRON_SECRET=seu-segredo-aqui
 *   Next.js cron (vercel.json ou similar):
 *     { "path": "/api/cron/wallet-reconciliation", "schedule": "every 10 minutes" }
 *
 * TRIGGER MANUAL (desenvolvimento):
 *   curl -X POST http://localhost:3000/api/cron/wallet-reconciliation \
 *     -H "x-cron-secret: seu-segredo-aqui"
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { creditFromLedger }          from '@/lib/services/wallet.service'

export const dynamic = 'force-dynamic'

const BATCH_SIZE = 50

export async function POST(req: NextRequest) {
  // ── Autenticação do cron ──────────────────────────────────────────────────
  const secret = req.headers.get('x-cron-secret')
  if (
    process.env.CRON_SECRET &&
    secret !== process.env.CRON_SECRET
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const results = {
    processed:  0,
    credited:   0,
    skipped:    0,
    errors:     0,
    errorDetails: [] as string[],
  }

  try {
    // ── Buscar ledger entries PAID sem WalletTransaction correspondente ──────
    //
    // Estratégia: buscar ledgers PAID em lotes e para cada um verificar
    // se já existe uma WalletTransaction com commissionLedgerId = ledger.id
    //
    // Nota: Em SQLite não temos NOT EXISTS eficiente, então buscamos os
    // commissionLedgerIds já creditados e excluímos.
    //
    const alreadyCreditedIds = (
      await prisma.walletTransaction.findMany({
        where:  { commissionLedgerId: { not: null } },
        select: { commissionLedgerId: true },
        distinct: ['commissionLedgerId'],
      })
    ).map((t) => t.commissionLedgerId!)

    const pendingLedgers = await prisma.commissionLedger.findMany({
      where: {
        status:  'PAID',
        amount:  { gt: 0 },
        id:      { notIn: alreadyCreditedIds.length > 0 ? alreadyCreditedIds : ['__none__'] },
      },
      orderBy: { createdAt: 'asc' },
      take:    BATCH_SIZE,
      select: {
        id:          true,
        promotorId:  true,
        amount:      true,
        description: true,
        tenantId:    true,
      },
    })

    console.log(`[WalletReconciliation] ${pendingLedgers.length} entradas para creditar`)

    // ── Processar cada ledger ─────────────────────────────────────────────
    for (const ledger of pendingLedgers) {
      results.processed++
      try {
        const { credited } = await creditFromLedger(
          ledger.promotorId,
          ledger.id,
          ledger.amount,
          `Comissão liquidada: ${ledger.description}`,
          ledger.tenantId,
        )

        if (credited) results.credited++
        else          results.skipped++

      } catch (err) {
        results.errors++
        const msg = err instanceof Error ? err.message : String(err)
        results.errorDetails.push(`Ledger ${ledger.id}: ${msg}`)
        console.error(`[WalletReconciliation] Erro no ledger ${ledger.id}:`, err)
      }
    }

    const elapsed = Date.now() - startedAt

    console.log(
      `[WalletReconciliation] Concluído em ${elapsed}ms | ` +
      `Processados: ${results.processed} | Creditados: ${results.credited} | ` +
      `Já feitos: ${results.skipped} | Erros: ${results.errors}`
    )

    return NextResponse.json({
      success:   true,
      elapsedMs: elapsed,
      results,
      hasMore:   pendingLedgers.length === BATCH_SIZE,
      message:   `${results.credited} comissão(ões) creditada(s) nas carteiras.`,
    })

  } catch (err) {
    console.error('[WalletReconciliation] Erro fatal:', err)
    return NextResponse.json(
      { success: false, error: 'Erro interno no job de reconciliação.' },
      { status: 500 },
    )
  }
}

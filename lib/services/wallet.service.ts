/**
 * lib/services/wallet.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor Financeiro — Carteira dos Promotores e Frentistas
 *
 * RESPONSABILIDADES:
 *   • getOrCreateWallet()   → busca ou cria a Wallet do usuário (lazy init)
 *   • getWalletSummary()    → saldo + extrato paginado + estatísticas
 *   • requestWithdrawal()   → solicitar saque com $transaction seguro
 *   • creditFromLedger()    → creditar Wallet quando CommissionLedger vira PAID
 *   • cancelWithdrawal()    → cancelar saque PENDING (pelo próprio usuário)
 *   • processWithdrawal()   → aprovar ou rejeitar saque (pelo financeiro/admin)
 *
 * SEGURANÇA ANTI-RACE-CONDITION:
 *   Todos os débitos usam prisma.$transaction() com re-leitura do saldo
 *   dentro da transação. O campo `version` funciona como optimistic lock:
 *   se dois saques simultâneos tentarem debitar o mesmo saldo, apenas um
 *   terá o `version` correto e o outro receberá erro de conflito.
 *
 *   Fluxo de saque atômico:
 *     1. BEGIN TRANSACTION
 *     2. SELECT wallet WHERE userId = ? (lê saldo atual)
 *     3. Verifica: availableBalance >= amount
 *     4. UPDATE wallet SET availableBalance -= amount,
 *                          lockedBalance   += amount,
 *                          version         += 1
 *        WHERE id = ? AND version = <versão lida>   ← o lock!
 *     5. Se UPDATE afetou 0 linhas → ROLLBACK → retorna CONCURRENT_UPDATE
 *     6. INSERT WalletTransaction (DEBIT, WITHDRAWAL_REQUEST)
 *     7. INSERT WithdrawalRequest (PENDING)
 *     8. COMMIT
 *
 * VALORES MÍNIMOS E MÁXIMOS:
 *   MIN_WITHDRAWAL = R$ 10,00  (evitar micro-saques)
 *   MAX_WITHDRAWAL = R$ 5.000  (limite operacional por requisição)
 */

import { prisma } from '@/lib/prisma'

// ─── Constantes operacionais ──────────────────────────────────────────────────
export const MIN_WITHDRAWAL     = 10.00      // R$ mínimo por saque
export const MAX_WITHDRAWAL     = 5_000.00   // R$ máximo por saque
export const MAX_PENDING_SAQUES = 3          // saques PENDING simultâneos por usuário

// ─── Tipos de erro tipados ────────────────────────────────────────────────────
export const WalletError = {
  WALLET_NOT_FOUND:       'WALLET_NOT_FOUND',
  INSUFFICIENT_BALANCE:   'INSUFFICIENT_BALANCE',
  AMOUNT_TOO_LOW:         'AMOUNT_TOO_LOW',
  AMOUNT_TOO_HIGH:        'AMOUNT_TOO_HIGH',
  INVALID_PIX_KEY:        'INVALID_PIX_KEY',
  CONCURRENT_UPDATE:      'CONCURRENT_UPDATE',
  TOO_MANY_PENDING:       'TOO_MANY_PENDING',
  REQUEST_NOT_FOUND:      'REQUEST_NOT_FOUND',
  REQUEST_NOT_PENDING:    'REQUEST_NOT_PENDING',
  UNAUTHORIZED:           'UNAUTHORIZED',
  INTERNAL_ERROR:         'INTERNAL_ERROR',
} as const

export type WalletErrorCode = typeof WalletError[keyof typeof WalletError]

export class WalletServiceError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message)
    this.name = 'WalletServiceError'
  }
}

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface WalletSummary {
  wallet: {
    id:               string
    availableBalance: number
    lockedBalance:    number
    version:          number
    createdAt:        Date
    updatedAt:        Date
  }
  pendingCommissions: number   // soma das comissões no CommissionLedger ainda PENDING
  totalEarned:        number   // soma histórica de todos os CREDITs já recebidos
  totalWithdrawn:     number   // soma histórica de todos os saques APPROVED
  transactions:       WalletTx[]
  pagination: {
    total:  number
    page:   number
    limit:  number
    pages:  number
  }
  withdrawals: {
    pending:  PendingWithdrawal[]
    totalPendingAmount: number
  }
}

export interface WalletTx {
  id:                 string
  type:               string   // CREDIT | DEBIT
  source:             string
  amount:             number
  balanceAfter:       number
  description:        string
  commissionLedgerId: string | null
  withdrawalRequestId:string | null
  createdAt:          Date
}

export interface PendingWithdrawal {
  id:          string
  amount:      number
  pixKey:      string
  pixKeyType:  string
  status:      string
  reviewNote:  string | null
  requestedAt: Date
  processedAt: Date | null
}

export interface WithdrawalResult {
  withdrawalRequest: {
    id:          string
    amount:      number
    pixKey:      string
    pixKeyType:  string
    status:      string
    requestedAt: Date
  }
  newAvailableBalance: number
  newLockedBalance:    number
  transaction: {
    id:          string
    type:        string
    amount:      number
    balanceAfter:number
    description: string
    createdAt:   Date
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getOrCreateWallet()
// ─────────────────────────────────────────────────────────────────────────────
// Busca a Wallet do usuário; se não existir, cria com saldo zero (lazy init).
// Garante idempotência: múltiplas chamadas simultâneas não criam duplicatas
// pois userId tem @unique no schema.
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrCreateWallet(
  userId:   string,
  tenantId: string | null = null,
) {
  // Tenta buscar primeiro (caminho comum — O(1))
  const existing = await prisma.wallet.findUnique({ where: { userId } })
  if (existing) return existing

  // Cria com upsert para garantir idempotência em corrida de criação
  return prisma.wallet.upsert({
    where:  { userId },
    update: {},  // não atualiza se já existir
    create: {
      userId,
      availableBalance: 0.0,
      lockedBalance:    0.0,
      version:          0,
      tenantId,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// getWalletSummary()
// ─────────────────────────────────────────────────────────────────────────────

export async function getWalletSummary(
  userId:   string,
  tenantId: string | null = null,
  page      = 1,
  limit     = 20,
): Promise<WalletSummary> {
  // Garante que a wallet existe
  const wallet = await getOrCreateWallet(userId, tenantId)

  const skip = (page - 1) * Math.min(limit, 100)
  const take = Math.min(limit, 100)

  // Busca paralela de todos os dados necessários
  const [transactions, totalTx, pendingCommissions, creditStats, withdrawals] =
    await Promise.all([
      // Extrato paginado
      prisma.walletTransaction.findMany({
        where:   { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id:                  true,
          type:                true,
          source:              true,
          amount:              true,
          balanceAfter:        true,
          description:         true,
          commissionLedgerId:  true,
          withdrawalRequestId: true,
          createdAt:           true,
        },
      }),

      // Total de transações (para paginação)
      prisma.walletTransaction.count({ where: { walletId: wallet.id } }),

      // Comissões pendentes no CommissionLedger (ainda não creditadas na Wallet)
      prisma.commissionLedger.aggregate({
        where:  { promotorId: userId, status: 'PENDING' },
        _sum:   { amount: true },
      }),

      // Histórico: total creditado e total sacado (aprovado)
      prisma.walletTransaction.groupBy({
        by:     ['type'],
        where:  { walletId: wallet.id },
        _sum:   { amount: true },
      }),

      // Saques pendentes (para exibir no sumário)
      prisma.withdrawalRequest.findMany({
        where:   { walletId: wallet.id, status: 'PENDING' },
        orderBy: { requestedAt: 'desc' },
        select: {
          id:          true,
          amount:      true,
          pixKey:      true,
          pixKeyType:  true,
          status:      true,
          reviewNote:  true,
          requestedAt: true,
          processedAt: true,
        },
      }),
    ])

  // Calcular totais por tipo
  const creditTotal    = creditStats.find(s => s.type === 'CREDIT')?._sum.amount ?? 0
  const debitTotal     = creditStats.find(s => s.type === 'DEBIT')?._sum.amount ?? 0
  const pendingAmount  = pendingCommissions._sum.amount ?? 0

  // Total de saques aprovados (somente os de fonte WITHDRAWAL_PAID)
  const approvedWithdrawals = await prisma.walletTransaction.aggregate({
    where:  { walletId: wallet.id, source: 'WITHDRAWAL_PAID' },
    _sum:   { amount: true },
  })

  return {
    wallet: {
      id:               wallet.id,
      availableBalance: round2(wallet.availableBalance),
      lockedBalance:    round2(wallet.lockedBalance),
      version:          wallet.version,
      createdAt:        wallet.createdAt,
      updatedAt:        wallet.updatedAt,
    },
    pendingCommissions: round2(pendingAmount),
    totalEarned:        round2(creditTotal),
    totalWithdrawn:     round2(approvedWithdrawals._sum.amount ?? 0),
    transactions:       transactions as WalletTx[],
    pagination: {
      total:  totalTx,
      page,
      limit:  take,
      pages:  Math.ceil(totalTx / take),
    },
    withdrawals: {
      pending:            withdrawals as PendingWithdrawal[],
      totalPendingAmount: round2(
        withdrawals.reduce((acc, w) => acc + w.amount, 0)
      ),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// requestWithdrawal()
// ─────────────────────────────────────────────────────────────────────────────
//
//  TRANSAÇÃO SEGURA ANTI-RACE-CONDITION:
//
//  O truque está na cláusula WHERE do UPDATE:
//    UPDATE Wallet SET ... version = version + 1
//    WHERE id = ? AND version = <versão lida antes>
//
//  Se outro processo já atualizou a wallet (version mudou), o Prisma
//  retornará RecordNotFound e fazemos rollback → cliente recebe 409.
//  O cliente pode retentar a operação (idempotente do ponto de vista do negócio).
//
// ─────────────────────────────────────────────────────────────────────────────

export async function requestWithdrawal(
  userId:     string,
  tenantId:   string | null,
  amount:     number,
  pixKey:     string,
  pixKeyType: string = 'CPF',
): Promise<WithdrawalResult> {

  // ── Validações de entrada ─────────────────────────────────────────────────
  const amountRounded = round2(amount)

  if (!amountRounded || amountRounded <= 0) {
    throw new WalletServiceError(WalletError.AMOUNT_TOO_LOW,
      'O valor do saque deve ser maior que zero.', 400)
  }
  if (amountRounded < MIN_WITHDRAWAL) {
    throw new WalletServiceError(WalletError.AMOUNT_TOO_LOW,
      `O valor mínimo para saque é R$ ${MIN_WITHDRAWAL.toFixed(2)}.`, 400)
  }
  if (amountRounded > MAX_WITHDRAWAL) {
    throw new WalletServiceError(WalletError.AMOUNT_TOO_HIGH,
      `O valor máximo por saque é R$ ${MAX_WITHDRAWAL.toFixed(2)}.`, 400)
  }
  const trimmedKey = pixKey?.trim()
  if (!trimmedKey || trimmedKey.length < 3) {
    throw new WalletServiceError(WalletError.INVALID_PIX_KEY,
      'Chave Pix inválida.', 400)
  }

  // ── Limite de saques PENDING simultâneos ─────────────────────────────────
  const wallet = await getOrCreateWallet(userId, tenantId)

  const pendingCount = await prisma.withdrawalRequest.count({
    where: { walletId: wallet.id, status: 'PENDING' },
  })
  if (pendingCount >= MAX_PENDING_SAQUES) {
    throw new WalletServiceError(WalletError.TOO_MANY_PENDING,
      `Você já possui ${pendingCount} saque(s) pendente(s). ` +
      `Aguarde o processamento antes de solicitar novos saques.`, 409)
  }

  // ── TRANSAÇÃO ATÔMICA ─────────────────────────────────────────────────────
  //
  //  Usamos prisma.$transaction com uma função callback. Dentro da função,
  //  re-lemos o saldo com SELECT FOR UPDATE (simulado via re-read + version check).
  //  Se a versão mudou entre a leitura e o UPDATE, a transação falha com
  //  P2025 (RecordNotFound) e relançamos como CONCURRENT_UPDATE.
  //
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const result = await prisma.$transaction(async (tx) => {

      // ① Re-ler o saldo atual DENTRO da transação (visão consistente)
      const freshWallet = await tx.wallet.findUnique({
        where: { id: wallet.id },
        select: { id: true, availableBalance: true, lockedBalance: true, version: true },
      })
      if (!freshWallet) {
        throw new WalletServiceError(WalletError.WALLET_NOT_FOUND,
          'Carteira não encontrada.', 404)
      }

      // ② Verificar saldo suficiente
      if (round2(freshWallet.availableBalance) < amountRounded) {
        throw new WalletServiceError(
          WalletError.INSUFFICIENT_BALANCE,
          `Saldo insuficiente. Disponível: R$ ${freshWallet.availableBalance.toFixed(2)} | ` +
          `Solicitado: R$ ${amountRounded.toFixed(2)}.`,
          400,
        )
      }

      const newAvailable = round2(freshWallet.availableBalance - amountRounded)
      const newLocked    = round2(freshWallet.lockedBalance + amountRounded)
      const newVersion   = freshWallet.version + 1

      // ③ UPDATE com optimistic lock (WHERE version = versão lida)
      //    Prisma lança PrismaClientKnownRequestError P2025 se 0 rows afetadas
      const updatedWallet = await tx.wallet.update({
        where: {
          id:      freshWallet.id,
          version: freshWallet.version,  // ← O LOCK!
        },
        data: {
          availableBalance: newAvailable,
          lockedBalance:    newLocked,
          version:          newVersion,
        },
      })

      // ④ Criar o registro do saque (PENDING)
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          walletId:   wallet.id,
          amount:     amountRounded,
          pixKey:     trimmedKey,
          pixKeyType,
          status:     'PENDING',
          tenantId,
        },
      })

      // ⑤ Registrar a transação no extrato (DEBIT)
      const walletTx = await tx.walletTransaction.create({
        data: {
          walletId:            wallet.id,
          type:                'DEBIT',
          source:              'WITHDRAWAL_REQUEST',
          amount:              amountRounded,
          balanceAfter:        newAvailable,
          description:         `Saque Pix solicitado — chave: ${trimmedKey}`,
          withdrawalRequestId: withdrawal.id,
          tenantId,
        },
      })

      return { withdrawal, walletTx, updatedWallet }
    })

    return {
      withdrawalRequest: {
        id:          result.withdrawal.id,
        amount:      result.withdrawal.amount,
        pixKey:      result.withdrawal.pixKey,
        pixKeyType:  result.withdrawal.pixKeyType,
        status:      result.withdrawal.status,
        requestedAt: result.withdrawal.requestedAt,
      },
      newAvailableBalance: round2(result.updatedWallet.availableBalance),
      newLockedBalance:    round2(result.updatedWallet.lockedBalance),
      transaction: {
        id:          result.walletTx.id,
        type:        result.walletTx.type,
        amount:      result.walletTx.amount,
        balanceAfter:result.walletTx.balanceAfter,
        description: result.walletTx.description,
        createdAt:   result.walletTx.createdAt,
      },
    }

  } catch (err) {
    // Re-lançar erros de negócio já tipados
    if (err instanceof WalletServiceError) throw err

    // Optimistic lock falhou: outro processo atualizou a wallet simultaneamente
    const prismaErr = err as { code?: string }
    if (prismaErr.code === 'P2025') {
      throw new WalletServiceError(
        WalletError.CONCURRENT_UPDATE,
        'Conflito de concorrência detectado. Tente novamente em instantes.',
        409,
      )
    }

    console.error('[WalletService.requestWithdrawal]', err)
    throw new WalletServiceError(WalletError.INTERNAL_ERROR,
      'Erro interno ao processar o saque.', 500)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// cancelWithdrawal()
// ─────────────────────────────────────────────────────────────────────────────
// Permite que o próprio usuário cancele um saque PENDING antes do processamento.
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelWithdrawal(
  userId:        string,
  withdrawalId:  string,
): Promise<void> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } })
  if (!wallet) {
    throw new WalletServiceError(WalletError.WALLET_NOT_FOUND,
      'Carteira não encontrada.', 404)
  }

  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
  })
  if (!withdrawal || withdrawal.walletId !== wallet.id) {
    throw new WalletServiceError(WalletError.REQUEST_NOT_FOUND,
      'Pedido de saque não encontrado.', 404)
  }
  if (withdrawal.status !== 'PENDING') {
    throw new WalletServiceError(WalletError.REQUEST_NOT_PENDING,
      `Não é possível cancelar um saque com status "${withdrawal.status}".`, 409)
  }

  await prisma.$transaction(async (tx) => {
    // Estornar o valor bloqueado de volta para o saldo disponível
    const freshWallet = await tx.wallet.findUnique({
      where:  { id: wallet.id },
      select: { availableBalance: true, lockedBalance: true, version: true },
    })
    if (!freshWallet) throw new Error('wallet_gone')

    const newAvailable = round2(freshWallet.availableBalance + withdrawal.amount)
    const newLocked    = round2(Math.max(0, freshWallet.lockedBalance - withdrawal.amount))

    await tx.wallet.update({
      where: { id: wallet.id, version: freshWallet.version },
      data: {
        availableBalance: newAvailable,
        lockedBalance:    newLocked,
        version:          { increment: 1 },
      },
    })

    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data:  { status: 'CANCELLED', processedAt: new Date() },
    })

    await tx.walletTransaction.create({
      data: {
        walletId:            wallet.id,
        type:                'CREDIT',
        source:              'WITHDRAWAL_REVERSED',
        amount:              withdrawal.amount,
        balanceAfter:        newAvailable,
        description:         'Saque cancelado — valor estornado',
        withdrawalRequestId: withdrawalId,
        tenantId:            wallet.tenantId,
      },
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// creditFromLedger()
// ─────────────────────────────────────────────────────────────────────────────
// Chamado quando um CommissionLedger muda de PENDING → PAID.
// Credita o valor na Wallet do promotor atomicamente.
// Idempotente: verifica se já existe um WalletTransaction com o mesmo
// commissionLedgerId antes de criar novo crédito.
// ─────────────────────────────────────────────────────────────────────────────

export async function creditFromLedger(
  promotorId:          string,
  commissionLedgerId:  string,
  amount:              number,
  description:         string,
  tenantId:            string | null = null,
): Promise<{ credited: boolean; newBalance: number }> {

  // Idempotência: verificar se já foi creditado
  const alreadyCredited = await prisma.walletTransaction.findFirst({
    where: { commissionLedgerId },
  })
  if (alreadyCredited) {
    console.warn(
      `[WalletService.creditFromLedger] Ledger ${commissionLedgerId} já creditado — ignorando`
    )
    const wallet = await getOrCreateWallet(promotorId, tenantId)
    return { credited: false, newBalance: wallet.availableBalance }
  }

  const wallet = await getOrCreateWallet(promotorId, tenantId)

  const result = await prisma.$transaction(async (tx) => {
    const freshWallet = await tx.wallet.findUnique({
      where:  { id: wallet.id },
      select: { availableBalance: true, version: true },
    })
    if (!freshWallet) throw new Error('wallet_gone')

    const newBalance = round2(freshWallet.availableBalance + amount)

    const updated = await tx.wallet.update({
      where: { id: wallet.id, version: freshWallet.version },
      data: {
        availableBalance: newBalance,
        version:          { increment: 1 },
      },
    })

    const walletTx = await tx.walletTransaction.create({
      data: {
        walletId:           wallet.id,
        type:               'CREDIT',
        source:             'COMMISSION_PAID',
        amount:             round2(amount),
        balanceAfter:       newBalance,
        description,
        commissionLedgerId,
        tenantId,
      },
    })

    return { updated, walletTx }
  })

  return {
    credited:   true,
    newBalance: round2(result.updated.availableBalance),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// processWithdrawal()
// ─────────────────────────────────────────────────────────────────────────────
// Usado pelo painel web (FINANCIAL / ADMIN_MASTER) para aprovar ou rejeitar.
// ─────────────────────────────────────────────────────────────────────────────

export async function processWithdrawal(
  withdrawalId:  string,
  action:        'APPROVED' | 'REJECTED',
  reviewNote:    string | null = null,
  reviewedById:  string | null = null,
): Promise<{ withdrawal: { id: string; status: string; amount: number } }> {

  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:   { id: withdrawalId },
    include: { wallet: true },
  })
  if (!withdrawal) {
    throw new WalletServiceError(WalletError.REQUEST_NOT_FOUND,
      'Pedido de saque não encontrado.', 404)
  }
  if (withdrawal.status !== 'PENDING') {
    throw new WalletServiceError(WalletError.REQUEST_NOT_PENDING,
      `Saque já foi processado com status "${withdrawal.status}".`, 409)
  }

  await prisma.$transaction(async (tx) => {
    const freshWallet = await tx.wallet.findUnique({
      where:  { id: withdrawal.walletId },
      select: { availableBalance: true, lockedBalance: true, version: true },
    })
    if (!freshWallet) throw new Error('wallet_gone')

    if (action === 'APPROVED') {
      // Débita o lockedBalance (saldo já havia saído do available ao criar o pedido)
      const newLocked = round2(Math.max(0, freshWallet.lockedBalance - withdrawal.amount))

      await tx.wallet.update({
        where: { id: withdrawal.walletId, version: freshWallet.version },
        data: {
          lockedBalance: newLocked,
          version:       { increment: 1 },
        },
      })

      await tx.walletTransaction.create({
        data: {
          walletId:            withdrawal.walletId,
          type:                'DEBIT',
          source:              'WITHDRAWAL_PAID',
          amount:              withdrawal.amount,
          balanceAfter:        freshWallet.availableBalance, // available não muda aqui
          description:         `Saque Pix aprovado e pago — chave: ${withdrawal.pixKey}`,
          withdrawalRequestId: withdrawalId,
          tenantId:            withdrawal.tenantId,
        },
      })
    } else {
      // REJECTED: estornar o valor bloqueado de volta para available
      const newAvailable = round2(freshWallet.availableBalance + withdrawal.amount)
      const newLocked    = round2(Math.max(0, freshWallet.lockedBalance - withdrawal.amount))

      await tx.wallet.update({
        where: { id: withdrawal.walletId, version: freshWallet.version },
        data: {
          availableBalance: newAvailable,
          lockedBalance:    newLocked,
          version:          { increment: 1 },
        },
      })

      await tx.walletTransaction.create({
        data: {
          walletId:            withdrawal.walletId,
          type:                'CREDIT',
          source:              'WITHDRAWAL_REVERSED',
          amount:              withdrawal.amount,
          balanceAfter:        newAvailable,
          description:         `Saque rejeitado — valor estornado${reviewNote ? ': ' + reviewNote : ''}`,
          withdrawalRequestId: withdrawalId,
          tenantId:            withdrawal.tenantId,
        },
      })
    }

    // Atualizar status do pedido
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status:      action,
        reviewNote,
        reviewedById,
        processedAt: new Date(),
      },
    })
  })

  return { withdrawal: { id: withdrawalId, status: action, amount: withdrawal.amount } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

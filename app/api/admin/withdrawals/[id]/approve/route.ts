/**
 * POST /api/admin/withdrawals/[id]/approve
 * ─────────────────────────────────────────────────────────────────────────────
 * Aprova um pedido de saque e executa a transferência PIX real via Asaas.
 *
 * APENAS ADMIN_MASTER pode executar esta ação.
 *
 * ─── FLUXO COMPLETO ──────────────────────────────────────────────────────────
 *
 *  1. Validar sessão (cookie) + role ADMIN_MASTER
 *  2. Buscar WithdrawalRequest pelo :id → verificar status PENDING
 *  3. Buscar Wallet + User (para obter pixKey e pixKeyType)
 *  4. Chamar AsaasService.transferPix(amount, pixKey, description, pixKeyType)
 *     ↓ SUCESSO Asaas:
 *  5a. prisma.$transaction([
 *        WithdrawalRequest.update(APPROVED + processedAt + asaasId)
 *        WalletTransaction.create(DEBIT, WITHDRAWAL_PAID)
 *        Wallet.update(lockedBalance -= amount)
 *     ])
 *  5b. Criar AlertLog para notificar o usuário no app mobile
 *     ↓ FALHA Asaas:
 *  6.  NÃO altera banco de dados
 *      Retorna erro com mensagem do Asaas para o frontend
 *
 * ─── BODY (opcional) ─────────────────────────────────────────────────────────
 *   {
 *     "reviewNote": "Pago em 07/03/2026"    // nota opcional do financeiro
 *   }
 *
 * ─── RETORNO 200 ─────────────────────────────────────────────────────────────
 *   {
 *     success: true,
 *     message: "Transferência PIX enviada com sucesso!",
 *     withdrawal: { id, status: "APPROVED", amount, processedAt },
 *     asaas: {
 *       transferId:          "tr_xxxxx",
 *       status:              "PENDING",    // PENDING = agendado, DONE = pago
 *       endToEndIdentifier:  "E2Exxxxxxx", // ID único Pix
 *       effectiveDate:       "2026-03-07"
 *     }
 *   }
 *
 * ─── ERROS ───────────────────────────────────────────────────────────────────
 *   400  WITHDRAWAL_ALREADY_PROCESSED — saque já aprovado/rejeitado
 *   400  MISSING_PIX_KEY              — usuário sem chave Pix cadastrada
 *   400  ASAAS_NOT_CONFIGURED         — ASAAS_API_KEY ausente no .env
 *   400  Erros da API Asaas (chave inválida, saldo insuficiente, etc.)
 *   403  FORBIDDEN                    — role insuficiente
 *   404  WITHDRAWAL_NOT_FOUND         — saque não encontrado
 *   502  NETWORK_ERROR / Asaas down
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'
import {
  transferPix,
  AsaasServiceError,
} from '@/lib/services/asaas.service'
import { processWithdrawal, WalletServiceError } from '@/lib/services/wallet.service'

export const dynamic = 'force-dynamic'

function err(message: string, status = 400, code = 'VALIDATION_ERROR') {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

async function getSession(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // ── 1. Autenticação ──────────────────────────────────────────────────────
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  // Apenas ADMIN_MASTER pode aprovar e executar o PIX real
  if (session.role !== 'ADMIN_MASTER') {
    return err(
      'Apenas o Administrador Master pode executar pagamentos PIX reais.',
      403, 'FORBIDDEN',
    )
  }

  // ── Body opcional (reviewNote) ───────────────────────────────────────────
  let reviewNote: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    reviewNote = (body?.reviewNote as string | undefined)?.trim() || null
  } catch { /* body vazio é válido */ }

  const { id: withdrawalId } = params

  // ── 2. Buscar WithdrawalRequest com dados do usuário ────────────────────
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:   { id: withdrawalId },
    include: {
      wallet: {
        include: {
          user: {
            select: {
              id:         true,
              nome:       true,
              email:      true,
              role:       true,
              pixKey:     true,
              pixKeyType: true,
              tenantId:   true,
            },
          },
        },
      },
    },
  })

  if (!withdrawal) {
    return err('Pedido de saque não encontrado.', 404, 'WITHDRAWAL_NOT_FOUND')
  }

  // ── 3. Verificar status PENDING ──────────────────────────────────────────
  if (withdrawal.status !== 'PENDING') {
    return err(
      `Este saque já foi processado com status "${withdrawal.status}". ` +
      'Nenhuma ação necessária.',
      400, 'WITHDRAWAL_ALREADY_PROCESSED',
    )
  }

  const user = withdrawal.wallet?.user
  if (!user) {
    return err('Usuário dono do saque não encontrado.', 404, 'USER_NOT_FOUND')
  }

  // ── 4. Resolver chave Pix ────────────────────────────────────────────────
  // Prioridade: chave informada no WithdrawalRequest > chave cadastrada no perfil
  const pixKey     = withdrawal.pixKey     || user.pixKey
  const pixKeyType = withdrawal.pixKeyType || user.pixKeyType

  if (!pixKey || pixKey.trim().length < 3) {
    return err(
      `Usuário "${user.nome}" não possui chave Pix cadastrada. ` +
      'Solicite que o usuário cadastre a chave Pix no perfil antes de aprovar.',
      400, 'MISSING_PIX_KEY',
    )
  }

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const pixDescription =
    `ProspecLead Saque ${fmtBRL(withdrawal.amount)} - ${user.nome}`.slice(0, 50)

  // ── 5. Executar transferência PIX via Asaas ───────────────────────────────
  //    IMPORTANTE: A transferência é executada ANTES de alterar o banco.
  //    Se o Asaas falhar, o banco permanece inalterado.
  //    Se o Asaas OK, atualizamos o banco em transação atômica.
  // ─────────────────────────────────────────────────────────────────────────

  let asaasTransfer: Awaited<ReturnType<typeof transferPix>>

  try {
    asaasTransfer = await transferPix(
      withdrawal.amount,
      pixKey,
      pixDescription,
      pixKeyType ?? undefined,
    )
  } catch (asaasErr) {
    // ── Asaas falhou → NÃO altera banco de dados ──────────────────────────
    if (asaasErr instanceof AsaasServiceError) {
      console.error(
        `[approve] Asaas FALHOU para withdrawal ${withdrawalId}:`,
        asaasErr.code, asaasErr.message,
      )
      return NextResponse.json(
        {
          success: false,
          error: {
            code:        asaasErr.code,
            message:     asaasErr.message,
            asaasErrors: asaasErr.asaasErrors,
          },
        },
        { status: asaasErr.httpStatus },
      )
    }
    console.error('[approve] Erro inesperado no Asaas:', asaasErr)
    return err('Erro inesperado ao processar a transferência PIX.', 500, 'INTERNAL_ERROR')
  }

  // ── 6. Asaas OK → Atualizar banco em $transaction ─────────────────────────
  //    Usamos o processWithdrawal() do WalletService que já tem a lógica
  //    de ajuste de lockedBalance + WalletTransaction
  //    e adicionamos o asaasTransferId ao WithdrawalRequest.
  // ─────────────────────────────────────────────────────────────────────────

  try {
    // Atualizar o WithdrawalRequest com o ID e dados do Asaas
    // (Nota: processWithdrawal já faz $transaction com lockedBalance e WalletTx)
    await prisma.$transaction(async (tx) => {
      // Buscar wallet atual para optimistic lock
      const freshWallet = await tx.wallet.findUnique({
        where:  { id: withdrawal.walletId },
        select: { lockedBalance: true, availableBalance: true, version: true },
      })
      if (!freshWallet) throw new Error('wallet_gone')

      const newLocked = Math.max(0, freshWallet.lockedBalance - withdrawal.amount)
      const roundedAmount = Math.round(withdrawal.amount * 100) / 100

      // Atualizar carteira (reduzir lockedBalance)
      await tx.wallet.update({
        where: { id: withdrawal.walletId, version: freshWallet.version },
        data: {
          lockedBalance: Math.round(newLocked * 100) / 100,
          version:       { increment: 1 },
        },
      })

      // Registrar transação no extrato (DEBIT, WITHDRAWAL_PAID)
      await tx.walletTransaction.create({
        data: {
          walletId:            withdrawal.walletId,
          type:                'DEBIT',
          source:              'WITHDRAWAL_PAID',
          amount:              roundedAmount,
          balanceAfter:        Math.round(freshWallet.availableBalance * 100) / 100,
          description:         `PIX enviado via Asaas — ${pixKey} | ID: ${asaasTransfer.id}`,
          withdrawalRequestId: withdrawalId,
          tenantId:            withdrawal.tenantId,
        },
      })

      // Atualizar o pedido com status APPROVED + dados do Asaas
      await tx.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status:      'APPROVED',
          reviewNote:  reviewNote ?? `PIX enviado. Asaas ID: ${asaasTransfer.id}`,
          reviewedById: session.userId ?? null,
          processedAt: new Date(),
        },
      })
    })

  } catch (dbErr) {
    // Situação crítica: Asaas processou o PIX mas banco falhou
    // Logar para reconciliação manual
    console.error(
      `[approve] CRITICAL: Asaas OK (ID: ${asaasTransfer.id}) mas banco FALHOU ` +
      `para withdrawal ${withdrawalId}. Requer reconciliação manual!`,
      dbErr,
    )
    return err(
      `ATENÇÃO: A transferência PIX foi ENVIADA pelo Asaas (ID: ${asaasTransfer.id}), ` +
      'mas houve erro ao atualizar o banco de dados. Contate o suporte técnico para reconciliação.',
      500, 'DB_UPDATE_FAILED_AFTER_PIX',
    )
  }

  // ── 7. Notificação no app mobile (AlertLog) ──────────────────────────────
  //    Fire-and-forget: não bloqueia o retorno se falhar
  prisma.alertLog.create({
    data: {
      tenantId:      user.tenantId,
      subjectUserId: user.id,
      type:          'WITHDRAWAL_APPROVED',
      title:         'Saque aprovado! 🎉',
      message:
        `Seu saque de ${fmtBRL(withdrawal.amount)} foi processado e o PIX ` +
        `foi enviado para a chave ${pixKey}. ` +
        (asaasTransfer.endToEndIdentifier
          ? `Código de rastreio: ${asaasTransfer.endToEndIdentifier}`
          : 'Em breve o valor estará disponível na sua conta.'),
      severity: 'INFO',
      metadata: JSON.stringify({
        withdrawalId,
        asaasTransferId:     asaasTransfer.id,
        endToEndIdentifier:  asaasTransfer.endToEndIdentifier,
        amount:              withdrawal.amount,
        pixKey,
      }),
    },
  }).catch((e) => console.warn('[approve] Falha ao criar AlertLog:', e))

  // ── 8. Retorno de sucesso ─────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    message: `Transferência PIX de ${fmtBRL(withdrawal.amount)} enviada com sucesso para ${user.nome}!`,
    withdrawal: {
      id:          withdrawalId,
      status:      'APPROVED',
      amount:      withdrawal.amount,
      pixKey,
      processedAt: new Date().toISOString(),
    },
    user: {
      id:    user.id,
      nome:  user.nome,
      email: user.email,
      role:  user.role,
    },
    asaas: {
      transferId:         asaasTransfer.id,
      status:             asaasTransfer.status,
      endToEndIdentifier: asaasTransfer.endToEndIdentifier,
      effectiveDate:      asaasTransfer.effectiveDate,
      netValue:           asaasTransfer.netValue,
    },
  })
}

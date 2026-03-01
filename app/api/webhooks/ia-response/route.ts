/**
 * POST /api/webhooks/ia-response
 * ─────────────────────────────────────────────────────────────────────────────
 * Webhook chamado pela IA (PayMeZap / SDR) quando o cliente responde no WhatsApp.
 *
 * ── Segurança ──────────────────────────────────────────────────────────────
 * A requisição DEVE incluir o header:
 *   X-Webhook-Secret: <valor de WEBHOOK_IA_SECRET no .env>
 *
 * ── Payload aceito (JSON) ──────────────────────────────────────────────────
 * Qualquer um dos formatos abaixo é aceito (adaptável a múltiplas IAs):
 *
 * Formato A (PayMeZap padrão):
 * {
 *   "event":   "message.received",
 *   "phone":   "+5531988001111",
 *   "message": "Sim, tenho interesse",
 *   "timestamp": "2025-02-01T14:30:00Z"
 * }
 *
 * Formato B (genérico SDR):
 * {
 *   "type":    "CUSTOMER_REPLY",
 *   "contact": { "phone": "31988001111" },
 *   "text":    "Oi, quero saber mais"
 * }
 *
 * Formato C (n8n / Make.com bridge):
 * {
 *   "numero":   "5531988001111",
 *   "mensagem": "Quero marcar uma reunião",
 *   "status":   "replied"
 * }
 *
 * ── Lógica executada ───────────────────────────────────────────────────────
 * 1. Valida o secret do webhook.
 * 2. Extrai e normaliza o número de telefone.
 * 3. Busca o lead no banco por múltiplas variações do número.
 * 4. Se encontrado e iaStatus !== 'RESPONDIDO':
 *    a. Atualiza Lead: iaStatus='RESPONDIDO', iaRespondidoEm=now, funnelStage='IA_EM_ATENDIMENTO'
 *    b. Registra crédito no CommissionLedger:
 *       - R$ 2,00 se lead.platePhotoUrl não é null
 *       - R$ 1,00 se lead.platePhotoUrl é null
 * 5. Retorna JSON detalhado para debug/log.
 *
 * ── Idempotência ──────────────────────────────────────────────────────────
 * Se o webhook for reenviado para o mesmo lead, nenhuma duplicação ocorre:
 * - O lead já terá iaStatus='RESPONDIDO' → skip
 * - O CommissionLedger verifica duplicatas por (leadId, eventType)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { normalizePhone, phoneVariants } from '@/lib/phone'
import { creditCommission }          from '@/lib/commission-service'

// ─── Constantes ───────────────────────────────────────────────────────────────
const WEBHOOK_SECRET = process.env.WEBHOOK_IA_SECRET || 'prospeclead-webhook-secret-2024'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}

function fail(msg: string, code: string, status = 400) {
  return NextResponse.json({ success: false, error: { code, message: msg } }, { status })
}

// ─── Extrai número de telefone de qualquer formato de payload ─────────────────
function extractPhone(body: Record<string, unknown>): string | null {
  // Formato A: { phone: "+5531988001111" }
  if (typeof body.phone === 'string' && body.phone) return body.phone

  // Formato B: { contact: { phone: "31988001111" } }
  if (body.contact && typeof body.contact === 'object') {
    const contact = body.contact as Record<string, unknown>
    if (typeof contact.phone === 'string') return contact.phone
    if (typeof contact.whatsapp === 'string') return contact.whatsapp
    if (typeof contact.numero === 'string') return contact.numero
  }

  // Formato C: { numero: "5531988001111" }
  if (typeof body.numero === 'string' && body.numero) return body.numero

  // Formato D: { whatsapp: "31988001111" }
  if (typeof body.whatsapp === 'string' && body.whatsapp) return body.whatsapp

  // Formato E: { from: "5531988001111@s.whatsapp.net" } (WppConnect / Baileys)
  if (typeof body.from === 'string' && body.from) {
    return body.from.split('@')[0]
  }

  // Formato F: { data: { key: { remoteJid: "5531988001111@s.whatsapp.net" } } }
  if (body.data && typeof body.data === 'object') {
    const data = body.data as Record<string, unknown>
    if (data.key && typeof data.key === 'object') {
      const key = data.key as Record<string, unknown>
      if (typeof key.remoteJid === 'string') {
        return key.remoteJid.split('@')[0]
      }
    }
  }

  return null
}

// ─── POST Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const start = Date.now()

  /* ── 1. Validação do secret ──────────────────────────────────────────────── */
  const secret = req.headers.get('x-webhook-secret')
    ?? req.headers.get('X-Webhook-Secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')

  if (secret !== WEBHOOK_SECRET) {
    console.warn('[webhook/ia-response] Secret inválido — IP:', req.headers.get('x-forwarded-for'))
    return fail('Webhook secret inválido ou ausente.', 'UNAUTHORIZED', 401)
  }

  /* ── 2. Parse do body ────────────────────────────────────────────────────── */
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Body inválido. Envie JSON.', 'INVALID_BODY', 400)
  }

  // Log completo do payload recebido (útil para debug)
  console.info('[webhook/ia-response] Payload recebido:', JSON.stringify(body))

  /* ── 3. Extrair e normalizar telefone ────────────────────────────────────── */
  const rawPhone = extractPhone(body)
  if (!rawPhone) {
    return fail(
      'Número de telefone não encontrado no payload. ' +
      'Formatos suportados: { phone }, { contact.phone }, { numero }, { whatsapp }, { from }, { data.key.remoteJid }',
      'PHONE_NOT_FOUND',
      422,
    )
  }

  const phoneNorm = normalizePhone(rawPhone)
  if (!phoneNorm || phoneNorm.length < 8) {
    return fail(`Número de telefone inválido após normalização: "${rawPhone}"`, 'INVALID_PHONE', 422)
  }

  const variants = phoneVariants(rawPhone)
  console.info(`[webhook/ia-response] Buscando lead — raw="${rawPhone}" norm="${phoneNorm}" variants=${variants.length}`)

  /* ── 4. Buscar lead no banco ─────────────────────────────────────────────── */
  // Estratégia em camadas:
  //   4a. Busca exata pelo campo telefoneNorm (campo indexado, mais rápido)
  //   4b. Busca por OR em todas as variações do campo telefone (fallback)
  let lead = await prisma.lead.findFirst({
    where: { telefoneNorm: phoneNorm },
    orderBy: { createdAt: 'desc' },
    select: {
      id:            true,
      nomeCliente:   true,
      telefone:      true,
      telefoneNorm:  true,
      iaStatus:      true,
      platePhotoUrl: true,
      funnelStage:   true,
      promotorId:    true,
      tenantId:      true,
    },
  })

  // Fallback: busca por variações no campo telefone (texto livre)
  if (!lead) {
    lead = await prisma.lead.findFirst({
      where: {
        OR: variants.map(v => ({ telefone: v })),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id:            true,
        nomeCliente:   true,
        telefone:      true,
        telefoneNorm:  true,
        iaStatus:      true,
        platePhotoUrl: true,
        funnelStage:   true,
        promotorId:    true,
        tenantId:      true,
      },
    })
  }

  if (!lead) {
    console.warn(`[webhook/ia-response] Lead não encontrado — phoneNorm="${phoneNorm}"`)
    return ok({
      action:   'NOT_FOUND',
      message:  `Nenhum lead encontrado para o número ${phoneNorm}. Webhook registrado sem ação.`,
      phoneNorm,
    }, 200) // 200 para evitar reenvio automático da IA
  }

  /* ── 5. Idempotência: já está como RESPONDIDO? ───────────────────────────── */
  if (lead.iaStatus === 'RESPONDIDO') {
    console.info(`[webhook/ia-response] Lead já RESPONDIDO — leadId=${lead.id}`)
    return ok({
      action:  'ALREADY_PROCESSED',
      message: 'Lead já estava com status RESPONDIDO. Nenhuma ação tomada.',
      leadId:  lead.id,
    })
  }

  /* ── 6. Atualizar lead: status IA → RESPONDIDO ───────────────────────────── */
  const updatedLead = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      iaStatus:       'RESPONDIDO',
      iaRespondidoEm: new Date(),
      telefoneNorm:   phoneNorm,
      // Avança no funil somente se ainda estiver em LEAD_COLETADO
      ...(lead.funnelStage === 'LEAD_COLETADO' && {
        funnelStage: 'IA_EM_ATENDIMENTO',
      }),
    },
    select: {
      id:            true,
      nomeCliente:   true,
      iaStatus:      true,
      funnelStage:   true,
      platePhotoUrl: true,
      promotorId:    true,
      tenantId:      true,
    },
  })

  /* ── 7. Gatilho financeiro: creditar comissão ────────────────────────────── */
  let commissionResult: {
    ledgerId:    string | null
    eventType:   string
    amount:      number
    description: string
    skipped:     boolean
  } = {
    ledgerId:    null,
    eventType:   'N/A',
    amount:      0,
    description: 'Promotor não associado ao lead.',
    skipped:     true,
  }

  if (updatedLead.promotorId) {
    // Determinar tipo e valor do evento com base na foto
    const hasPhoto  = !!updatedLead.platePhotoUrl
    const eventType = hasPhoto ? 'IA_RESPONSE_WITH_PHOTO' : 'IA_RESPONSE_NO_PHOTO'
    const amount    = hasPhoto ? 2.00 : 1.00

    const ledger = await creditCommission({
      promotorId: updatedLead.promotorId,
      leadId:     updatedLead.id,
      eventType,
      tenantId:   updatedLead.tenantId,
    })

    commissionResult = {
      ledgerId:    ledger?.id ?? null,
      eventType,
      amount,
      description: hasPhoto
        ? 'Lead respondeu à IA com foto de placa cadastrada (R$ 2,00)'
        : 'Lead respondeu à IA sem foto de placa (R$ 1,00)',
      skipped:     ledger === null, // null = já existia (idempotência)
    }
  }

  const elapsed = Date.now() - start
  console.info(
    `[webhook/ia-response] ✓ Processado em ${elapsed}ms — ` +
    `leadId=${updatedLead.id} iaStatus=RESPONDIDO ` +
    `commission=${commissionResult.amount} skipped=${commissionResult.skipped}`,
  )

  /* ── 8. Resposta detalhada ───────────────────────────────────────────────── */
  return ok({
    action:     'LEAD_UPDATED',
    message:    'Lead atualizado para RESPONDIDO com sucesso.',
    elapsed_ms: elapsed,
    lead: {
      id:           updatedLead.id,
      nomeCliente:  updatedLead.nomeCliente,
      iaStatus:     updatedLead.iaStatus,
      funnelStage:  updatedLead.funnelStage,
    },
    commission: commissionResult,
  })
}

/* ── GET: health-check do webhook ────────────────────────────────────────── */
export async function GET() {
  return ok({
    status:    'online',
    endpoint:  'POST /api/webhooks/ia-response',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    docs: {
      secret_header: 'X-Webhook-Secret',
      phone_fields:  ['phone', 'contact.phone', 'numero', 'whatsapp', 'from', 'data.key.remoteJid'],
      example_payload: {
        event:   'message.received',
        phone:   '+5531988001111',
        message: 'Sim, quero saber mais!',
      },
    },
  })
}

/**
 * lib/services/agenda.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AgendaService — Gestão de Visitas a PDV (Agenda do Promotor)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ROTAS SERVIDAS:
 *   POST /api/mobile/agenda               – cria visita agendada (novo)
 *   GET  /api/mobile/agenda               – visitas do dia (SCHEDULED + IN_PROGRESS)
 *   POST /api/mobile/agenda/:id/checkin   – inicia visita → IN_PROGRESS
 *   POST /api/mobile/agenda/:id/checkout  – encerra visita → COMPLETED + checklist TM
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHECKLIST DE TRADE MARKETING (preenchido no check-out)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Evidências fotográficas:
 *    facadePhotoUrl    – URL da foto da fachada (pré-upload obrigatório)
 *    counterPhotoUrl   – URL da foto do balcão/display
 *
 *  Execução de Merchandising:
 *    visualMerchandisingOk    – Boolean: layout/planograma realizado?
 *    pdvExecutionMaterials    – String: materiais aplicados (Stoppers, Wobblers…)
 *
 *  Análise de Performance:
 *    performanceAnalysis – Texto de feedback coletado com gerente/cliente
 *
 *  Notas gerais:
 *    visitNotes – Campo livre para observações adicionais
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÁLCULO DE DURAÇÃO (checkout)
 * ─────────────────────────────────────────────────────────────────────────────
 *   checkOutAt      = new Date()
 *   diffMs          = checkOutAt.getTime() - checkInAt.getTime()
 *   durationMinutes = Math.round(diffMs / 60_000)
 *
 *   Exemplos:
 *     09:00 → 09:47  =  47 min
 *     14:30 → 15:15  =  45 min
 *     10:00 → 10:01  =   1 min
 *     10:00 → 10:00  =   0 min (check-in imediato no mesmo minuto)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VALIDAÇÕES
 * ─────────────────────────────────────────────────────────────────────────────
 *   createVisit → pdvId deve existir para o tenant; promotorId = userId logado
 *   checkin     → status deve ser SCHEDULED; só o promotor dono pode fazer
 *   checkout    → status deve ser IN_PROGRESS; checkInAt obrigatório para diff
 */

import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Status constants
// SQLite não suporta enums — usamos strings literais com validação em runtime
// ─────────────────────────────────────────────────────────────────────────────

const VS = {
  SCHEDULED:   'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED:   'COMPLETED',
  CANCELED:    'CANCELED',
} as const

type VisitStatus = typeof VS[keyof typeof VS]

// ─────────────────────────────────────────────────────────────────────────────
// Payload Types
// ─────────────────────────────────────────────────────────────────────────────

/** Dados necessários para criar uma visita agendada. */
export interface CreateVisitPayload {
  /** ID do PDV (PartnerStore) que será visitado */
  pdvId:            string
  /** Data/hora planejada para a visita (ISO string ou Date) */
  scheduledDate:    string | Date
  /** Nome do gerente / contato que receberá o promotor */
  storeManagerName?: string
  /** Endereço customizado (se diferente do cadastrado no PDV) */
  address?:         string
}

/** Dados do check-in. */
export interface CheckinPayload {
  /** Coordenadas GPS ou endereço textual: "-23.5505,-46.6333" */
  checkInLocation?: string
}

/**
 * Dados do check-out.
 *
 * Inclui o Checklist Completo de Trade Marketing.
 * Todos os campos são opcionais para não bloquear o promotor em campo,
 * mas a ausência de fotos pode ser sinalizada no score de qualidade da visita.
 */
export interface CheckoutPayload {
  // ── Notas gerais ──────────────────────────────────────────────────────────
  /** Observações livres sobre a visita */
  visitNotes?: string

  // ── Evidências fotográficas ───────────────────────────────────────────────
  /**
   * URL da foto da fachada externa do PDV.
   * O app mobile deve fazer upload da imagem antes do checkout
   * via POST /api/upload e enviar apenas a URL resultante.
   */
  facadePhotoUrl?: string

  /**
   * URL da foto do balcão, display ou ilha de produto.
   * Documenta a execução do planograma/merchandising.
   */
  counterPhotoUrl?: string

  // ── Merchandising ─────────────────────────────────────────────────────────
  /**
   * Confirma que o layout/vitrine/planograma foi executado.
   * true  = promotor fez a organização dos produtos na gôndola/display
   * false = não realizado (ausência de material, loja recusou, etc.)
   */
  visualMerchandisingOk?: boolean

  /**
   * Lista de materiais de PDV aplicados na visita.
   * Texto livre; sugestões: "Stoppers A4, Wobbler, Adesivo de Chão, Banner 60x90"
   */
  pdvExecutionMaterials?: string

  // ── Análise de Performance ────────────────────────────────────────────────
  /**
   * Feedback coletado com o gerente/cliente da loja.
   * Pode incluir: percepção de vendas, objeções, concorrência, oportunidades.
   * Ex: "Gerente relatou queda de 20% em Mar/26. Concorrente fez ação."
   */
  performanceAnalysis?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// PDV visit include helper (evita repetição de select)
// ─────────────────────────────────────────────────────────────────────────────

const PDV_SELECT = {
  id:               true,
  name:             true,
  cidade:           true,
  uf:               true,
  address:          true,
  storeType:        true,
  managerPromoter:  { select: { id: true, nome: true } },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// createVisit — POST /api/mobile/agenda
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria uma nova visita agendada.
 *
 * Fluxo:
 *  1. Valida que o PDV existe (e pertence ao tenant, quando aplicável)
 *  2. Cria PdvVisit com status SCHEDULED
 *  3. Retorna a visita criada com dados do PDV
 *
 * @param promotorId  – userId do promotor logado (dono da visita)
 * @param tenantId    – tenant do promotor (null = ADMIN_MASTER)
 * @param payload     – dados do agendamento
 */
export async function createVisit(
  promotorId: string,
  tenantId:   string | null,
  payload:    CreateVisitPayload,
) {
  // Valida PDV
  const pdvFilter = tenantId
    ? { id: payload.pdvId, tenantId }
    : { id: payload.pdvId }

  const pdv = await prisma.partnerStore.findFirst({
    where: pdvFilter,
    select: { id: true, name: true, address: true, cidade: true, uf: true },
  })

  if (!pdv) {
    throw new Error(`PDV não encontrado: ${payload.pdvId}`)
  }

  const scheduledDate =
    payload.scheduledDate instanceof Date
      ? payload.scheduledDate
      : new Date(payload.scheduledDate)

  if (isNaN(scheduledDate.getTime())) {
    throw new Error('Data de agendamento inválida')
  }

  return prisma.pdvVisit.create({
    data: {
      promotorId,
      pdvId:           payload.pdvId,
      scheduledDate,
      storeManagerName: payload.storeManagerName ?? null,
      // Endereço: usa o fornecido no payload OU herda do cadastro do PDV
      address:          payload.address ?? pdv.address ?? null,
      status:           VS.SCHEDULED,
      tenantId:         tenantId ?? null,
    },
    include: {
      pdv: { select: PDV_SELECT },
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// getTodayVisits — GET /api/mobile/agenda
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna as visitas SCHEDULED ou IN_PROGRESS de hoje para o promotor.
 *
 * "Hoje" = 00:00:00.000 UTC → 23:59:59.999 UTC do dia atual.
 */
export async function getTodayVisits(promotorId: string) {
  const now   = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))

  return prisma.pdvVisit.findMany({
    where: {
      promotorId,
      scheduledDate: { gte: start, lte: end },
      status: { in: [VS.SCHEDULED, VS.IN_PROGRESS] },
    },
    include: {
      pdv: { select: PDV_SELECT },
    },
    orderBy: { scheduledDate: 'asc' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// doCheckin — POST /api/mobile/agenda/:id/checkin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicia uma visita agendada.
 *
 * Validações:
 *  • Visita deve existir e pertencer ao promotor
 *  • Status deve ser SCHEDULED
 *
 * Atualizações:
 *  • status         → IN_PROGRESS
 *  • checkInAt      → now()
 *  • checkInLocation → payload.checkInLocation (GPS ou texto)
 */
export async function doCheckin(
  visitId:    string,
  promotorId: string,
  payload:    CheckinPayload,
) {
  const visit = await prisma.pdvVisit.findFirst({
    where: { id: visitId, promotorId },
  })

  if (!visit) {
    throw new Error('Visita não encontrada ou sem permissão')
  }

  if (visit.status !== VS.SCHEDULED) {
    throw new Error(`Check-in não permitido: visita está com status "${visit.status}"`)
  }

  return prisma.pdvVisit.update({
    where: { id: visitId },
    data: {
      status:          VS.IN_PROGRESS,
      checkInAt:       new Date(),
      checkInLocation: payload.checkInLocation ?? null,
    },
    include: {
      pdv: { select: PDV_SELECT },
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// doCheckout — POST /api/mobile/agenda/:id/checkout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encerra uma visita em andamento e registra o Checklist de Trade Marketing.
 *
 * ── Validações ────────────────────────────────────────────────────────────────
 *  • Visita deve existir e pertencer ao promotor
 *  • Status deve ser IN_PROGRESS
 *  • checkInAt obrigatório para cálculo de duração
 *
 * ── Cálculo de duração ────────────────────────────────────────────────────────
 *  checkOutAt      = new Date()                    ← capturado aqui no servidor
 *  diffMs          = checkOutAt - checkInAt         ← diferença em milissegundos
 *  durationMinutes = Math.round(diffMs / 60_000)   ← arredonda para inteiro
 *
 * ── Checklist de Trade Marketing salvo ───────────────────────────────────────
 *  Evidências fotográficas:
 *    facadePhotoUrl        – foto da fachada
 *    counterPhotoUrl       – foto do balcão/display
 *
 *  Execução de Merchandising:
 *    visualMerchandisingOk – layout/planograma executado? (Boolean)
 *    pdvExecutionMaterials – materiais aplicados (texto livre)
 *
 *  Análise de Performance:
 *    performanceAnalysis   – feedback do gerente/cliente (texto livre)
 *
 *  Notas gerais:
 *    visitNotes            – observações adicionais
 *
 * @param visitId    – ID da PdvVisit
 * @param promotorId – userId do promotor logado
 * @param payload    – CheckoutPayload com todos os campos do checklist TM
 */
export async function doCheckout(
  visitId:    string,
  promotorId: string,
  payload:    CheckoutPayload,
) {
  // ── 1. Busca e valida a visita ────────────────────────────────────────────
  const visit = await prisma.pdvVisit.findFirst({
    where: { id: visitId, promotorId },
  })

  if (!visit) {
    throw new Error('Visita não encontrada ou sem permissão')
  }

  if (visit.status !== VS.IN_PROGRESS) {
    throw new Error(`Check-out não permitido: visita está com status "${visit.status}"`)
  }

  if (!visit.checkInAt) {
    throw new Error('Check-in não registrado — não é possível calcular a duração da visita')
  }

  // ── 2. Cálculo de duração ─────────────────────────────────────────────────
  const checkOutAt      = new Date()
  const diffMs          = checkOutAt.getTime() - visit.checkInAt.getTime()
  const durationMinutes = Math.round(diffMs / 60_000)

  // ── 3. Monta os dados do checklist de Trade Marketing ─────────────────────
  //
  //  Campos undefined (não enviados) → null no banco (sem sobrescrever dados anteriores)
  //  Campos explicitamente enviados  → salvos com o valor informado pelo promotor
  //
  const tradeMarketingData = {
    // Notas gerais
    visitNotes: payload.visitNotes ?? null,

    // Evidências fotográficas
    // Nota: o app mobile deve fazer upload primeiro via /api/upload
    //       e enviar apenas a URL resultante neste payload
    facadePhotoUrl:  payload.facadePhotoUrl  ?? null,
    counterPhotoUrl: payload.counterPhotoUrl ?? null,

    // Merchandising in-store
    // Boolean com default false: se não enviado, mantém false (não executado)
    visualMerchandisingOk: payload.visualMerchandisingOk ?? false,

    // Materiais de PDV aplicados
    pdvExecutionMaterials: payload.pdvExecutionMaterials ?? null,

    // Análise de performance coletada com o gerente/cliente
    performanceAnalysis: payload.performanceAnalysis ?? null,
  }

  // ── 4. Persiste o check-out + checklist TM em uma única operação ──────────
  return prisma.pdvVisit.update({
    where: { id: visitId },
    data: {
      // Status e timing
      status:          VS.COMPLETED,
      checkOutAt,
      durationMinutes,

      // Checklist de Trade Marketing
      ...tradeMarketingData,
    },
    // Retorna com dados do PDV para resposta imediata ao app
    include: {
      pdv: { select: PDV_SELECT },
    },
  })
}

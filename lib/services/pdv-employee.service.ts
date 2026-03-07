/**
 * PdvEmployeeService — Cadastro e Gestão de Funcionários de PDV
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * RESPONSABILIDADES:
 *   1. Criar conta de usuário (PARTNER_EMPLOYEE) + vínculo PdvEmployee em
 *      uma transação atômica única
 *   2. Validar a integridade dos dados (PDV ativo, modelo de comissão válido,
 *      e-mail único, etc.) antes de qualquer escrita
 *   3. Expor o commissionModelId vinculado de forma explícita no retorno
 *
 * TRANSAÇÃO ATÔMICA:
 *   prisma.$transaction(callback) garante que ou TUDO é criado ou NADA:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  CADASTRO DE FUNCIONÁRIO PDV                                         │
 *   │                                                                      │
 *   │  Input: { name, phone, email, password, role, pdvId,                │
 *   │           commissionModelId, tenantId }                              │
 *   │                                                                      │
 *   │  [tx 1] User.create          → role=PARTNER_EMPLOYEE                │
 *   │                                  approvalStatus=PENDING             │
 *   │                                  commissionModelId (FK direto)      │
 *   │                                                                      │
 *   │  [tx 2] PdvEmployee.create   → userId + pdvId + commissionModelId  │
 *   │                                  (pivot com metadados do vínculo)   │
 *   │                                                                      │
 *   │  [tx 3] PartnerStore.update  → totalLeads++ (contador de equipe)    │
 *   │                                                                      │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * EXPORTED:
 *   createPdvEmployee(input)   → PdvEmployeeCreateResult
 *   listPdvEmployees(filters)  → PdvEmployeeListResult
 *   getPdvEmployee(id)         → PdvEmployeeDetail | null
 *   updatePdvEmployee(id, data)→ PdvEmployeeDetail
 *   deactivatePdvEmployee(id)  → void
 * ─────────────────────────────────────────────────────────────────────────────
 */

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

export const PDV_EMPLOYEE_ROLES = [
  'FRENTISTA',
  'CAIXA',
  'GERENTE_LOCAL',
  'PROMOTOR_EXTERNO',
  'SUPERVISOR',
] as const

export type PdvEmployeeRole = typeof PDV_EMPLOYEE_ROLES[number]

// Salt rounds para bcrypt (10 = ~100ms/hash — bom equilíbrio segurança/performance)
const BCRYPT_ROUNDS = 10

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePdvEmployeeInput {
  /** Nome completo do funcionário */
  name:              string
  /** Telefone celular (usado como login alternativo no app) */
  phone:             string
  /** E-mail — usado como login principal */
  email:             string
  /** Senha inicial (será hasheada antes de salvar) */
  password:          string
  /** CPF do funcionário (opcional, único no sistema) */
  cpf?:              string
  /** Função no PDV: FRENTISTA | CAIXA | GERENTE_LOCAL | PROMOTOR_EXTERNO | SUPERVISOR */
  role:              PdvEmployeeRole
  /** ID do PDV onde este funcionário irá atuar */
  pdvId:             string
  /**
   * ID do CommissionModel que define o remuneração deste funcionário.
   * Obrigatório — pré-definido no momento do cadastro pelo gestor.
   * Exemplo: "cmm84m2bu000236od..." (Padrão Frentista = R$50 fixo)
   */
  commissionModelId: string
  /** ID do tenant (franquia) — herdado do gestor logado */
  tenantId:          string | null
  /** Observações do gestor */
  notes?:            string
}

export interface PdvEmployeeCreateResult {
  /** ID do vínculo PdvEmployee criado */
  employeeId:       string
  /** ID do usuário do sistema criado */
  userId:           string
  /** Nome do funcionário */
  name:             string
  /** E-mail de acesso */
  email:            string
  /** Telefone */
  phone:            string
  /** Função no PDV */
  role:             string
  /** ID do PDV de atuação */
  pdvId:            string
  /** Nome do PDV */
  pdvName:          string
  /**
   * Modelo de comissão vinculado (obrigatório).
   * Contém todos os detalhes de como o funcionário será remunerado.
   */
  commissionModel: {
    id:              string
    name:            string
    fixedValue:      number
    percentageValue: number | null
    description:     string | null
  }
  /** Status de aprovação: sempre PENDING no cadastro */
  approvalStatus:   string
  /** Quando o vínculo foi criado */
  createdAt:        Date
}

export interface ListPdvEmployeesFilters {
  pdvId?:     string
  tenantId?:  string | null
  status?:    string
  search?:    string
  page?:      number
  limit?:     number
}

// ─────────────────────────────────────────────────────────────────────────────
// Erro tipado
// ─────────────────────────────────────────────────────────────────────────────

export class PdvEmployeeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'PDV_NOT_FOUND'
      | 'PDV_INACTIVE'
      | 'COMMISSION_MODEL_NOT_FOUND'
      | 'COMMISSION_MODEL_INACTIVE'
      | 'EMAIL_ALREADY_EXISTS'
      | 'CPF_ALREADY_EXISTS'
      | 'ALREADY_LINKED'
      | 'EMPLOYEE_NOT_FOUND'
      | 'INVALID_ROLE'
      | 'TENANT_MISMATCH',
  ) {
    super(message)
    this.name = 'PdvEmployeeError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createPdvEmployee — Service principal
// ─────────────────────────────────────────────────────────────────────────────

export async function createPdvEmployee(
  input: CreatePdvEmployeeInput,
): Promise<PdvEmployeeCreateResult> {
  const {
    name,
    phone,
    email,
    password,
    cpf,
    role,
    pdvId,
    commissionModelId,
    tenantId,
    notes,
  } = input

  // ── Validação 1: Role válida ───────────────────────────────────────────────
  if (!(PDV_EMPLOYEE_ROLES as readonly string[]).includes(role)) {
    throw new PdvEmployeeError(
      `Função inválida. Use: ${PDV_EMPLOYEE_ROLES.join(' | ')}`,
      'INVALID_ROLE',
    )
  }

  // ── Validação 2: PDV existe e está ativo ──────────────────────────────────
  const pdv = await prisma.partnerStore.findUnique({
    where: { id: pdvId },
    select: {
      id:       true,
      name:     true,
      status:   true,
      tenantId: true,
    },
  })

  if (!pdv) {
    throw new PdvEmployeeError(
      `PDV não encontrado (id: ${pdvId}).`,
      'PDV_NOT_FOUND',
    )
  }

  if (pdv.status !== 'ACTIVE') {
    throw new PdvEmployeeError(
      `O PDV "${pdv.name}" está ${pdv.status.toLowerCase()} e não aceita novos funcionários.`,
      'PDV_INACTIVE',
    )
  }

  // Guard de tenant: funcionário só pode ser adicionado a PDV do mesmo tenant
  if (tenantId && pdv.tenantId && pdv.tenantId !== tenantId) {
    throw new PdvEmployeeError(
      'O PDV não pertence ao seu tenant.',
      'TENANT_MISMATCH',
    )
  }

  // ── Validação 3: CommissionModel existe, está ativo e pertence ao tenant ──
  const commissionModel = await prisma.commissionModel.findUnique({
    where: { id: commissionModelId },
    select: {
      id:             true,
      name:           true,
      fixedValue:     true,
      percentageValue:true,
      description:    true,
      status:         true,
      tenantId:       true,
    },
  })

  if (!commissionModel) {
    throw new PdvEmployeeError(
      `Modelo de comissão não encontrado (id: ${commissionModelId}).`,
      'COMMISSION_MODEL_NOT_FOUND',
    )
  }

  if (commissionModel.status !== 'ACTIVE') {
    throw new PdvEmployeeError(
      `O modelo de comissão "${commissionModel.name}" está inativo.`,
      'COMMISSION_MODEL_INACTIVE',
    )
  }

  // Guard tenant do CommissionModel
  if (tenantId && commissionModel.tenantId && commissionModel.tenantId !== tenantId) {
    throw new PdvEmployeeError(
      'O modelo de comissão não pertence ao seu tenant.',
      'TENANT_MISMATCH',
    )
  }

  // ── Validação 4: E-mail único ──────────────────────────────────────────────
  const emailExists = await prisma.user.findUnique({
    where:  { email: email.toLowerCase().trim() },
    select: { id: true },
  })

  if (emailExists) {
    throw new PdvEmployeeError(
      `Já existe uma conta com o e-mail "${email}".`,
      'EMAIL_ALREADY_EXISTS',
    )
  }

  // ── Validação 5: CPF único (se fornecido) ─────────────────────────────────
  if (cpf) {
    const cpfExists = await prisma.user.findUnique({
      where:  { cpf: cpf.replace(/\D/g, '') },
      select: { id: true },
    })
    if (cpfExists) {
      throw new PdvEmployeeError(
        'Já existe uma conta cadastrada com este CPF.',
        'CPF_ALREADY_EXISTS',
      )
    }
  }

  // ── Validação 6: Funcionário ainda não vinculado a este PDV ───────────────
  // (verificação por e-mail → userId se o user existisse)
  // Como garantimos e-mail único acima, não há risco de duplicidade aqui.
  // Mas mantemos o check @@unique([userId, pdvId]) no schema como guardrail.

  // ── Hash da senha ──────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

  // ── TRANSAÇÃO ATÔMICA ─────────────────────────────────────────────────────
  //
  //   [tx 1] User.create          → cria a conta do funcionário
  //   [tx 2] PdvEmployee.create   → cria o vínculo com o PDV + CommissionModel
  //
  //   Nota: PartnerStore.totalLeads NÃO é incrementado aqui pois representa
  //   leads de clientes, não headcount. O counter de headcount pode ser
  //   derivado via _count.employees na query.
  //
  const effectiveTenantId = tenantId ?? pdv.tenantId ?? null

  let createdEmployeeId: string
  let createdUserId:     string
  let createdAt:         Date

  await prisma.$transaction(async (tx) => {

    // ── [tx 1] Criar o usuário do sistema ─────────────────────────────────────
    const newUser = await tx.user.create({
      data: {
        nome:              name.trim(),
        email:             email.toLowerCase().trim(),
        password:          hashedPassword,
        telefone:          phone.trim(),
        cpf:               cpf ? cpf.replace(/\D/g, '') : null,
        role:              'PARTNER_EMPLOYEE',
        ativo:             true,
        // Cadastro começa PENDING — gestor do PDV precisa aprovar no painel
        approvalStatus:    'PENDING',
        kycStatus:         'PENDING_REVIEW',
        tenantId:          effectiveTenantId,
        // Vínculo direto ao CommissionModel (atalho para queries rápidas)
        commissionModelId,
      },
      select: {
        id:        true,
        createdAt: true,
      },
    })

    createdUserId = newUser.id
    createdAt     = newUser.createdAt

    // ── [tx 2] Criar o vínculo PdvEmployee ────────────────────────────────────
    //   Este é o pivot da relação User ↔ PartnerStore com todos os metadados
    //   do contrato de trabalho: função, modelo de comissão e datas.
    const newEmployee = await tx.pdvEmployee.create({
      data: {
        userId:            newUser.id,
        pdvId,
        // commissionModelId vinculado aqui — a fonte de verdade do contrato
        commissionModelId,
        role,
        status:            'ACTIVE',
        startedAt:         new Date(),
        notes:             notes?.trim() ?? null,
        tenantId:          effectiveTenantId,
      },
      select: { id: true },
    })

    createdEmployeeId = newEmployee.id
  })

  // ── Log de auditoria ───────────────────────────────────────────────────────
  console.log(
    `[PdvEmployeeService] Funcionário criado: userId=${createdUserId!} ` +
    `| pdvId=${pdvId} | role=${role} ` +
    `| commissionModel="${commissionModel.name}" (${commissionModelId}) ` +
    `| approvalStatus=PENDING`,
  )

  // ── Retorno estruturado ────────────────────────────────────────────────────
  return {
    employeeId:      createdEmployeeId!,
    userId:          createdUserId!,
    name:            name.trim(),
    email:           email.toLowerCase().trim(),
    phone:           phone.trim(),
    role,
    pdvId,
    pdvName:         pdv.name,
    commissionModel: {
      id:              commissionModel.id,
      name:            commissionModel.name,
      fixedValue:      commissionModel.fixedValue,
      percentageValue: commissionModel.percentageValue,
      description:     commissionModel.description,
    },
    approvalStatus:  'PENDING',
    createdAt:       createdAt!,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// listPdvEmployees — Listagem com filtros e paginação
// ─────────────────────────────────────────────────────────────────────────────

export async function listPdvEmployees(filters: ListPdvEmployeesFilters) {
  const {
    pdvId,
    tenantId,
    status,
    search,
    page  = 1,
    limit = 20,
  } = filters

  const skip = (Math.max(1, page) - 1) * Math.min(100, limit)
  const take = Math.min(100, limit)

  const where = {
    ...(pdvId    ? { pdvId }         : {}),
    ...(tenantId ? { tenantId }      : {}),
    ...(status   ? { status }        : {}),
    ...(search   ? {
      user: {
        OR: [
          { nome:     { contains: search } },
          { email:    { contains: search } },
          { telefone: { contains: search } },
        ],
      },
    } : {}),
  }

  const [employees, total] = await Promise.all([
    prisma.pdvEmployee.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id:        true,
        role:      true,
        status:    true,
        startedAt: true,
        createdAt: true,
        user: {
          select: {
            id:            true,
            nome:          true,
            email:         true,
            telefone:      true,
            approvalStatus:true,
            ativo:         true,
            avatarUrl:     true,
          },
        },
        pdv: {
          select: {
            id:   true,
            name: true,
            uf:   true,
          },
        },
        commissionModel: {
          select: {
            id:              true,
            name:            true,
            fixedValue:      true,
            percentageValue: true,
          },
        },
      },
    }),
    prisma.pdvEmployee.count({ where }),
  ])

  return {
    data: employees,
    meta: {
      total,
      page:  Math.max(1, page),
      limit: take,
      pages: Math.ceil(total / take),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getPdvEmployee — Detalhes completos por employeeId (PdvEmployee.id)
// ─────────────────────────────────────────────────────────────────────────────

export async function getPdvEmployee(employeeId: string) {
  const employee = await prisma.pdvEmployee.findUnique({
    where: { id: employeeId },
    include: {
      user: {
        select: {
          id:            true,
          nome:          true,
          email:         true,
          telefone:      true,
          cpf:           true,
          approvalStatus:true,
          ativo:         true,
          avatarUrl:     true,
          kycStatus:     true,
          pixKeyType:    true,
          pixKey:        true,
          createdAt:     true,
        },
      },
      pdv: {
        select: {
          id:        true,
          name:      true,
          cidade:    true,
          uf:        true,
          storeType: true,
          status:    true,
        },
      },
      commissionModel: true,
    },
  })

  return employee ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// updatePdvEmployee — Atualiza vínculo (role, status, commissionModel, notes)
// ─────────────────────────────────────────────────────────────────────────────

export async function updatePdvEmployee(
  employeeId: string,
  data: {
    role?:              PdvEmployeeRole
    status?:            'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
    commissionModelId?: string
    notes?:             string
    endedAt?:           Date | null
  },
) {
  const existing = await prisma.pdvEmployee.findUnique({
    where:  { id: employeeId },
    select: { id: true, userId: true, commissionModelId: true },
  })

  if (!existing) {
    throw new PdvEmployeeError('Vínculo de funcionário não encontrado.', 'EMPLOYEE_NOT_FOUND')
  }

  // Validar novo CommissionModel se informado
  if (data.commissionModelId && data.commissionModelId !== existing.commissionModelId) {
    const model = await prisma.commissionModel.findUnique({
      where:  { id: data.commissionModelId },
      select: { id: true, status: true, name: true },
    })
    if (!model)               throw new PdvEmployeeError('Modelo de comissão não encontrado.', 'COMMISSION_MODEL_NOT_FOUND')
    if (model.status !== 'ACTIVE') throw new PdvEmployeeError(`Modelo "${model.name}" está inativo.`, 'COMMISSION_MODEL_INACTIVE')
  }

  // Atualiza PdvEmployee + User.commissionModelId em transação
  const updated = await prisma.$transaction(async (tx) => {
    const updatedEmployee = await tx.pdvEmployee.update({
      where: { id: employeeId },
      data: {
        ...(data.role              ? { role: data.role }                           : {}),
        ...(data.status            ? { status: data.status }                       : {}),
        ...(data.commissionModelId ? { commissionModelId: data.commissionModelId } : {}),
        ...(data.notes !== undefined ? { notes: data.notes }                       : {}),
        ...(data.endedAt !== undefined ? { endedAt: data.endedAt }                 : {}),
      },
      include: {
        user:            { select: { id: true, nome: true, email: true } },
        pdv:             { select: { id: true, name: true } },
        commissionModel: true,
      },
    })

    // Sincroniza User.commissionModelId se o modelo foi trocado
    if (data.commissionModelId) {
      await tx.user.update({
        where: { id: existing.userId },
        data:  { commissionModelId: data.commissionModelId },
      })
    }

    return updatedEmployee
  })

  return updated
}

// ─────────────────────────────────────────────────────────────────────────────
// deactivatePdvEmployee — Soft deactivation
// ─────────────────────────────────────────────────────────────────────────────

export async function deactivatePdvEmployee(employeeId: string): Promise<void> {
  const existing = await prisma.pdvEmployee.findUnique({
    where:  { id: employeeId },
    select: { id: true, userId: true },
  })

  if (!existing) {
    throw new PdvEmployeeError('Vínculo de funcionário não encontrado.', 'EMPLOYEE_NOT_FOUND')
  }

  await prisma.$transaction(async (tx) => {
    await tx.pdvEmployee.update({
      where: { id: employeeId },
      data:  { status: 'INACTIVE', endedAt: new Date() },
    })
    // Desativa a conta no sistema também
    await tx.user.update({
      where: { id: existing.userId },
      data:  { ativo: false },
    })
  })
}

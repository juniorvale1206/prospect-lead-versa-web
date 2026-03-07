/**
 * POST /api/mobile/pdv/employee
 * GET  /api/mobile/pdv/employee
 * ─────────────────────────────────────────────────────────────────────────────
 * Controller — Cadastro e Listagem de Funcionários de PDV
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  POST — Cadastrar novo funcionário em um PDV                            │
 * │                                                                          │
 * │  Headers:                                                                │
 * │    Authorization: Bearer <token_mobile_do_gestor>                       │
 * │                                                                          │
 * │  Body (JSON):                                                            │
 * │    {                                                                     │
 * │      "name":              "João da Silva",          // obrigatório       │
 * │      "phone":             "11999990001",            // obrigatório       │
 * │      "email":             "joao@posto.com",         // obrigatório       │
 * │      "password":          "senha@123",              // obrigatório       │
 * │      "cpf":               "123.456.789-09",         // opcional          │
 * │      "role":              "FRENTISTA",              // obrigatório       │
 * │      "pdvId":             "cmm84m...",              // obrigatório       │
 * │      "commissionModelId": "cmm91x...",              // obrigatório       │
 * │      "notes":             "Contratado em 03/2026"   // opcional          │
 * │    }                                                                     │
 * │                                                                          │
 * │  Retorno 201:                                                            │
 * │    {                                                                     │
 * │      "success": true,                                                    │
 * │      "message": "Funcionário cadastrado com sucesso...",                 │
 * │      "employee": {                                                       │
 * │        "employeeId": "...",                                              │
 * │        "userId":     "...",                                              │
 * │        "name":       "João da Silva",                                   │
 * │        "email":      "joao@posto.com",                                  │
 * │        "phone":      "11999990001",                                      │
 * │        "role":       "FRENTISTA",                                        │
 * │        "pdvId":      "cmm84m...",                                        │
 * │        "pdvName":    "Posto Ipiranga Centro",                            │
 * │        "commissionModel": {                                              │
 * │          "id":              "cmm91x...",                                 │
 * │          "name":            "Padrão Frentista",                          │
 * │          "fixedValue":      50.00,                                       │
 * │          "percentageValue": null,                                        │
 * │          "description":     "R$ 50 fixo por venda convertida"            │
 * │        },                                                                │
 * │        "approvalStatus": "PENDING",                                      │
 * │        "createdAt": "2026-03-07T..."                                     │
 * │      }                                                                   │
 * │    }                                                                     │
 * │                                                                          │
 * │  Erros:                                                                  │
 * │    400  VALIDATION_ERROR       — campo obrigatório ausente/inválido     │
 * │    401  UNAUTHORIZED           — token inválido ou expirado             │
 * │    403  FORBIDDEN              — role não tem permissão                 │
 * │    404  PDV_NOT_FOUND          — PDV não existe                         │
 * │    404  COMMISSION_MODEL_NOT_FOUND — modelo não existe                  │
 * │    409  EMAIL_ALREADY_EXISTS   — e-mail já cadastrado                   │
 * │    409  CPF_ALREADY_EXISTS     — CPF já cadastrado                      │
 * │    409  ALREADY_LINKED         — funcionário já vinculado ao PDV        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  GET — Listar funcionários de um PDV                                    │
 * │                                                                          │
 * │  Query params:                                                           │
 * │    ?pdvId=xxx           → filtrar por PDV (obrigatório para MANAGER)   │
 * │    ?status=ACTIVE        → filtrar por status                           │
 * │    ?search=nome          → busca por nome/email/telefone               │
 * │    ?page=1&limit=20      → paginação                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * AUTORIZAÇÃO:
 *   POST → MANAGER, ADMIN_MASTER (gestores cadastram funcionários)
 *   GET  → MANAGER, ADMIN_MASTER, PARTNER_EMPLOYEE (ver colegas do PDV)
 */

import { NextRequest }          from 'next/server'
import { verifyMobileToken, mobileError, mobileOk } from '@/lib/mobile-auth'
import {
  createPdvEmployee,
  listPdvEmployees,
  PDV_EMPLOYEE_ROLES,
  PdvEmployeeError,
  type PdvEmployeeRole,
} from '@/lib/services/pdv-employee.service'

// ─────────────────────────────────────────────────────────────────────────────
// Roles com permissão para CRIAR funcionários
// ─────────────────────────────────────────────────────────────────────────────
const CREATE_ROLES = ['MANAGER', 'ADMIN_MASTER'] as const

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/mobile/pdv/employee
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {

  /* ── 1. Autenticação ─────────────────────────────────────────────────────── */
  const payload = await verifyMobileToken(req)
  if (!payload) {
    return mobileError('Token inválido ou expirado.', 'UNAUTHORIZED', 401)
  }

  if (!(CREATE_ROLES as readonly string[]).includes(payload.role)) {
    return mobileError(
      `Sua conta (${payload.role}) não tem permissão para cadastrar funcionários de PDV.`,
      'FORBIDDEN',
      403,
    )
  }

  /* ── 2. Parse e validação do body ────────────────────────────────────────── */
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return mobileError('Body inválido. Envie JSON.', 'INVALID_BODY', 400)
  }

  const {
    name,
    phone,
    email,
    password,
    cpf,
    role,
    pdvId,
    commissionModelId,
    notes,
  } = body

  // ── Campos obrigatórios ────────────────────────────────────────────────────

  const validationErrors: Record<string, string> = {}

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    validationErrors.name = 'Nome completo é obrigatório (mínimo 2 caracteres).'
  }

  if (!phone || typeof phone !== 'string' || phone.trim().length < 8) {
    validationErrors.phone = 'Telefone é obrigatório (mínimo 8 dígitos).'
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    validationErrors.email = 'E-mail válido é obrigatório.'
  }

  if (!password || typeof password !== 'string' || (password as string).length < 6) {
    validationErrors.password = 'Senha é obrigatória (mínimo 6 caracteres).'
  }

  if (!role || typeof role !== 'string') {
    validationErrors.role = `Função é obrigatória. Use: ${PDV_EMPLOYEE_ROLES.join(' | ')}`
  } else if (!(PDV_EMPLOYEE_ROLES as readonly string[]).includes(role)) {
    validationErrors.role = `Função inválida. Use: ${PDV_EMPLOYEE_ROLES.join(' | ')}`
  }

  if (!pdvId || typeof pdvId !== 'string') {
    validationErrors.pdvId = 'O campo pdvId é obrigatório.'
  }

  if (!commissionModelId || typeof commissionModelId !== 'string') {
    validationErrors.commissionModelId =
      'O campo commissionModelId é obrigatório. ' +
      'Selecione o modelo de comissão antes de cadastrar o funcionário.'
  }

  if (Object.keys(validationErrors).length > 0) {
    return mobileError(
      'Dados inválidos. Verifique os campos e tente novamente.',
      'VALIDATION_ERROR',
      400,
      validationErrors,
    )
  }

  /* ── 3. Chamar o Service ─────────────────────────────────────────────────── */
  try {
    const result = await createPdvEmployee({
      name:              (name as string).trim(),
      phone:             (phone as string).trim(),
      email:             (email as string).trim(),
      password:          password as string,
      cpf:               typeof cpf === 'string' ? cpf.trim() : undefined,
      role:              role as PdvEmployeeRole,
      pdvId:             pdvId as string,
      commissionModelId: commissionModelId as string,
      tenantId:          payload.tenantId ?? null,
      notes:             typeof notes === 'string' ? notes.trim() : undefined,
    })

    /* ── 4. Resposta 201 ─────────────────────────────────────────────────────── */
    return mobileOk(
      {
        message:
          `Funcionário "${result.name}" cadastrado com sucesso no PDV "${result.pdvName}". ` +
          `Aguardando aprovação do gestor.`,
        employee: result,
      },
      201,
    )

  } catch (error) {
    // ── Erros tipados do service ───────────────────────────────────────────────
    if (error instanceof PdvEmployeeError) {
      const statusMap: Record<PdvEmployeeError['code'], number> = {
        PDV_NOT_FOUND:               404,
        PDV_INACTIVE:                400,
        COMMISSION_MODEL_NOT_FOUND:  404,
        COMMISSION_MODEL_INACTIVE:   400,
        EMAIL_ALREADY_EXISTS:        409,
        CPF_ALREADY_EXISTS:          409,
        ALREADY_LINKED:              409,
        EMPLOYEE_NOT_FOUND:          404,
        INVALID_ROLE:                400,
        TENANT_MISMATCH:             403,
      }
      return mobileError(
        error.message,
        error.code,
        statusMap[error.code] ?? 400,
      )
    }

    // ── Erro genérico ──────────────────────────────────────────────────────────
    console.error('[POST /api/mobile/pdv/employee]', error)
    return mobileError(
      'Erro interno ao cadastrar funcionário. Tente novamente.',
      'INTERNAL_ERROR',
      500,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mobile/pdv/employee
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {

  /* ── 1. Autenticação ─────────────────────────────────────────────────────── */
  const payload = await verifyMobileToken(req)
  if (!payload) {
    return mobileError('Token inválido ou expirado.', 'UNAUTHORIZED', 401)
  }

  const GET_ROLES = ['MANAGER', 'ADMIN_MASTER', 'PARTNER_EMPLOYEE']
  if (!GET_ROLES.includes(payload.role)) {
    return mobileError('Sem permissão para listar funcionários.', 'FORBIDDEN', 403)
  }

  /* ── 2. Query params ─────────────────────────────────────────────────────── */
  const sp     = req.nextUrl.searchParams
  const pdvId  = sp.get('pdvId')  ?? undefined
  const status = sp.get('status') ?? undefined
  const search = sp.get('search') ?? undefined
  const page   = parseInt(sp.get('page')  ?? '1')
  const limit  = parseInt(sp.get('limit') ?? '20')

  // PARTNER_EMPLOYEE só pode ver funcionários do seu próprio PDV
  // (para isso, o pdvId deve ser informado no token ou no query)
  const effectiveTenantId =
    payload.role === 'ADMIN_MASTER' ? undefined : (payload.tenantId ?? undefined)

  /* ── 3. Chamar o Service ─────────────────────────────────────────────────── */
  try {
    const result = await listPdvEmployees({
      pdvId,
      tenantId: effectiveTenantId,
      status,
      search,
      page:  isNaN(page)  ? 1  : page,
      limit: isNaN(limit) ? 20 : limit,
    })

    return mobileOk(result)

  } catch (error) {
    console.error('[GET /api/mobile/pdv/employee]', error)
    return mobileError('Erro interno ao listar funcionários.', 'INTERNAL_ERROR', 500)
  }
}

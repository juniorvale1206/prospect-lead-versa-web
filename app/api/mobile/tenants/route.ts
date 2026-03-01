/**
 * GET /api/mobile/tenants
 * ─────────────────────────────────────────────────────────────────────────────
 * Retorna a lista de Tenants (Franquias) para o app Flutter preencher dropdowns.
 *
 * RBAC:
 *   ADMIN_MASTER  → todos os tenants ativos
 *   FINANCIAL     → todos os tenants ativos (visão global)
 *   MANAGER       → apenas o tenant vinculado ao usuário
 *   TEAM_LEADER   → apenas o tenant vinculado ao usuário
 *   PROMOTER      → apenas o tenant vinculado ao usuário
 *
 * Autenticação: Bearer JWT mobile (verifyMobileToken)
 *               OU sessão web (cookie) — suporte dual para testes no browser
 *
 * Resposta 200:
 *   {
 *     success: true,
 *     tenants: [{ id, nome, slug, ativo }]
 *   }
 *
 * Erros:
 *   401  UNAUTHORIZED  — token ausente ou inválido
 *   403  FORBIDDEN     — usuário sem tenant vinculado (MANAGER/TEAM_LEADER sem tenant)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyMobileToken }         from '@/lib/mobile-auth'
import { getSession }                from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ success: false, error: { code, message: msg } }, { status })
}

// Roles que podem acessar todos os tenants
const GLOBAL_ROLES = ['ADMIN_MASTER', 'FINANCIAL']

// Roles restritos ao próprio tenant
const SCOPED_ROLES = ['MANAGER', 'TEAM_LEADER', 'PROMOTER', 'PARTNER_EMPLOYEE']

export async function GET(req: NextRequest) {
  /* ── 1. Autenticação (Bearer mobile OU cookie web) ────────────────────── */
  let userId: string | null = null
  let role:   string | null = null
  let tenantId: string | null = null

  // Tenta token mobile primeiro
  const mobilePayload = await verifyMobileToken(req)
  if (mobilePayload) {
    userId   = mobilePayload.sub
    role     = mobilePayload.role
    tenantId = mobilePayload.tenantId ?? null
  } else {
    // Fallback: sessão web (cookie) — útil para testes via browser/Postman
    const webSession = await getSession()
    if (webSession) {
      userId   = webSession.userId
      role     = webSession.role
      tenantId = webSession.tenantId ?? null
    }
  }

  if (!userId || !role) {
    return err('Token inválido ou expirado. Faça login novamente.', 401, 'UNAUTHORIZED')
  }

  /* ── 2. Montar filtro Prisma baseado no role ──────────────────────────── */
  let where: Record<string, unknown> = { ativo: true }

  if (GLOBAL_ROLES.includes(role)) {
    // ADMIN_MASTER / FINANCIAL → todos os tenants ativos
    // where já está { ativo: true }
  } else if (SCOPED_ROLES.includes(role)) {
    // MANAGER / TEAM_LEADER / PROMOTER → apenas o próprio tenant
    if (!tenantId) {
      // Usuário sem tenant vinculado — não tem acesso a nenhuma franquia
      return NextResponse.json({
        success: true,
        tenants: [],
        message: 'Usuário não está vinculado a nenhuma franquia.',
      })
    }
    where = { ativo: true, id: tenantId }
  } else {
    return err('Nível de acesso não autorizado para esta rota.', 403, 'FORBIDDEN')
  }

  /* ── 3. Buscar tenants no banco ───────────────────────────────────────── */
  const tenants = await prisma.tenant.findMany({
    where,
    select: {
      id:    true,
      nome:  true,
      slug:  true,
      ativo: true,
    },
    orderBy: { nome: 'asc' },
  })

  /* ── 4. Resposta ──────────────────────────────────────────────────────── */
  return NextResponse.json({
    success: true,
    role,                      // debug: mostra qual role foi identificada
    tenants,
    meta: {
      total:       tenants.length,
      isFiltered:  SCOPED_ROLES.includes(role),   // true se restrito ao próprio tenant
    },
  })
}

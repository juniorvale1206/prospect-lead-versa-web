/**
 * /api/commission-models — CRUD de Modelos de Comissão
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GET  /api/commission-models       → lista todos do tenant
 * POST /api/commission-models       → cria novo modelo
 *
 * EXEMPLOS DE MODELOS:
 *   "Padrão Frentista"   → fixedValue: 50.00, percentageValue: null
 *   "Alta Performance"   → fixedValue: 30.00, percentageValue: 5.0
 *   "Comissão Pura"      → fixedValue:  0.00, percentageValue: 8.0
 *   "Gerente de Loja"    → fixedValue: 100.00, percentageValue: 3.0
 *
 * CÁLCULO:
 *   comissão = fixedValue + (totalAmount × percentageValue / 100)
 *
 * Autorização: ADMIN_MASTER e MANAGER (cookie de sessão web)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function err(message: string, status = 400, code = 'VALIDATION_ERROR') {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

async function getSession(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── GET /api/commission-models ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  try {
    const sp          = req.nextUrl.searchParams
    const statusFilter = sp.get('status')  ?? undefined
    const searchFilter = sp.get('search')  ?? undefined

    const where = {
      ...(session.role !== 'ADMIN_MASTER'
        ? { tenantId: session.tenantId }
        : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(searchFilter ? { name: { contains: searchFilter } } : {}),
    }

    const models = await prisma.commissionModel.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: {
        id:              true,
        name:            true,
        fixedValue:      true,
        percentageValue: true,
        description:     true,
        status:          true,
        createdAt:       true,
        _count: { select: { employees: true } },
      },
    })

    const data = models.map((m) => ({
      ...m,
      employeesCount:    m._count.employees,
      commissionPreview: {
        onSaleOf100: round2(m.fixedValue + ((m.percentageValue ?? 0) * 100) / 100),
        formula:     buildFormula(m.fixedValue, m.percentageValue),
      },
    }))

    return NextResponse.json({ success: true, data })
  } catch (e) {
    console.error('[GET /api/commission-models]', e)
    return err('Erro interno.', 500, 'INTERNAL_ERROR')
  }
}

// ─── POST /api/commission-models ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  if (!['ADMIN_MASTER', 'MANAGER'].includes(session.role)) {
    return err('Sem permissão para criar modelos de comissão.', 403, 'FORBIDDEN')
  }

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return err('Body inválido.', 400, 'INVALID_BODY') }

  const { name, fixedValue, percentageValue, description } = body

  // Validações
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return err('O campo name é obrigatório (mínimo 2 caracteres).', 400, 'VALIDATION_ERROR')
  }
  if (typeof fixedValue !== 'number' || fixedValue < 0) {
    return err('fixedValue deve ser um número >= 0.', 400, 'VALIDATION_ERROR')
  }
  if (
    percentageValue !== undefined &&
    percentageValue !== null &&
    (typeof percentageValue !== 'number' || percentageValue < 0 || percentageValue > 100)
  ) {
    return err('percentageValue deve ser um número entre 0 e 100.', 400, 'VALIDATION_ERROR')
  }
  if (fixedValue === 0 && (!percentageValue || percentageValue === 0)) {
    return err(
      'Um modelo de comissão deve ter pelo menos fixedValue > 0 ou percentageValue > 0.',
      400, 'VALIDATION_ERROR',
    )
  }

  const model = await prisma.commissionModel.create({
    data: {
      name:            (name as string).trim(),
      fixedValue:      fixedValue as number,
      percentageValue: (percentageValue as number | undefined) ?? null,
      description:     (description as string | undefined)?.trim() ?? null,
      status:          'ACTIVE',
      tenantId:        session.tenantId ?? null,
    },
  })

  return NextResponse.json(
    {
      success: true,
      data: {
        ...model,
        commissionPreview: {
          onSaleOf100: round2(model.fixedValue + ((model.percentageValue ?? 0) * 100) / 100),
          formula:     buildFormula(model.fixedValue, model.percentageValue),
        },
      },
    },
    { status: 201 },
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

function buildFormula(fixedValue: number, percentageValue: number | null): string {
  const parts: string[] = []
  if (fixedValue > 0)      parts.push(`R$ ${fixedValue.toFixed(2)} fixo`)
  if (percentageValue && percentageValue > 0) parts.push(`${percentageValue}% da venda`)
  return parts.length > 0 ? parts.join(' + ') : 'sem comissão'
}

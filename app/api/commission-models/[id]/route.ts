/**
 * /api/commission-models/[id] — CRUD individual de Modelo de Comissão
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GET    /api/commission-models/:id  → detalhes + lista de funcionários
 * PATCH  /api/commission-models/:id  → atualizar campos
 * DELETE /api/commission-models/:id  → desativar (soft delete → status INACTIVE)
 *
 * Autorização: cookie de sessão web (ADMIN_MASTER ou MANAGER)
 *   – GET    → qualquer role autenticado via cookie
 *   – PATCH  → ADMIN_MASTER, MANAGER
 *   – DELETE → ADMIN_MASTER, MANAGER (apenas se employeesCount === 0)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ─── Helper de erro padronizado ───────────────────────────────────────────────
function err(message: string, status = 400, code = 'VALIDATION_ERROR') {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

// ─── Lê o cookie de sessão e retorna o payload do JWT ─────────────────────────
async function getSession(req: NextRequest) {
  const token = req.cookies.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── GET /api/commission-models/:id ──────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  const { id } = params

  try {
    const model = await prisma.commissionModel.findUnique({
      where: { id },
      include: {
        employees: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            user: {
              select: {
                id:             true,
                nome:           true,
                email:          true,
                telefone:       true,
                avatarUrl:      true,
                ativo:          true,
                approvalStatus: true,
              },
            },
            pdv: {
              select: { id: true, name: true, cidade: true, uf: true },
            },
          },
        },
        _count: { select: { employees: true } },
      },
    })

    if (!model) return err('Modelo de comissão não encontrado.', 404, 'NOT_FOUND')

    // Restrição multi-tenant: não deixar MANAGER ver modelos de outros tenants
    if (
      session.role !== 'ADMIN_MASTER' &&
      model.tenantId !== null &&
      model.tenantId !== session.tenantId
    ) {
      return err('Sem permissão para visualizar este modelo.', 403, 'FORBIDDEN')
    }

    return NextResponse.json({
      success: true,
      data: {
        id:              model.id,
        name:            model.name,
        fixedValue:      model.fixedValue,
        percentageValue: model.percentageValue,
        description:     model.description,
        status:          model.status,
        tenantId:        model.tenantId,
        createdAt:       model.createdAt,
        updatedAt:       model.updatedAt,
        employeesCount:  model._count.employees,
        commissionPreview: {
          onSaleOf100: round2(
            model.fixedValue + ((model.percentageValue ?? 0) * 100) / 100,
          ),
          onSaleOf500: round2(
            model.fixedValue + ((model.percentageValue ?? 0) * 500) / 100,
          ),
          onSaleOf1000: round2(
            model.fixedValue + ((model.percentageValue ?? 0) * 1000) / 100,
          ),
          formula: buildFormula(model.fixedValue, model.percentageValue),
        },
        employees: model.employees.map((emp) => ({
          employeeId:     emp.id,
          userId:         emp.userId,
          name:           emp.user.nome,
          email:          emp.user.email,
          telefone:       emp.user.telefone,
          avatarUrl:      emp.user.avatarUrl,
          ativo:          emp.user.ativo,
          role:           emp.role,
          status:         emp.status,
          approvalStatus: emp.user.approvalStatus,
          pdv:            emp.pdv,
          startedAt:      emp.startedAt,
          endedAt:        emp.endedAt,
          notes:          emp.notes,
          createdAt:      emp.createdAt,
        })),
      },
    })
  } catch (e) {
    console.error(`[GET /api/commission-models/${id}]`, e)
    return err('Erro interno.', 500, 'INTERNAL_ERROR')
  }
}

// ─── PATCH /api/commission-models/:id ────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  if (!['ADMIN_MASTER', 'MANAGER'].includes(session.role)) {
    return err('Sem permissão para editar modelos de comissão.', 403, 'FORBIDDEN')
  }

  const { id } = params

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return err('Body inválido.', 400, 'INVALID_BODY') }

  // Verificar existência e posse
  const existing = await prisma.commissionModel.findUnique({ where: { id } })
  if (!existing) return err('Modelo de comissão não encontrado.', 404, 'NOT_FOUND')

  if (
    session.role !== 'ADMIN_MASTER' &&
    existing.tenantId !== null &&
    existing.tenantId !== session.tenantId
  ) {
    return err('Sem permissão para editar este modelo.', 403, 'FORBIDDEN')
  }

  // Campos editáveis
  const updateData: Record<string, unknown> = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || (body.name as string).trim().length < 2) {
      return err('name deve ter pelo menos 2 caracteres.', 400, 'VALIDATION_ERROR')
    }
    updateData.name = (body.name as string).trim()
  }

  if (body.fixedValue !== undefined) {
    if (typeof body.fixedValue !== 'number' || (body.fixedValue as number) < 0) {
      return err('fixedValue deve ser >= 0.', 400, 'VALIDATION_ERROR')
    }
    updateData.fixedValue = body.fixedValue
  }

  if (body.percentageValue !== undefined) {
    if (
      body.percentageValue !== null &&
      (typeof body.percentageValue !== 'number' ||
        (body.percentageValue as number) < 0 ||
        (body.percentageValue as number) > 100)
    ) {
      return err('percentageValue deve ser entre 0 e 100 ou null.', 400, 'VALIDATION_ERROR')
    }
    updateData.percentageValue = body.percentageValue
  }

  if (body.description !== undefined) {
    updateData.description =
      body.description !== null ? String(body.description).trim() : null
  }

  if (body.status !== undefined) {
    if (!['ACTIVE', 'INACTIVE'].includes(body.status as string)) {
      return err('status deve ser ACTIVE ou INACTIVE.', 400, 'VALIDATION_ERROR')
    }
    updateData.status = body.status
  }

  // Validação cruzada: fixedValue e percentageValue não podem ser ambos 0
  const effectiveFixed =
    (updateData.fixedValue as number | undefined) ?? existing.fixedValue
  const effectivePct =
    (updateData.percentageValue as number | null | undefined) ?? existing.percentageValue

  if (effectiveFixed === 0 && (!effectivePct || effectivePct === 0)) {
    return err(
      'Um modelo de comissão deve ter fixedValue > 0 ou percentageValue > 0.',
      400, 'VALIDATION_ERROR',
    )
  }

  if (Object.keys(updateData).length === 0) {
    return err('Nenhum campo para atualizar foi fornecido.', 400, 'NO_CHANGES')
  }

  try {
    const updated = await prisma.commissionModel.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        commissionPreview: {
          onSaleOf100: round2(
            updated.fixedValue + ((updated.percentageValue ?? 0) * 100) / 100,
          ),
          formula: buildFormula(updated.fixedValue, updated.percentageValue),
        },
      },
    })
  } catch (e) {
    console.error(`[PATCH /api/commission-models/${id}]`, e)
    return err('Erro interno ao atualizar.', 500, 'INTERNAL_ERROR')
  }
}

// ─── DELETE /api/commission-models/:id ───────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession(req)
  if (!session) return err('Não autenticado.', 401, 'UNAUTHORIZED')

  if (!['ADMIN_MASTER', 'MANAGER'].includes(session.role)) {
    return err('Sem permissão para desativar modelos de comissão.', 403, 'FORBIDDEN')
  }

  const { id } = params

  const model = await prisma.commissionModel.findUnique({
    where: { id },
    include: { _count: { select: { employees: true } } },
  })

  if (!model) return err('Modelo de comissão não encontrado.', 404, 'NOT_FOUND')

  // Bloquear exclusão se há funcionários ativos vinculados
  if (model._count.employees > 0) {
    return err(
      `Não é possível desativar um modelo com ${model._count.employees} funcionário(s) vinculado(s). ` +
      'Reatribua ou desative os funcionários primeiro.',
      409,
      'HAS_ACTIVE_EMPLOYEES',
    )
  }

  try {
    // Soft delete: apenas muda status para INACTIVE
    await prisma.commissionModel.update({
      where: { id },
      data: { status: 'INACTIVE' },
    })

    return NextResponse.json({
      success: true,
      message: `Modelo "${model.name}" desativado com sucesso.`,
    })
  } catch (e) {
    console.error(`[DELETE /api/commission-models/${id}]`, e)
    return err('Erro interno ao desativar.', 500, 'INTERNAL_ERROR')
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

function buildFormula(fixedValue: number, percentageValue: number | null): string {
  const parts: string[] = []
  if (fixedValue > 0)                    parts.push(`R$ ${fixedValue.toFixed(2)} fixo`)
  if (percentageValue && percentageValue > 0) parts.push(`${percentageValue}% da venda`)
  return parts.length > 0 ? parts.join(' + ') : 'sem comissão'
}

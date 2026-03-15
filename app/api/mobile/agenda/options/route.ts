/**
 * GET /api/mobile/agenda/options
 * ─────────────────────────────────────────────────────────────────────────────
 * Alimenta o "Filtro de Agendamento" do aplicativo mobile do promotor.
 *
 * Retorna todos os locais disponíveis para visita, agrupados pelas três
 * categorias da Tríade de PDVs. O app usa esta resposta para renderizar
 * um picker/seletor organizado em seções na tela de "Nova Visita".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESPOSTA AGRUPADA:
 * {
 *   success: true,
 *   promotorId: string,           // ID do promotor logado
 *   totais: {
 *     proprias: number,           // total de lojas próprias disponíveis
 *     diamante: number,           // total de parceiros diamante vinculados
 *     digital:  number,           // total de displays digitais sob responsabilidade
 *     total:    number            // soma total de opções
 *   },
 *
 *   // ── Seção 1: Lojas Próprias ─────────────────────────────────────────────
 *   // Qualquer promotor pode agendar visita/auditoria em lojas próprias
 *   unidadesProprias: [
 *     {
 *       id, name, address, cidade, uf, storeType,
 *       category: "PROPRIA",
 *       aiAttendantName: "Ray",   // irrelevante para PROPRIA
 *       latitude, longitude,
 *       totalLeads, managerPromoterId
 *     }
 *   ],
 *
 *   // ── Seção 2: Parceiros Diamante ─────────────────────────────────────────
 *   // Parceiros físicos vinculados ao promotor (managerPromoterId = promotorId)
 *   // Ordenados por totalLeads desc — mais produtivos primeiro
 *   parceirosDiamante: [
 *     {
 *       id, name, address, cidade, uf, storeType,
 *       category: "DIAMANTE",
 *       ...
 *     }
 *   ],
 *
 *   // ── Seção 3: Parceiros Digitais ─────────────────────────────────────────
 *   // Displays sob responsabilidade do promotor (para troca de adesivo QR etc.)
 *   parceirosDigitais: [
 *     {
 *       id, name, address, cidade, uf, storeType,
 *       category: "DIGITAL",
 *       aiAttendantName: "Ray",   // agente que atende leads deste display
 *       ...
 *     }
 *   ]
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTENTICAÇÃO:
 *   Requer sessão válida. Roles aceitos: todos os autenticados.
 *   ADMIN_MASTER: vê todas as categorias de todos os tenants (sem filtro promotor).
 *   MANAGER:      vê todas as categorias do seu tenant (sem filtro promotor).
 *   PROMOTER:     vê apenas os PDVs vinculados a ele (managerPromoterId = seu ID).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUERY PARAMS OPCIONAIS:
 *   search?    string   — busca por nome ou cidade (aplica nas 3 categorias)
 *   cidade?    string   — filtra todas as categorias por município
 *   uf?        string   — filtra todas as categorias por estado
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PERFORMANCE:
 *   • 3 queries paralelas (Promise.all) — uma por categoria
 *   • Select mínimo — não carrega leads[], sales[], employees[], etc.
 *   • Índice [tenantId, category] no schema garante filtro rápido
 */

import { NextRequest, NextResponse }   from 'next/server'
import { getSession }                  from '@/lib/auth'
import { getOptionsForAgenda }         from '@/lib/services/pdv.service'
import { prisma }                      from '@/lib/prisma'

// ─── GET /api/mobile/agenda/options ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // ── 1. Autenticação ───────────────────────────────────────────────────
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado — faça login para acessar' },
        { status: 401 },
      )
    }

    // ── 2. Determina filtros por role ─────────────────────────────────────
    //
    //  ADMIN_MASTER → vê todos (sem filtro de tenant nem de promotor)
    //               → pode passar ?tenantId= para filtrar
    //  MANAGER      → vê todo o seu tenant (sem filtro de promotor)
    //  PROMOTER     → vê apenas os seus PDVs (filtra por promotorId)
    //
    const sp = new URL(req.url).searchParams

    const tenantId: string | null =
      session.role === 'ADMIN_MASTER'
        ? (sp.get('tenantId') ?? null)        // admin pode filtrar por tenant
        : (session.tenantId ?? null)           // demais: só o próprio tenant

    const promotorId: string | null =
      session.role === 'PROMOTER'
        ? session.userId                       // promotor: só os seus PDVs
        : (sp.get('promotorId') ?? null)       // admin/manager: todos (ou filtro manual)

    // ── 3. Query principal ────────────────────────────────────────────────
    const result = await getOptionsForAgenda(tenantId, promotorId)

    // ── 4. Filtro de busca por texto (pós-query — apenas se informado) ────
    const search = sp.get('search')?.toLowerCase().trim()
    const cidade = sp.get('cidade')?.toLowerCase().trim()
    const uf     = sp.get('uf')?.toUpperCase().trim()

    const applyFilters = (list: typeof result.unidadesProprias) =>
      list.filter(item => {
        if (search) {
          const haystack = `${item.name} ${item.cidade ?? ''} ${item.address ?? ''}`.toLowerCase()
          if (!haystack.includes(search)) return false
        }
        if (cidade && !(item.cidade ?? '').toLowerCase().includes(cidade)) return false
        if (uf     && item.uf !== uf) return false
        return true
      })

    const unidadesProprias  = applyFilters(result.unidadesProprias)
    const parceirosDiamante = applyFilters(result.parceirosDiamante)
    const parceirosDigitais = applyFilters(result.parceirosDigitais)

    // ── 5. Totais recalculados após filtro ────────────────────────────────
    const totais = {
      proprias: unidadesProprias.length,
      diamante: parceirosDiamante.length,
      digital:  parceirosDigitais.length,
      total:    unidadesProprias.length + parceirosDiamante.length + parceirosDigitais.length,
    }

    // ── 6. Resposta final ─────────────────────────────────────────────────
    return NextResponse.json({
      success:    true,
      promotorId: promotorId ?? 'all',
      tenantId:   tenantId   ?? 'all',
      filtros: {
        search:    search    ?? null,
        cidade:    cidade    ?? null,
        uf:        uf        ?? null,
      },
      totais,
      unidadesProprias,
      parceirosDiamante,
      parceirosDigitais,
    })

  } catch (err) {
    console.error('[agenda/options] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Erro ao carregar opções de agendamento' },
      { status: 500 },
    )
  }
}

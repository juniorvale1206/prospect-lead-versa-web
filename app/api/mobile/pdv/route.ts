/**
 * GET  /api/mobile/pdv  — lista PDVs do tenant do promotor
 * POST /api/mobile/pdv  — promotor cadastra novo PDV com GPS no campo
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ═══ POST ══════════════════════════════════════════════════════════════════
 *
 * O promotor abre o app mobile, clica em "Cadastrar PDV", o app captura
 * a geolocalização via Geolocation API e envia junto com os dados do PDV.
 *
 * ── DTO completo (CreatePdvDto) ───────────────────────────────────────────
 * {
 *   // OBRIGATÓRIO
 *   name:              string    — nome comercial (≥ 2 chars)
 *
 *   // IDENTIFICAÇÃO
 *   cnpj?:             string    — "11.222.333/0001-44" ou "11222333000144"
 *                                   Validado (algoritmo dígitos verificadores)
 *                                   Único por tenant
 *
 *   // LOCALIZAÇÃO
 *   address?:          string    — endereço completo formatado
 *   cidade?:           string    — município
 *   uf?:               string    — estado ("SP", "RJ", ...)
 *
 *   latitude?:         number    — Float GPS: -90.0 a +90.0
 *                                   Ex: -23.5505  (São Paulo)
 *                                   CAPTURADO PELO APP VIA navigator.geolocation
 *   longitude?:        number    — Float GPS: -180.0 a +180.0
 *                                   Ex: -46.6333  (São Paulo)
 *                                   CAPTURADO PELO APP VIA navigator.geolocation
 *
 *   // CONTATO
 *   ownerName?:        string    — nome do gerente/responsável
 *   ownerPhone?:       string    — telefone do responsável
 *
 *   // TIPO
 *   storeType?:        string    — POSTO_COMBUSTIVEL (default)
 *                                   LOJA_VAREJO | OFICINA | TRANSPORTADORA | OUTROS
 *
 *   // RELAÇÕES
 *   managerPromoterId?:          string — ID do promotor-gerente (default: usuário logado)
 *   customNetworkCommissionPct?: number — taxa customizada 0-100
 * }
 *
 * ── Response 201 ─────────────────────────────────────────────────────────
 * {
 *   success: true,
 *   message: "PDV cadastrado com sucesso",
 *   warnings: ["..."],          // ex: coordenada (0,0) detectada
 *   pdv: {
 *     id, name, cnpj, address, cidade, uf,
 *     latitude, longitude,     ← CAMPOS GEOGRÁFICOS
 *     storeType, status,
 *     totalLeads: 0,
 *     managerPromoter: { id, nome, email },
 *     createdAt
 *   }
 * }
 *
 * ── Erros comuns ──────────────────────────────────────────────────────────
 *   400 — name ausente / CNPJ inválido / CNPJ duplicado / coordenadas inválidas
 *   401 — não autenticado
 *   403 — role sem permissão
 *
 * ═══ GET ═══════════════════════════════════════════════════════════════════
 *
 * Lista PDVs do tenant com paginação e filtro de busca.
 *
 * Query params:
 *   search?  string    — filtra por nome ou CNPJ
 *   page?    number    — default 1
 *   limit?   number    — default 20, max 100
 *   withGeo? boolean   — se "true", retorna apenas PDVs com coordenadas
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }                from '@/lib/auth'
import {
  createPdv,
  getPdvsForMap,
  CreatePdvDto,
} from '@/lib/services/pdv.service'
import { prisma } from '@/lib/prisma'

// Roles que podem cadastrar PDVs via mobile
const ALLOWED_ROLES = ['ADMIN_MASTER', 'MANAGER', 'PROMOTER', 'PARTNER_EMPLOYEE'] as const

// ─── POST /api/mobile/pdv ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    }

    if (!(ALLOWED_ROLES as readonly string[]).includes(session.role)) {
      return NextResponse.json(
        { success: false, error: `Role "${session.role}" não tem permissão para cadastrar PDVs` },
        { status: 403 },
      )
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Corpo da requisição inválido (JSON esperado)' },
        { status: 400 },
      )
    }

    // ── Monta o DTO ──────────────────────────────────────────────────────────
    //
    //  latitude e longitude vêm como number do app mobile (Geolocation API retorna Float).
    //  Garantimos que chegam como number — se o app enviar como string, convertemos.
    //
    const dto: CreatePdvDto = {
      name:      body.name as string,
      cnpj:      body.cnpj      as string | undefined,
      address:   body.address   as string | undefined,
      cidade:    body.cidade    as string | undefined,
      uf:        body.uf        as string | undefined,

      // GPS: converte para number se vier como string (defensivo)
      latitude:  body.latitude  !== undefined
                   ? parseFloat(String(body.latitude))
                   : undefined,
      longitude: body.longitude !== undefined
                   ? parseFloat(String(body.longitude))
                   : undefined,

      ownerName:  body.ownerName  as string | undefined,
      ownerPhone: body.ownerPhone as string | undefined,
      storeType:  body.storeType  as string | undefined,

      // Categoria do PDV: PROPRIA | DIAMANTE | DIGITAL (default)
      category: (['PROPRIA', 'DIAMANTE', 'DIGITAL'].includes(body.category as string)
        ? body.category
        : 'DIGITAL') as 'PROPRIA' | 'DIAMANTE' | 'DIGITAL',

      // Nome do agente de IA (só relevante para DIGITAL; default: "Ray")
      aiAttendantName: body.aiAttendantName
        ? String(body.aiAttendantName).trim() || 'Ray'
        : 'Ray',

      // Se managerPromoterId não for informado, usa o próprio promotor logado
      managerPromoterId: (body.managerPromoterId as string | undefined)
                         ?? (session.role === 'PROMOTER' ? session.userId : undefined),

      customNetworkCommissionPct: body.customNetworkCommissionPct !== undefined
        ? parseFloat(String(body.customNetworkCommissionPct))
        : undefined,
    }

    // ── Cria o PDV via service ───────────────────────────────────────────────
    const { pdv, warnings } = await createPdv(dto, session.userId, session.tenantId)

    // ── Monta resposta com contexto geográfico ────────────────────────────────
    const pdvTyped = pdv as {
      latitude?: number | null
      longitude?: number | null
      [key: string]: unknown
    }

    const hasGeo = pdvTyped.latitude !== null && pdvTyped.longitude !== null
    const geoMsg = hasGeo
      ? `📍 Localização GPS registrada (${pdvTyped.latitude?.toFixed(6)}, ${pdvTyped.longitude?.toFixed(6)})`
      : '⚠ PDV cadastrado sem coordenadas GPS — pino não aparecerá no Mapa ao Vivo'

    return NextResponse.json(
      {
        success:  true,
        message:  'PDV cadastrado com sucesso',
        geoStatus: geoMsg,
        warnings: warnings.length > 0 ? warnings : undefined,
        pdv,
      },
      { status: 201 },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao cadastrar PDV'
    console.error('[mobile/pdv] POST error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}

// ─── GET /api/mobile/pdv ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
    }

    const sp      = new URL(req.url).searchParams
    const search  = sp.get('search')  ?? ''
    const withGeo = sp.get('withGeo') === 'true'
    const page    = Math.max(1, parseInt(sp.get('page')  ?? '1',  10))
    const limit   = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20', 10)))
    const skip    = (page - 1) * limit

    const tenantFilter = session.tenantId ? { tenantId: session.tenantId } : {}

    // Para o Mapa ao Vivo: retorna apenas PDVs com coordenadas
    if (withGeo) {
      const pdvs = await getPdvsForMap(session.tenantId)
      return NextResponse.json({ success: true, data: pdvs, total: pdvs.length })
    }

    const where = {
      ...tenantFilter,
      ...(search ? {
        OR: [
          { name:  { contains: search } },
          { cnpj:  { contains: search } },
          { cidade:{ contains: search } },
        ],
      } : {}),
    }

    const [data, total] = await Promise.all([
      prisma.partnerStore.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id:         true,
          name:       true,
          cnpj:       true,
          address:    true,
          cidade:     true,
          uf:         true,
          latitude:   true,
          longitude:  true,
          storeType:  true,
          category:   true,
          aiAttendantName: true,
          status:     true,
          totalLeads: true,
          managerPromoter: {
            select: { id: true, nome: true },
          },
          createdAt: true,
        },
      }),
      prisma.partnerStore.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('[mobile/pdv] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Erro ao listar PDVs' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/mobile/pdv/map-locations
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoint otimizado para o "Radar de PDVs" / "Mapa de Parceiros" do app mobile.
 *
 * PROPÓSITO:
 *   Devolver APENAS os dados geográficos necessários para renderizar pinos no
 *   mapa — sem campos desnecessários que desperdiçariam dados móveis do promotor.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FILTROS APLICADOS AUTOMATICAMENTE:
 *   1. status = "ACTIVE"          → só PDVs ativos aparecem no mapa
 *   2. tenantId = session.tenantId → isolamento multi-tenant obrigatório
 *   3. latitude  IS NOT NULL      → sem coordenada, sem pino
 *   4. longitude IS NOT NULL      → sem coordenada, sem pino
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAYLOAD RETORNADO (select otimizado — mínimo necessário para o mapa):
 * {
 *   success: true,
 *   total: number,               // total de pinos no mapa
 *   ownPdvCount: number,         // PDVs gerenciados pelo próprio promotor
 *   bounds: {                    // bounding box para centralizar o mapa
 *     minLat, maxLat, minLng, maxLng, centerLat, centerLng
 *   },
 *   locations: [
 *     {
 *       id:               string   — identificador único do PDV
 *       name:             string   — nome comercial (ex: "Posto Ipiranga Centro")
 *       address:          string?  — endereço formatado para exibir no popup
 *       latitude:         number   — coordenada para o pino (nunca null aqui)
 *       longitude:        number   — coordenada para o pino (nunca null aqui)
 *       totalLeads:       number   — leads gerados (controla intensidade do pino)
 *       managerPromoterId: string? — para destacar PDVs do próprio promotor
 *       isOwn:            boolean  — true se managerPromoterId === session.userId
 *       storeType:        string   — tipo de ícone a renderizar no mapa
 *       cidade:           string?  — cidade (para clustering geográfico)
 *       uf:               string?  — estado
 *     }
 *   ]
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUERY PARAMS OPCIONAIS:
 *   storeType?  string   — filtra por tipo (POSTO_COMBUSTIVEL | LOJA_VAREJO | ...)
 *   cidade?     string   — filtra por município
 *   uf?         string   — filtra por estado
 *   minLeads?   number   — retorna apenas PDVs com totalLeads >= minLeads
 *                          (útil para mostrar só "top performers" no mapa)
 *   ownOnly?    boolean  — se "true", retorna apenas PDVs do próprio promotor
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTENTICAÇÃO:
 *   Requer sessão válida (cookie ou Bearer token).
 *   Roles permitidos: todos os autenticados.
 *   Isolamento: ADMIN_MASTER vê todos os tenants; demais veem só o seu tenant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PERFORMANCE:
 *   • select minimalista — não carrega leads[], sales[], employees[], etc.
 *   • Índice [latitude, longitude] no schema garante filtro rápido
 *   • Índice [tenantId, cidade] acelera clustering regional
 *   • bounds calculado em JS após query — evita subquery extra no SQLite
 *   • Resposta ~2-5KB para até 500 PDVs (vs ~200KB de um findMany completo)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession }               from '@/lib/auth'
import { getMapLocations }          from '@/lib/services/pdv.service'

// ─── GET /api/mobile/pdv/map-locations ──────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // ── 1. Autenticação ────────────────────────────────────────────────────
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado — faça login para acessar o mapa' },
        { status: 401 },
      )
    }

    // ── 2. Query params (filtros opcionais) ────────────────────────────────
    const sp        = new URL(req.url).searchParams
    const storeType = sp.get('storeType') ?? undefined
    const cidade    = sp.get('cidade')    ?? undefined
    const uf        = sp.get('uf')        ?? undefined
    const ownOnly   = sp.get('ownOnly')   === 'true'
    const minLeads  = sp.get('minLeads')  ? parseInt(sp.get('minLeads')!, 10) : undefined

    // ── 3. ADMIN_MASTER não tem tenantId — vê todos os tenants ─────────────
    //     Demais roles: obrigado a ter tenantId (isolamento multi-tenant)
    const tenantId = session.role === 'ADMIN_MASTER'
      ? (sp.get('tenantId') ?? null)   // admin pode filtrar por tenant via query
      : session.tenantId               // demais: só o próprio tenant

    // ── 4. Busca as localizações via service ───────────────────────────────
    const locations = await getMapLocations({
      tenantId,
      storeType,
      cidade,
      uf,
      minLeads,
      ownOnly: ownOnly ? session.userId : undefined,
    })

    // ── 5. Pós-processamento: marca PDVs do próprio promotor ───────────────
    //
    //   isOwn = true quando o promotor logado é o gerente do PDV.
    //   O app usa esse campo para:
    //     • Exibir pino de cor diferente (ex: azul = meu PDV, cinza = outros)
    //     • Mostrar badge "Meu PDV" no popup
    //     • Ordenar na lista lateral priorizando os próprios
    //
    const enriched = locations.map(loc => ({
      ...loc,
      isOwn: loc.managerPromoterId === session.userId,
    }))

    // ── 6. Conta PDVs próprios ─────────────────────────────────────────────
    const ownPdvCount = enriched.filter(l => l.isOwn).length

    // ── 7. Calcula bounding box para centralizar o mapa automaticamente ────
    //
    //   O app recebe bounds e chama map.fitBounds(bounds) — sem precisar
    //   calcular no cliente ou fazer uma segunda requisição.
    //
    const bounds = calcBounds(enriched)

    // ── 8. Resposta final ──────────────────────────────────────────────────
    return NextResponse.json({
      success:     true,
      total:       enriched.length,
      ownPdvCount,
      bounds,
      filters: {
        tenantId:  tenantId ?? 'all',
        storeType: storeType ?? 'all',
        cidade:    cidade    ?? 'all',
        uf:        uf        ?? 'all',
        minLeads:  minLeads  ?? 0,
        ownOnly,
      },
      locations: enriched,
    })

  } catch (err) {
    console.error('[mobile/pdv/map-locations] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Erro ao carregar localizações do mapa' },
      { status: 500 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: calcula bounding box + centro geográfico
// ─────────────────────────────────────────────────────────────────────────────

interface LatLng {
  latitude:  number
  longitude: number
}

interface Bounds {
  minLat:    number
  maxLat:    number
  minLng:    number
  maxLng:    number
  centerLat: number
  centerLng: number
}

function calcBounds(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null

  let minLat =  90, maxLat = -90
  let minLng = 180, maxLng = -180

  for (const p of points) {
    if (p.latitude  < minLat) minLat = p.latitude
    if (p.latitude  > maxLat) maxLat = p.latitude
    if (p.longitude < minLng) minLng = p.longitude
    if (p.longitude > maxLng) maxLng = p.longitude
  }

  return {
    minLat:    round6(minLat),
    maxLat:    round6(maxLat),
    minLng:    round6(minLng),
    maxLng:    round6(maxLng),
    centerLat: round6((minLat + maxLat) / 2),
    centerLng: round6((minLng + maxLng) / 2),
  }
}

/** Arredonda para 6 casas decimais (~11 cm de precisão) */
function round6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000
}

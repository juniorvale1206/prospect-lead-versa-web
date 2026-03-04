/**
 * /api/prospeccao/search
 * POST { mode: "map" | "cnae", keyword, location, cnae, uf, city, radius? }
 *
 * Busca empresas via Google Places (mode=map) ou por CNAE/localidade (mode=cnae).
 * Retorna lista de candidatos a lead B2B.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import {
  searchLocalBusinesses,
  getPlaceDetails,
  type PlaceItem,
} from '@/lib/services/b2b-search.service'

// Mapa CNAE → termos de busca Google
const CNAE_TO_KEYWORD: Record<string, string> = {
  '4930-2/02': 'Transportadora de cargas',
  '4930-2/01': 'Transporte rodoviário mudança',
  '7711-0/00': 'Locadora de automóveis',
  '5231-1/02': 'Operador portuário',
  '5212-5/00': 'Armazém geral logística',
  '4921-3/02': 'Empresa de ônibus fretamento',
  '8020-0/02': 'Empresa de segurança e monitoramento',
  '4511-1/01': 'Concessionária de veículos',
  '8591-1/00': 'Escola de motoristas e transporte',
  '3317-1/01': 'Manutenção de veículos pesados',
}

const ALLOWED_ROLES = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']

export async function POST(req: NextRequest) {
  // Auth
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })
  const session = await verifyToken(cookieToken)
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  let body: {
    mode:      'map' | 'cnae'
    keyword?:  string
    location?: string
    cnae?:     string
    uf?:       string
    city?:     string
    radius?:   number
    enrichDetails?: boolean
  }

  try { body = await req.json() }
  catch { return NextResponse.json({ success: false, error: 'JSON inválido.' }, { status: 400 }) }

  const { mode, cnae, uf, city, radius = 50000, enrichDetails = false } = body
  let   { keyword, location } = body

  // Monta query com base no modo
  if (mode === 'cnae') {
    if (!cnae) return NextResponse.json({ success: false, error: 'CNAE obrigatório.' }, { status: 400 })
    keyword  = CNAE_TO_KEYWORD[cnae] ?? `Empresa CNAE ${cnae}`
    location = [city, uf].filter(Boolean).join(' ')
  }

  if (!keyword?.trim()) return NextResponse.json({ success: false, error: 'Informe uma palavra-chave ou CNAE.' }, { status: 400 })
  if (!location?.trim()) location = 'Brasil'

  const searchResult = await searchLocalBusinesses(keyword.trim(), location.trim(), radius)

  if (!searchResult.success) {
    return NextResponse.json({ success: false, error: searchResult.error }, { status: 502 })
  }

  // Enriquece com detalhes (telefone/website) se solicitado e API Key disponível
  let results: PlaceItem[] = searchResult.results
  if (enrichDetails && process.env.GOOGLE_MAPS_API_KEY) {
    const enriched = await Promise.allSettled(
      results.slice(0, 10).map(async (p) => {
        const details = await getPlaceDetails(p.placeId)
        return { ...p, ...details }
      })
    )
    results = enriched.map((r, i) =>
      r.status === 'fulfilled' ? r.value : results[i]
    )
  }

  return NextResponse.json({
    success:       true,
    total:         results.length,
    keyword,
    location,
    cnae:          cnae ?? null,
    nextPageToken: searchResult.nextPageToken,
    results,
  })
}

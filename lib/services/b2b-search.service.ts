/**
 * B2bSearchService — Motor de Prospecção Ativa B2B
 * ─────────────────────────────────────────────────────────────────────────────
 * Integra duas fontes de dados para descoberta de leads corporativos:
 *
 *  1. BrasilAPI / ReceitaWS  → Enriquecimento por CNPJ (dados da Receita Federal)
 *  2. Google Places API      → Busca geográfica por tipo de negócio
 *
 * Fluxo típico:
 *   searchLocalBusinesses("Transportadora", "São Paulo SP")
 *     → lista de empresas com nome, endereço, placeId
 *     → para cada resultado: enrichCnpj(cnpj) preenche todos os campos
 *     → importLeadFromProspecting(data, tenantId) salva no CRM
 *
 * Referências:
 *   BrasilAPI:   https://brasilapi.com.br/docs#tag/CNPJ
 *   ReceitaWS:   https://receitaws.com.br/
 *   Google Places: https://developers.google.com/maps/documentation/places/web-service
 */

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces de Tipagem
// ─────────────────────────────────────────────────────────────────────────────

/** Sócio / Quadro Societário */
export interface QSAMember {
  nome:             string
  qualificacao:     string
  pais_origem?:     string
  nome_representante?: string
  qualificacao_representante?: string
  faixa_etaria?:    string
}

/** Dados enriquecidos retornados pelo CNPJ lookup */
export interface CnpjEnrichmentResult {
  success:           boolean
  cnpj?:             string
  razaoSocial?:      string
  nomeFantasia?:     string
  cnaeCode?:         string
  cnaeDescricao?:    string
  cnaesSecundarios?: { codigo: string; descricao: string }[]
  situacao?:         string   // ATIVA | BAIXADA | SUSPENSA | INAPTA
  porte?:            string   // ME | EPP | DEMAIS | GRANDE
  abertura?:         string
  naturezaJuridica?: string
  capitalSocial?:    number
  // Contatos
  telefone?:         string
  email?:            string
  // Endereço
  logradouro?:       string
  numero?:           string
  complemento?:      string
  bairro?:           string
  municipio?:        string
  uf?:               string
  cep?:              string
  // Sócios
  qsa?:              QSAMember[]
  // Meta
  source:            'brasilapi' | 'receitaws' | 'mock'
  error?:            string
}

/** Resultado de busca no Google Places */
export interface PlacesSearchResult {
  success:           boolean
  results:           PlaceItem[]
  nextPageToken?:    string
  error?:            string
}

export interface PlaceItem {
  placeId:           string
  name:              string
  formattedAddress:  string
  rating?:           number
  userRatingsTotal?: number
  types:             string[]
  // Preenchido via Place Details (chamada adicional)
  phoneNumber?:      string
  website?:          string
  openNow?:          boolean
}

/** Payload para importar lead ao CRM */
export interface ProspectImportPayload {
  // Dados básicos
  nomeCliente:    string
  telefone?:      string
  email?:         string
  // Dados empresariais
  cnpj?:          string
  empresaNome?:   string
  razaoSocial?:   string
  cnae?:          string
  cnaeDescricao?: string
  frota?:         string
  segmento?:      string
  porte?:         string
  // Endereço
  logradouro?:    string
  numero?:        string
  complemento?:   string
  bairro?:        string
  municipio?:     string
  uf?:            string
  cep?:           string
  // Prospecção
  googlePlaceId?: string
  situacaoCadastral?: string
  qsa?:           string    // JSON serializado
  doresIdentificadas?: string
  // Meta
  tenantId:       string
  createdById?:   string
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Enriquecimento por CNPJ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * enrichCnpj — Busca dados completos de uma empresa pelo CNPJ
 *
 * Estratégia de fallback:
 *   1. Tenta BrasilAPI (sem autenticação, sem rate limit severo)
 *   2. Se falhar → tenta ReceitaWS (limite: 3 req/min em produção)
 *   3. Se ambos falharem → retorna { success: false, error }
 *
 * @param cnpj CNPJ com ou sem formatação (aceita "12.345.678/0001-90" ou "12345678000190")
 */
export async function enrichCnpj(cnpj: string): Promise<CnpjEnrichmentResult> {
  // Normaliza — apenas dígitos
  const cnpjClean = cnpj.replace(/\D/g, '')

  if (cnpjClean.length !== 14) {
    return { success: false, source: 'brasilapi', error: 'CNPJ deve ter 14 dígitos.' }
  }

  // ── Tentativa 1: BrasilAPI ──────────────────────────────────────────────
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'ProspecLead-CRM/1.0' },
      signal:  AbortSignal.timeout(10_000),   // 10s timeout
    })

    if (res.ok) {
      const data = await res.json() as BrasilApiCnpjResponse
      return parseBrasilApiResponse(data)
    }

    // Status 404 ou 429 → tenta ReceitaWS
    console.warn(`[B2B] BrasilAPI retornou ${res.status} — tentando ReceitaWS`)
  } catch (e) {
    console.warn('[B2B] BrasilAPI falhou:', (e as Error).message, '— tentando ReceitaWS')
  }

  // ── Tentativa 2: ReceitaWS ─────────────────────────────────────────────
  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpjClean}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'ProspecLead-CRM/1.0' },
      signal:  AbortSignal.timeout(10_000),
    })

    if (res.ok) {
      const data = await res.json() as ReceitaWsResponse
      if (data.status === 'ERROR') {
        return { success: false, source: 'receitaws', error: data.message ?? 'CNPJ não encontrado.' }
      }
      return parseReceitaWsResponse(data)
    }
  } catch (e) {
    console.error('[B2B] ReceitaWS também falhou:', (e as Error).message)
  }

  return {
    success: false,
    source:  'brasilapi',
    error:   'Não foi possível consultar o CNPJ. Tente novamente em instantes.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Busca por Google Places API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * searchLocalBusinesses — Busca empresas no Google Places por palavra-chave e localização
 *
 * Exemplo: searchLocalBusinesses("Transportadora de cargas", "Belo Horizonte MG")
 *
 * @param keyword  Termo de busca (ex: "Transportadora", "Locadora de veículos")
 * @param location Cidade + UF (ex: "São Paulo SP")
 * @param radius   Raio em metros (padrão: 50km)
 * @param apiKey   Google Maps API Key (lida de process.env.GOOGLE_MAPS_API_KEY se omitida)
 */
export async function searchLocalBusinesses(
  keyword:  string,
  location: string,
  radius    = 50000,
  apiKey?:  string
): Promise<PlacesSearchResult> {
  const key = apiKey ?? process.env.GOOGLE_MAPS_API_KEY ?? ''

  if (!key) {
    // Sem API key → retorna dados mock para demonstração
    console.warn('[B2B] GOOGLE_MAPS_API_KEY não configurada — retornando mock')
    return getMockPlacesResults(keyword, location)
  }

  const query  = encodeURIComponent(`${keyword} em ${location}`)
  const url    = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&radius=${radius}&language=pt-BR&key=${key}`

  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    const data = await res.json() as GooglePlacesResponse

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return {
        success: false,
        results: [],
        error:   `Google Places retornou: ${data.status} — ${data.error_message ?? ''}`,
      }
    }

    return {
      success:       true,
      nextPageToken: data.next_page_token,
      results: (data.results ?? []).map(p => ({
        placeId:          p.place_id,
        name:             p.name,
        formattedAddress: p.formatted_address,
        rating:           p.rating,
        userRatingsTotal: p.user_ratings_total,
        types:            p.types ?? [],
      })),
    }
  } catch (e) {
    console.error('[B2B] Google Places Error:', e)
    return { success: false, results: [], error: (e as Error).message }
  }
}

/**
 * getPlaceDetails — Busca telefone e website de um Place pelo ID
 * Chamada adicional necessária pois textsearch não retorna contatos
 */
export async function getPlaceDetails(placeId: string, apiKey?: string): Promise<Partial<PlaceItem>> {
  const key = apiKey ?? process.env.GOOGLE_MAPS_API_KEY ?? ''
  if (!key) return {}

  try {
    const fields = 'formatted_phone_number,website,opening_hours,rating'
    const url    = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&language=pt-BR&key=${key}`
    const res    = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    const data   = await res.json() as { result: { formatted_phone_number?: string; website?: string; opening_hours?: { open_now: boolean } } }

    return {
      phoneNumber: data.result?.formatted_phone_number,
      website:     data.result?.website,
      openNow:     data.result?.opening_hours?.open_now,
    }
  } catch { return {} }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsers internos — BrasilAPI
// ─────────────────────────────────────────────────────────────────────────────
function parseBrasilApiResponse(d: BrasilApiCnpjResponse): CnpjEnrichmentResult {
  const atividades = d.cnaes_secundarios ?? []
  return {
    success:       true,
    source:        'brasilapi',
    cnpj:          d.cnpj,
    razaoSocial:   d.razao_social,
    nomeFantasia:  d.nome_fantasia ?? undefined,
    cnaeCode:      d.cnae_fiscal?.toString(),
    cnaeDescricao: d.cnae_fiscal_descricao,
    cnaesSecundarios: atividades.map(a => ({ codigo: a.codigo.toString(), descricao: a.descricao })),
    situacao:      d.descricao_situacao_cadastral,
    porte:         d.porte,
    abertura:      d.data_inicio_atividade,
    naturezaJuridica: d.natureza_juridica,
    capitalSocial: d.capital_social,
    telefone:      formatPhone([d.ddd_telefone_1, d.ddd_telefone_2]),
    email:         d.email?.toLowerCase() || undefined,
    logradouro:    d.logradouro,
    numero:        d.numero,
    complemento:   d.complemento || undefined,
    bairro:        d.bairro,
    municipio:     d.municipio,
    uf:            d.uf,
    cep:           d.cep?.replace(/\D/g, ''),
    qsa: (d.qsa ?? []).map(s => ({
      nome:         s.nome_socio,
      qualificacao: s.qualificacao_socio,
      faixa_etaria: s.faixa_etaria,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsers internos — ReceitaWS
// ─────────────────────────────────────────────────────────────────────────────
function parseReceitaWsResponse(d: ReceitaWsResponse): CnpjEnrichmentResult {
  return {
    success:       true,
    source:        'receitaws',
    cnpj:          d.cnpj?.replace(/\D/g, ''),
    razaoSocial:   d.nome,
    nomeFantasia:  d.fantasia || undefined,
    cnaeCode:      d.atividade_principal?.[0]?.code,
    cnaeDescricao: d.atividade_principal?.[0]?.text,
    cnaesSecundarios: (d.atividades_secundarias ?? []).map(a => ({ codigo: a.code, descricao: a.text })),
    situacao:      d.situacao,
    porte:         d.porte,
    abertura:      d.abertura,
    naturezaJuridica: d.natureza_juridica,
    capitalSocial: parseFloat(d.capital_social?.replace(/[^0-9,]/g, '').replace(',', '.')) || undefined,
    telefone:      formatPhone([d.telefone]),
    email:         d.email?.toLowerCase() || undefined,
    logradouro:    d.logradouro,
    numero:        d.numero,
    complemento:   d.complemento || undefined,
    bairro:        d.bairro,
    municipio:     d.municipio,
    uf:            d.uf,
    cep:           d.cep?.replace(/\D/g, ''),
    qsa: (d.qsa ?? []).map(s => ({
      nome:         s.nome,
      qualificacao: s.qual,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock — resultados Google Places sem API Key
// ─────────────────────────────────────────────────────────────────────────────
function getMockPlacesResults(keyword: string, location: string): PlacesSearchResult {
  const MOCK_TRANSPORTADORAS: PlaceItem[] = [
    { placeId: 'mock_p1', name: 'Transportadora Rápida Ltda',       formattedAddress: 'Av. Industrial, 1200 — São Paulo, SP',    rating: 4.3, userRatingsTotal: 87,  types: ['moving_company'], phoneNumber: '(11) 3344-5566' },
    { placeId: 'mock_p2', name: 'Cargas Expressas do Brasil S/A',   formattedAddress: 'Rod. Anhanguera km 18 — Campinas, SP',     rating: 4.1, userRatingsTotal: 143, types: ['moving_company'], phoneNumber: '(19) 3211-9988' },
    { placeId: 'mock_p3', name: 'Frotalog Transporte e Logística',  formattedAddress: 'Rua das Fábricas, 450 — Guarulhos, SP',    rating: 3.9, userRatingsTotal: 55,  types: ['moving_company'], phoneNumber: '(11) 4566-7788' },
    { placeId: 'mock_p4', name: 'Mineração Vale do Rio Doce Trans', formattedAddress: 'Av. dos Minérios, 3000 — Belo Horizonte, MG', rating: 4.6, userRatingsTotal: 22, types: ['moving_company'], phoneNumber: '(31) 3344-1122' },
    { placeId: 'mock_p5', name: 'Sul Frete Distribuidora ME',       formattedAddress: 'Rua Tietê, 88 — Curitiba, PR',            rating: 4.0, userRatingsTotal: 34,  types: ['moving_company'], phoneNumber: '(41) 3211-5500' },
    { placeId: 'mock_p6', name: 'Norte Cargas e Armazéns',          formattedAddress: 'Rod. Belém-Brasília, km 02 — Marabá, PA', rating: 3.7, userRatingsTotal: 18,  types: ['moving_company'], phoneNumber: '(94) 3322-1100' },
    { placeId: 'mock_p7', name: 'Locadora Frota Total S/A',         formattedAddress: 'Av. Paulista, 100 — São Paulo, SP',       rating: 4.5, userRatingsTotal: 210, types: ['car_rental'],     phoneNumber: '(11) 4000-8800' },
    { placeId: 'mock_p8', name: 'FastDelivery Motofretes ME',       formattedAddress: 'Rua do Comércio, 77 — Fortaleza, CE',     rating: 4.2, userRatingsTotal: 67,  types: ['moving_company'], phoneNumber: '(85) 3456-9900' },
  ]
  const term = keyword.toLowerCase()
  const filtered = term.includes('locadora')
    ? MOCK_TRANSPORTADORAS.filter(p => p.types.includes('car_rental'))
    : MOCK_TRANSPORTADORAS.filter(p => p.types.includes('moving_company'))
  return {
    success: true,
    results: (filtered.length ? filtered : MOCK_TRANSPORTADORAS).map(p => ({
      ...p,
      formattedAddress: p.formattedAddress.replace('São Paulo, SP', location || 'São Paulo, SP'),
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatPhone(parts: (string | undefined | null)[]): string | undefined {
  const raw = parts.filter(Boolean).join('/').replace(/\D/g, '').slice(0, 11)
  if (!raw) return undefined
  if (raw.length === 11) return `(${raw.slice(0,2)}) ${raw.slice(2,7)}-${raw.slice(7)}`
  if (raw.length === 10) return `(${raw.slice(0,2)}) ${raw.slice(2,6)}-${raw.slice(6)}`
  return raw
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos das APIs externas
// ─────────────────────────────────────────────────────────────────────────────
interface BrasilApiCnpjResponse {
  cnpj:                         string
  razao_social:                 string
  nome_fantasia:                string | null
  cnae_fiscal:                  number
  cnae_fiscal_descricao:        string
  cnaes_secundarios:            { codigo: number; descricao: string }[]
  descricao_situacao_cadastral: string
  porte:                        string
  data_inicio_atividade:        string
  natureza_juridica:            string
  capital_social:               number
  ddd_telefone_1:               string
  ddd_telefone_2:               string
  email:                        string
  logradouro:                   string
  numero:                       string
  complemento:                  string
  bairro:                       string
  municipio:                    string
  uf:                           string
  cep:                          string
  qsa:                          { nome_socio: string; qualificacao_socio: string; faixa_etaria: string }[]
}

interface ReceitaWsResponse {
  cnpj:               string
  nome:               string
  fantasia:           string
  situacao:           string
  porte:              string
  abertura:           string
  natureza_juridica:  string
  capital_social:     string
  telefone:           string
  email:              string
  logradouro:         string
  numero:             string
  complemento:        string
  bairro:             string
  municipio:          string
  uf:                 string
  cep:                string
  atividade_principal: { code: string; text: string }[]
  atividades_secundarias: { code: string; text: string }[]
  qsa:                { nome: string; qual: string }[]
  message?:           string
  status?:            string
}

interface GooglePlacesResponse {
  status:           string
  error_message?:   string
  next_page_token?: string
  results: {
    place_id:          string
    name:              string
    formatted_address: string
    rating?:           number
    user_ratings_total?: number
    types:             string[]
  }[]
}

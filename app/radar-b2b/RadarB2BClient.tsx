'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { CnpjEnrichmentResult, PlaceItem } from '@/lib/services/b2b-search.service'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
interface Session { role: string; nome: string; tenantId: string | null }

interface SearchResult extends PlaceItem {
  cnpj?:         string
  cnaeCode?:     string
  cnaeDescricao?: string
  razaoSocial?:  string
  porte?:        string
  municipio?:    string
  uf?:           string
  situacao?:     string
  imported?:     boolean
  importing?:    boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Dados estáticos
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// BANCO DE CNAEs — organizados por segmento (relevantes para telemetria)
// ─────────────────────────────────────────────────────────────────────────────
interface CnaeOption { code: string; label: string; grupo: string; keywords: string }

const CNAES_DB: CnaeOption[] = [
  // ── Transportadoras & Logística ──
  { code: '4930-2/01', label: '4930-2/01 — Transporte rodoviário de carga', grupo: '🚛 Transportadoras', keywords: 'transportadora carga frete logística caminhão caminhoneiro' },
  { code: '4930-2/02', label: '4930-2/02 — Transporte rodoviário de produtos perigosos', grupo: '🚛 Transportadoras', keywords: 'transportadora produtos perigosos inflamável químico carga' },
  { code: '4930-2/03', label: '4930-2/03 — Transporte rodoviário de mudanças', grupo: '🚛 Transportadoras', keywords: 'mudança transporte rodoviário' },
  { code: '4940-0/00', label: '4940-0/00 — Transporte dutoviário', grupo: '🚛 Transportadoras', keywords: 'duto gasoduto oleoduto transporte' },
  { code: '5212-5/00', label: '5212-5/00 — Carga e descarga / Armazéns gerais', grupo: '🚛 Transportadoras', keywords: 'carga descarga armazém estoque logística' },
  { code: '5231-1/01', label: '5231-1/01 — Administração da infra-estrutura portuária', grupo: '🚛 Transportadoras', keywords: 'porto logística transporte marítimo' },
  { code: '5231-1/02', label: '5231-1/02 — Operações de terminais rodoviários', grupo: '🚛 Transportadoras', keywords: 'terminal rodoviário transporte logística' },
  { code: '5250-8/02', label: '5250-8/02 — Gestão de terminais aquaviários', grupo: '🚛 Transportadoras', keywords: 'aquaviário terminal logística' },
  { code: '5310-5/01', label: '5310-5/01 — Atividades de Correios', grupo: '🚛 Transportadoras', keywords: 'correio entrega logística last mile' },
  { code: '5320-2/01', label: '5320-2/01 — Serviços de entrega rápida', grupo: '🚛 Transportadoras', keywords: 'entrega rápida motoboy courier last mile' },

  // ── Ônibus, Fretamento & Transporte de Passageiros ──
  { code: '4921-3/01', label: '4921-3/01 — Transporte rodoviário coletivo urbano', grupo: '🚌 Ônibus & Passageiros', keywords: 'ônibus transporte coletivo urbano passageiro' },
  { code: '4921-3/02', label: '4921-3/02 — Transporte rodoviário — fretamento intermunicipal', grupo: '🚌 Ônibus & Passageiros', keywords: 'fretamento ônibus intermunicipal passageiro viagem' },
  { code: '4922-1/01', label: '4922-1/01 — Transporte rodoviário de passageiros, regular, urbano', grupo: '🚌 Ônibus & Passageiros', keywords: 'passageiro transporte urbano ônibus' },
  { code: '4922-1/02', label: '4922-1/02 — Transporte escolar', grupo: '🚌 Ônibus & Passageiros', keywords: 'escolar van ônibus transporte criança aluno' },
  { code: '4923-0/02', label: '4923-0/02 — Serviço de táxi', grupo: '🚌 Ônibus & Passageiros', keywords: 'táxi uber transporte passageiro' },
  { code: '4929-9/04', label: '4929-9/04 — Organização de excursões', grupo: '🚌 Ônibus & Passageiros', keywords: 'excursão turismo transporte passeio' },

  // ── Rastreamento & Tecnologia ──
  { code: '6190-6/99', label: '6190-6/99 — Outras atividades de telecomunicações', grupo: '📡 Rastreamento & TI', keywords: 'rastreamento telemetria gps tecnologia telecomunicações monitoramento' },
  { code: '6204-0/00', label: '6204-0/00 — Consultoria em TI', grupo: '📡 Rastreamento & TI', keywords: 'rastreamento tecnologia TI consultoria software sistema' },
  { code: '6209-1/00', label: '6209-1/00 — Suporte técnico, manutenção de TI', grupo: '📡 Rastreamento & TI', keywords: 'suporte técnico manutenção rastreamento sistema gps' },
  { code: '6311-9/00', label: '6311-9/00 — Tratamento de dados / Data center', grupo: '📡 Rastreamento & TI', keywords: 'dados telemetria monitoramento tecnologia iot' },
  { code: '6319-4/00', label: '6319-4/00 — Portais, provedores de internet e hospedagem', grupo: '📡 Rastreamento & TI', keywords: 'internet tecnologia nuvem cloud iot telemetria' },
  { code: '6399-1/99', label: '6399-1/99 — Outras atividades de inf. não especificadas', grupo: '📡 Rastreamento & TI', keywords: 'rastreamento telemetria gps sistema monitoramento frota' },
  { code: '7490-1/04', label: '7490-1/04 — Atividades de intermediação e agenciamento', grupo: '📡 Rastreamento & TI', keywords: 'rastreamento telemetria serviço tecnologia' },

  // ── Segurança ──
  { code: '8011-1/01', label: '8011-1/01 — Atividades de vigilância e segurança privada', grupo: '🔒 Segurança', keywords: 'segurança vigilância monitoramento câmera privada' },
  { code: '8011-1/02', label: '8011-1/02 — Serviços de adestramento de cães de guarda', grupo: '🔒 Segurança', keywords: 'segurança guarda proteção' },
  { code: '8020-0/01', label: '8020-0/01 — Atividades de monitoramento de sistemas de segurança', grupo: '🔒 Segurança', keywords: 'monitoramento câmera alarme segurança rastreamento' },
  { code: '8020-0/02', label: '8020-0/02 — Outras atividades de serviços de segurança', grupo: '🔒 Segurança', keywords: 'segurança vigilância escolta blindagem monitoramento' },
  { code: '8030-7/00', label: '8030-7/00 — Atividades de investigação particular', grupo: '🔒 Segurança', keywords: 'investigação detetive monitoramento segurança' },

  // ── Mineração & Extração ──
  { code: '0510-8/00', label: '0510-8/00 — Extração de carvão mineral', grupo: '⛏️ Mineração', keywords: 'mineração carvão extração mina' },
  { code: '0600-0/01', label: '0600-0/01 — Extração de petróleo e gás natural', grupo: '⛏️ Mineração', keywords: 'petróleo gás extração mineração offshore' },
  { code: '0710-3/01', label: '0710-3/01 — Extração de minério de ferro', grupo: '⛏️ Mineração', keywords: 'mineração ferro minério mina Vale' },
  { code: '0721-9/01', label: '0721-9/01 — Extração de minério de alumínio', grupo: '⛏️ Mineração', keywords: 'mineração alumínio minério bauxita' },
  { code: '0810-0/10', label: '0810-0/10 — Extração de granito e rochas ornamentais', grupo: '⛏️ Mineração', keywords: 'mineração granito pedra extração' },
  { code: '0890-6/01', label: '0890-6/01 — Extração de minerais para fabricação de fertilizantes', grupo: '⛏️ Mineração', keywords: 'mineração fertilizante extração mineral' },

  // ── Construção & Engenharia ──
  { code: '4110-7/00', label: '4110-7/00 — Incorporação de empreendimentos imobiliários', grupo: '🏗️ Construção & Engenharia', keywords: 'construção engenharia obra incorporadora imóvel' },
  { code: '4120-4/00', label: '4120-4/00 — Construção de edifícios', grupo: '🏗️ Construção & Engenharia', keywords: 'construção engenharia obra edifício prédio' },
  { code: '4211-1/01', label: '4211-1/01 — Construção de rodovias e ferrovias', grupo: '🏗️ Construção & Engenharia', keywords: 'construção rodovia estrada ferrovia engenharia' },
  { code: '4212-0/00', label: '4212-0/00 — Construção de obras de arte especiais', grupo: '🏗️ Construção & Engenharia', keywords: 'ponte viaduto engenharia obra civil' },
  { code: '4213-8/00', label: '4213-8/00 — Obras de urbanização', grupo: '🏗️ Construção & Engenharia', keywords: 'urbanização engenharia obra saneamento' },
  { code: '4221-9/01', label: '4221-9/01 — Construção de barragens e represas', grupo: '🏗️ Construção & Engenharia', keywords: 'barragem represa hidrelétrica engenharia obra' },
  { code: '4299-5/99', label: '4299-5/99 — Outras obras de engenharia civil', grupo: '🏗️ Construção & Engenharia', keywords: 'engenharia civil obra construção' },
  { code: '7112-0/00', label: '7112-0/00 — Serviços de engenharia', grupo: '🏗️ Construção & Engenharia', keywords: 'engenharia consultoria projeto técnico' },

  // ── Agronegócio & Agrofrota ──
  { code: '0111-3/01', label: '0111-3/01 — Cultivo de arroz', grupo: '🌾 Agronegócio', keywords: 'agro agricultura fazenda rural produtor' },
  { code: '0151-2/01', label: '0151-2/01 — Criação de bovinos para corte', grupo: '🌾 Agronegócio', keywords: 'agro fazenda gado bovino pecuária' },
  { code: '0161-0/00', label: '0161-0/00 — Atividades de apoio à agricultura', grupo: '🌾 Agronegócio', keywords: 'agro agricultura serviço apoio fazenda' },
  { code: '0162-8/99', label: '0162-8/99 — Atividades de apoio à pecuária', grupo: '🌾 Agronegócio', keywords: 'pecuária fazenda gado animal veterinário' },
  { code: '0163-6/00', label: '0163-6/00 — Atividades pós-colheita', grupo: '🌾 Agronegócio', keywords: 'agro colheita beneficiamento grão cereal' },
  { code: '4612-1/00', label: '4612-1/00 — Comércio de insumos agropecuários', grupo: '🌾 Agronegócio', keywords: 'agro insumo fertilizante defensivo agrícola' },

  // ── Locação de Veículos & Frotas ──
  { code: '7711-0/00', label: '7711-0/00 — Locação de automóveis sem condutor', grupo: '🚗 Locação & Frotas', keywords: 'locação aluguel carro veículo frota rent a car' },
  { code: '7719-5/99', label: '7719-5/99 — Locação de outros meios de transporte', grupo: '🚗 Locação & Frotas', keywords: 'locação aluguel veículo caminhão ônibus frota' },
  { code: '7731-4/00', label: '7731-4/00 — Locação de máquinas e equipamentos agrícolas', grupo: '🚗 Locação & Frotas', keywords: 'locação máquina agrícola frota aluguel' },
  { code: '7732-2/01', label: '7732-2/01 — Locação de máquinas e equipamentos para construção', grupo: '🚗 Locação & Frotas', keywords: 'locação máquina construção equipamento frota aluguel' },
  { code: '4511-1/01', label: '4511-1/01 — Comércio de automóveis e utilitários novos', grupo: '🚗 Locação & Frotas', keywords: 'carro veículo automóvel concessionária frota' },
  { code: '4512-9/01', label: '4512-9/01 — Comércio de automóveis usados', grupo: '🚗 Locação & Frotas', keywords: 'carro usado veículo frota revenda' },
  { code: '4541-2/01', label: '4541-2/01 — Comércio de motocicletas novas', grupo: '🚗 Locação & Frotas', keywords: 'moto motocicleta frota entrega' },

  // ── Saúde & Ambulância ──
  { code: '8610-1/01', label: '8610-1/01 — Atividades de atendimento hospitalar', grupo: '🏥 Saúde', keywords: 'hospital saúde ambulância UTI móvel frota' },
  { code: '8621-6/01', label: '8621-6/01 — UTI Móvel', grupo: '🏥 Saúde', keywords: 'ambulância UTI móvel saúde urgência frota' },
  { code: '8621-6/02', label: '8621-6/02 — Serviços Móveis de Atendimento Urgência', grupo: '🏥 Saúde', keywords: 'samu ambulância urgência saúde' },

  // ── Manutenção Veicular ──
  { code: '4520-0/01', label: '4520-0/01 — Serviços de manutenção de veículos', grupo: '🔧 Manutenção Veicular', keywords: 'manutenção veículo mecânica oficina auto center' },
  { code: '4520-0/02', label: '4520-0/02 — Serviços de lanternagem ou funilaria', grupo: '🔧 Manutenção Veicular', keywords: 'funilaria lanternagem funileiro pintura veículo' },
  { code: '4530-7/01', label: '4530-7/01 — Comércio por atacado de peças para veículos', grupo: '🔧 Manutenção Veicular', keywords: 'peças auto peças veículo caminhão ônibus' },
  { code: '3317-1/01', label: '3317-1/01 — Manutenção de locomotivas, vagões e material rodante', grupo: '🔧 Manutenção Veicular', keywords: 'ferrovia locomotiva vagão manutenção rail' },
  { code: '3319-8/00', label: '3319-8/00 — Manutenção de outras máquinas e equipamentos', grupo: '🔧 Manutenção Veicular', keywords: 'manutenção máquina equipamento industrial' },

  // ── Indústria & Manufatura ──
  { code: '2910-7/01', label: '2910-7/01 — Fabricação de automóveis, camionetas e utilitários', grupo: '🏭 Indústria', keywords: 'fabricação automóvel veículo montadora industria' },
  { code: '2920-4/01', label: '2920-4/01 — Fabricação de caminhões e ônibus', grupo: '🏭 Indústria', keywords: 'fabricação caminhão ônibus veículo montadora industria' },
  { code: '2930-1/01', label: '2930-1/01 — Fabricação de cabines, carrocerias para caminhões', grupo: '🏭 Indústria', keywords: 'carroceria caminhão fabricação indústria' },
  { code: '2731-7/00', label: '2731-7/00 — Fabricação de aparelhos e equipamentos elétricos', grupo: '🏭 Indústria', keywords: 'fabricação equipamento eletrônico elétrico sensor' },
  { code: '2759-7/01', label: '2759-7/01 — Fabricação de aparelhos eletrodomésticos', grupo: '🏭 Indústria', keywords: 'fabricação eletrodoméstico eletrônico' },
]

// Mapa de grupos para exibição organizada
const _grupoSet = new Set(CNAES_DB.map(c => c.grupo))
const CNAE_GRUPOS: string[] = []
_grupoSet.forEach(g => CNAE_GRUPOS.push(g))

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG',
  'MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR',
  'RS','SC','SE','SP','TO',
]

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function RadarB2BClient({ session }: { session: Session }) {
  // ── Aba ativa ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'map' | 'cnae' | 'cnpj'>('map')

  // ── Filtros — Mapa ─────────────────────────────────────────────────────────
  const [mapKeyword,  setMapKeyword]  = useState('Transportadora de cargas')
  const [mapLocation, setMapLocation] = useState('São Paulo SP')

  // ── Filtros — CNAE ─────────────────────────────────────────────────────────
  const [selectedCnae, setSelectedCnae] = useState(CNAES_DB[0].code)
  const [cnaeSearch,   setCnaeSearch]   = useState('')
  const [cnaeDropOpen, setCnaeDropOpen] = useState(false)
  const [cnaeUf,       setCnaeUf]       = useState('SP')
  const [cnaeCity,     setCnaeCity]     = useState('')

  // ── Filtros — CNPJ único ───────────────────────────────────────────────────
  const [cnpjInput,   setCnpjInput]   = useState('')
  const [cnpjResult,  setCnpjResult]  = useState<CnpjEnrichmentResult | null>(null)
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cnpjError,   setCnpjError]   = useState<string | null>(null)

  // ── Resultados de busca ────────────────────────────────────────────────────
  const [results,     setResults]     = useState<SearchResult[]>([])
  const [loading,     setLoading]     = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchMeta,  setSearchMeta]  = useState<{ keyword: string; location: string; total: number } | null>(null)

  // ── Modal de detalhes ──────────────────────────────────────────────────────
  const [detailItem,  setDetailItem]  = useState<SearchResult | null>(null)

  // ── Import toast ──────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const toastTimer    = useRef<NodeJS.Timeout | null>(null)
  const cnaeDropRef   = useRef<HTMLDivElement>(null)

  // ── CNAE filtrado por busca ────────────────────────────────────────────────
  const filteredCnaes = useMemo(() => {
    const q = cnaeSearch.toLowerCase().trim()
    if (!q) return CNAES_DB
    return CNAES_DB.filter(c =>
      c.keywords.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.code.includes(q) ||
      c.grupo.toLowerCase().includes(q)
    )
  }, [cnaeSearch])

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cnaeDropRef.current && !cnaeDropRef.current.contains(e.target as Node)) {
        setCnaeDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Label do CNAE selecionado
  const selectedCnaeLabel = useMemo(() =>
    CNAES_DB.find(c => c.code === selectedCnae)?.label ?? selectedCnae
  , [selectedCnae])

  const selectedCnaeGrupo = useMemo(() =>
    CNAES_DB.find(c => c.code === selectedCnae)?.grupo ?? ''
  , [selectedCnae])

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  // ── Busca no mapa / CNAE ───────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    setLoading(true)
    setSearchError(null)
    setResults([])
    setSearchMeta(null)

    try {
      const payload = activeTab === 'map'
        ? { mode: 'map', keyword: mapKeyword, location: mapLocation }
        : { mode: 'cnae', cnae: selectedCnae, uf: cnaeUf, city: cnaeCity }

      const res  = await fetch('/api/prospeccao/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()

      if (!data.success) throw new Error(data.error ?? 'Erro na busca')

      setResults((data.results as PlaceItem[]).map(r => ({ ...r, imported: false, importing: false })))
      setSearchMeta({ keyword: data.keyword, location: data.location, total: data.total })
    } catch (e) {
      setSearchError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [activeTab, mapKeyword, mapLocation, selectedCnae, cnaeUf, cnaeCity])

  // ── Consultar CNPJ único ───────────────────────────────────────────────────
  const handleEnrichCnpj = useCallback(async () => {
    const clean = cnpjInput.replace(/\D/g, '')
    if (clean.length !== 14) { setCnpjError('CNPJ inválido — precisa ter 14 dígitos.'); return }
    setCnpjLoading(true)
    setCnpjError(null)
    setCnpjResult(null)
    try {
      const res  = await fetch(`/api/prospeccao/enrich-cnpj?cnpj=${clean}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setCnpjResult(data.data as CnpjEnrichmentResult)
    } catch (e) {
      setCnpjError((e as Error).message)
    } finally {
      setCnpjLoading(false)
    }
  }, [cnpjInput])

  // ── Importar lead individual ───────────────────────────────────────────────
  const handleImport = useCallback(async (item: SearchResult) => {
    setResults(prev => prev.map(r => r.placeId === item.placeId ? { ...r, importing: true } : r))
    try {
      const res  = await fetch('/api/prospeccao/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          leads: [{
            nomeCliente:    item.razaoSocial ?? item.name,
            telefone:       item.phoneNumber,
            empresaNome:    item.name,
            razaoSocial:    item.razaoSocial,
            cnpj:           item.cnpj,
            cnae:           item.cnaeCode,
            cnaeDescricao:  item.cnaeDescricao,
            porte:          item.porte,
            municipio:      item.municipio,
            uf:             item.uf,
            situacaoCadastral: item.situacao,
            googlePlaceId:  item.placeId,
            tenantId:       session.tenantId,
          }],
        }),
      })
      const data = await res.json()
      if (data.detail?.duplicateCnpjs?.length) {
        showToast(`${item.name} já existe no CRM.`, 'error')
      } else {
        setResults(prev => prev.map(r => r.placeId === item.placeId ? { ...r, imported: true, importing: false } : r))
        showToast(`✅ ${item.name} importado com sucesso!`)
      }
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`, 'error')
    } finally {
      setResults(prev => prev.map(r => r.placeId === item.placeId ? { ...r, importing: false } : r))
    }
  }, [session.tenantId])

  // ── Importar do modal de CNPJ ──────────────────────────────────────────────
  const handleImportCnpj = useCallback(async () => {
    if (!cnpjResult) return
    setLoading(true)
    try {
      const res  = await fetch('/api/prospeccao/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          leads: [{
            nomeCliente:    cnpjResult.razaoSocial ?? cnpjResult.nomeFantasia ?? 'Empresa',
            telefone:       cnpjResult.telefone,
            email:          cnpjResult.email,
            cnpj:           cnpjResult.cnpj,
            empresaNome:    cnpjResult.nomeFantasia ?? cnpjResult.razaoSocial,
            razaoSocial:    cnpjResult.razaoSocial,
            cnae:           cnpjResult.cnaeCode,
            cnaeDescricao:  cnpjResult.cnaeDescricao,
            porte:          cnpjResult.porte,
            logradouro:     cnpjResult.logradouro,
            numero:         cnpjResult.numero,
            bairro:         cnpjResult.bairro,
            municipio:      cnpjResult.municipio,
            uf:             cnpjResult.uf,
            cep:            cnpjResult.cep,
            situacaoCadastral: cnpjResult.situacao,
            qsa:            cnpjResult.qsa ? JSON.stringify(cnpjResult.qsa) : undefined,
            tenantId:       session.tenantId,
          }],
        }),
      })
      const data = await res.json()
      if (data.detail?.duplicateCnpjs?.length) {
        showToast('Este CNPJ já existe no CRM.', 'error')
      } else {
        showToast(`✅ ${cnpjResult.razaoSocial} importado com sucesso!`)
        setCnpjResult(null)
        setCnpjInput('')
      }
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [cnpjResult, session.tenantId])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">📡</span> Radar B2B — Prospecção Ativa
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Descubra empresas via Google Maps ou CNAE e importe direto para o CRM
          </p>
        </div>
        <Link
          href="/operacao"
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Ver CRM
        </Link>
      </div>

      {/* Cards de fonte de dados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: '🗺️', title: 'Google Maps',     desc: 'Busca geográfica por tipo de negócio', color: 'from-blue-50 to-blue-100 border-blue-200' },
          { icon: '🏛️', title: 'BrasilAPI/Receita', desc: 'Dados oficiais da Receita Federal', color: 'from-green-50 to-green-100 border-green-200' },
          { icon: '⚡', title: 'Import Instantâneo', desc: 'Lead criado com todos os dados preenchidos', color: 'from-purple-50 to-purple-100 border-purple-200' },
        ].map((c, i) => (
          <div key={i} className={`bg-gradient-to-br ${c.color} border rounded-xl p-4 flex items-center gap-3`}>
            <span className="text-3xl">{c.icon}</span>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{c.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{c.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Painel de busca */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { id: 'map',  label: '🗺️ Busca no Mapa',    desc: 'Google Places' },
            { id: 'cnae', label: '🏭 Filtro por CNAE',  desc: 'Por atividade econômica' },
            { id: 'cnpj', label: '🔍 Consultar CNPJ',   desc: 'Enriquecimento direto' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 px-4 py-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-green-500 text-green-700 bg-green-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div>{tab.label}</div>
              <div className="text-[10px] text-gray-400 mt-0.5 font-normal">{tab.desc}</div>
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ── Aba: Busca no Mapa ─────────────────────────────────────── */}
          {activeTab === 'map' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Termo de Busca
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
                    <input
                      type="text"
                      value={mapKeyword}
                      onChange={e => setMapKeyword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      placeholder='ex: "Transportadora", "Locadora de veículos"'
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['Transportadora de cargas', 'Locadora de veículos', 'Mineradora', 'Empresa de logística', 'Segurança patrimonial'].map(s => (
                      <button
                        key={s}
                        onClick={() => setMapKeyword(s)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          mapKeyword === s ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cidade / Estado
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">📍</span>
                    <input
                      type="text"
                      value={mapLocation}
                      onChange={e => setMapLocation(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      placeholder='ex: "São Paulo SP", "Belo Horizonte MG"'
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['São Paulo SP', 'Belo Horizonte MG', 'Curitiba PR', 'Manaus AM', 'Fortaleza CE'].map(l => (
                      <button
                        key={l}
                        onClick={() => setMapLocation(l)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          mapLocation === l ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={handleSearch}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                {loading ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Varrendo mapa...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>Varrer Mapa</>
                )}
              </button>
            </div>
          )}

          {/* ── Aba: Filtro por CNAE ───────────────────────────────────── */}
          {activeTab === 'cnae' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative">
                {/* ── CnaeCombobox ── */}
                <div className="sm:col-span-2" ref={cnaeDropRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Segmento / CNAE
                  </label>

                  {/* Trigger button */}
                  <button
                    type="button"
                    onClick={() => { setCnaeDropOpen(o => !o); setCnaeSearch('') }}
                    className="w-full flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white hover:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors text-left"
                  >
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-base flex-shrink-0">{selectedCnaeGrupo.split(' ')[0]}</span>
                      <span className="truncate text-gray-800">{selectedCnaeLabel}</span>
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${cnaeDropOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>

                  {/* Dropdown */}
                  {cnaeDropOpen && (
                    <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-xl overflow-hidden"
                      style={{ maxHeight: '420px' }}
                    >
                      {/* Search input */}
                      <div className="p-3 border-b border-gray-100 sticky top-0 bg-white">
                        <div className="relative">
                          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                          </svg>
                          <input
                            autoFocus
                            type="text"
                            value={cnaeSearch}
                            onChange={e => setCnaeSearch(e.target.value)}
                            placeholder="Buscar: transportadora, mineração, engenharia, rastreamento..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          {cnaeSearch && (
                            <button onClick={() => setCnaeSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5">
                          {filteredCnaes.length} CNAEs encontrados
                          {cnaeSearch ? ` para "${cnaeSearch}"` : ''}
                        </p>
                      </div>

                      {/* Results list */}
                      <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
                        {filteredCnaes.length === 0 ? (
                          <div className="p-6 text-center">
                            <p className="text-sm text-gray-500">Nenhum CNAE encontrado</p>
                            <p className="text-xs text-gray-400 mt-1">Tente: "transporte", "segurança", "construção"</p>
                          </div>
                        ) : (
                          (() => {
                            const gruposSet = new Set(filteredCnaes.map(c => c.grupo))
                            const grupos: string[] = []
                            gruposSet.forEach(g => grupos.push(g))
                            return grupos.map(grupo => (
                              <div key={grupo}>
                                <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{grupo}</p>
                                </div>
                                {filteredCnaes.filter(c => c.grupo === grupo).map(c => (
                                  <button
                                    key={c.code}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCnae(c.code)
                                      setCnaeDropOpen(false)
                                      setCnaeSearch('')
                                    }}
                                    className={`w-full text-left px-4 py-2.5 hover:bg-green-50 transition-colors flex items-start gap-3 ${
                                      selectedCnae === c.code ? 'bg-green-50 border-l-2 border-green-500' : ''
                                    }`}
                                  >
                                    <span className="font-mono text-xs text-gray-400 flex-shrink-0 mt-0.5 w-20">{c.code}</span>
                                    <span className="text-sm text-gray-800 leading-tight flex-1">
                                      {c.label.split('—').slice(1).join('—').trim()}
                                    </span>
                                    {selectedCnae === c.code && (
                                      <svg className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                                      </svg>
                                    )}
                                  </button>
                                ))}
                              </div>
                            ))
                          })()
                        )}
                      </div>
                    </div>
                  )}

                  {/* Selected info badge */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                      {selectedCnaeGrupo}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">{selectedCnae}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
                  <select
                    value={cnaeUf}
                    onChange={e => setCnaeUf(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  >
                    {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
              <div className="max-w-sm">
                <label className="block text-sm font-medium text-gray-700 mb-1">Cidade (opcional)</label>
                <input
                  type="text"
                  value={cnaeCity}
                  onChange={e => setCnaeCity(e.target.value)}
                  placeholder='ex: "Campinas"'
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                {loading ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Buscando...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>Buscar por CNAE</>
                )}
              </button>
            </div>
          )}

          {/* ── Aba: Consultar CNPJ ─────────────────────────────────────── */}
          {activeTab === 'cnpj' && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CNPJ da Empresa
                </label>
                <div className="flex gap-2 max-w-md">
                  <input
                    type="text"
                    value={cnpjInput}
                    onChange={e => {
                      // Formata enquanto digita: 00.000.000/0000-00
                      const v = e.target.value.replace(/\D/g, '').slice(0, 14)
                      const f = v
                        .replace(/^(\d{2})(\d)/, '$1.$2')
                        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
                        .replace(/\.(\d{3})(\d)/, '.$1/$2')
                        .replace(/(\d{4})(\d)/, '$1-$2')
                      setCnpjInput(f)
                      setCnpjResult(null)
                      setCnpjError(null)
                    }}
                    onKeyDown={e => e.key === 'Enter' && handleEnrichCnpj()}
                    placeholder='00.000.000/0000-00'
                    className="flex-1 border border-gray-300 rounded-l-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={handleEnrichCnpj}
                    disabled={cnpjLoading || cnpjInput.replace(/\D/g,'').length !== 14}
                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-r-lg text-sm font-semibold transition-colors"
                  >
                    {cnpjLoading ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    )}
                    {cnpjLoading ? 'Consultando...' : 'Consultar Receita'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Dados via BrasilAPI + ReceitaWS (Receita Federal)</p>
              </div>

              {cnpjError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex gap-2">
                  <span>⚠️</span> {cnpjError}
                </div>
              )}

              {/* Resultado do CNPJ */}
              {cnpjResult && (
                <div className="bg-gradient-to-br from-gray-50 to-green-50 border border-green-200 rounded-2xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-gray-900">{cnpjResult.razaoSocial}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          cnpjResult.situacao === 'ATIVA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>{cnpjResult.situacao ?? '—'}</span>
                      </div>
                      {cnpjResult.nomeFantasia && cnpjResult.nomeFantasia !== cnpjResult.razaoSocial && (
                        <p className="text-sm text-gray-500 italic">Nome Fantasia: {cnpjResult.nomeFantasia}</p>
                      )}
                      <p className="text-xs text-gray-400 font-mono mt-1">
                        CNPJ: {cnpjResult.cnpj?.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}
                        {cnpjResult.source && <span className="ml-2 text-blue-500">via {cnpjResult.source}</span>}
                      </p>
                    </div>
                    <button
                      onClick={handleImportCnpj}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Importar para CRM
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    {[
                      { label: 'CNAE', value: cnpjResult.cnaeDescricao ? `${cnpjResult.cnaeCode} — ${cnpjResult.cnaeDescricao}` : cnpjResult.cnaeCode },
                      { label: 'Porte', value: cnpjResult.porte },
                      { label: 'Telefone', value: cnpjResult.telefone },
                      { label: 'E-mail', value: cnpjResult.email },
                      { label: 'Abertura', value: cnpjResult.abertura },
                      { label: 'Natureza Jurídica', value: cnpjResult.naturezaJuridica },
                    ].map((f, i) => f.value ? (
                      <div key={i} className="bg-white rounded-lg p-3 border border-gray-100">
                        <p className="text-xs text-gray-400 font-medium">{f.label}</p>
                        <p className="text-sm text-gray-800 font-semibold mt-0.5 break-all">{f.value}</p>
                      </div>
                    ) : null)}
                  </div>
                  {/* Endereço */}
                  {cnpjResult.logradouro && (
                    <div className="mt-3 bg-white rounded-lg p-3 border border-gray-100 text-sm">
                      <p className="text-xs text-gray-400 font-medium mb-1">📍 Endereço</p>
                      <p className="text-gray-700">
                        {[cnpjResult.logradouro, cnpjResult.numero, cnpjResult.complemento, cnpjResult.bairro].filter(Boolean).join(', ')}
                      </p>
                      <p className="text-gray-500">{cnpjResult.municipio} — {cnpjResult.uf} · CEP {cnpjResult.cep?.replace(/(\d{5})(\d{3})/, '$1-$2')}</p>
                    </div>
                  )}
                  {/* QSA */}
                  {cnpjResult.qsa && cnpjResult.qsa.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 font-semibold mb-2">👥 Quadro Societário (QSA)</p>
                      <div className="flex flex-wrap gap-2">
                        {cnpjResult.qsa.map((s, i) => (
                          <div key={i} className="bg-white border border-gray-100 rounded-lg px-3 py-1.5 text-xs">
                            <span className="font-medium text-gray-800">{s.nome}</span>
                            <span className="text-gray-400 ml-1">· {s.qualificacao}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Erro de busca */}
      {searchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl text-sm flex gap-2">
          <span>⚠️</span> {searchError}
        </div>
      )}

      {/* ── Tabela de resultados ────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {/* Cabeçalho da tabela */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <div>
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <span>📋</span>
                Resultados da Varredura
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {searchMeta?.total ?? results.length}
                </span>
              </h2>
              {searchMeta && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Busca: <strong>{searchMeta.keyword}</strong> em <strong>{searchMeta.location}</strong>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {results.filter(r => r.imported).length} importados
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome / Razão Social</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">CNAE / Categoria</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Localização</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contatos</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Avaliação</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((item) => (
                  <tr key={item.placeId} className={`hover:bg-gray-50 transition-colors ${item.imported ? 'bg-green-50/50' : ''}`}>
                    {/* Nome */}
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-white text-xs font-bold">{item.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 leading-tight">{item.name}</p>
                          {item.razaoSocial && item.razaoSocial !== item.name && (
                            <p className="text-xs text-gray-400 mt-0.5">{item.razaoSocial}</p>
                          )}
                          {item.cnpj && (
                            <p className="text-xs text-gray-300 font-mono mt-0.5">{item.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* CNAE */}
                    <td className="px-4 py-4">
                      {item.cnaeCode ? (
                        <div>
                          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-mono px-2 py-0.5 rounded-md">{item.cnaeCode}</span>
                          <p className="text-xs text-gray-500 mt-1 max-w-[160px] leading-tight">{item.cnaeDescricao}</p>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(item.types ?? []).slice(0, 2).map(t => (
                            <span key={t} className="inline-block bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-md">{t.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Localização */}
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-1.5 text-xs text-gray-600 max-w-[200px]">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="leading-tight">{item.formattedAddress}</span>
                      </div>
                    </td>

                    {/* Contatos */}
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        {item.phoneNumber ? (
                          <a href={`tel:${item.phoneNumber}`} className="flex items-center gap-1.5 text-xs text-green-600 hover:underline">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {item.phoneNumber}
                          </a>
                        ) : (
                          <span className="text-xs text-gray-300 italic">sem telefone</span>
                        )}
                        {item.website && (
                          <a href={item.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline truncate max-w-[140px]">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                            Site
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Avaliação */}
                    <td className="px-4 py-4 text-center">
                      {item.rating ? (
                        <div>
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-yellow-400">★</span>
                            <span className="font-bold text-gray-700">{item.rating.toFixed(1)}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">{item.userRatingsTotal} avaliações</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Ação */}
                    <td className="px-4 py-4 text-right">
                      {item.imported ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-xl text-xs font-semibold">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Importado
                        </span>
                      ) : (
                        <button
                          onClick={() => handleImport(item)}
                          disabled={item.importing}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-xl text-xs font-bold transition-colors shadow-sm whitespace-nowrap"
                        >
                          {item.importing ? (
                            <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Importando...</>
                          ) : (
                            <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>+ Importar para CRM</>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer da tabela */}
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {results.filter(r => r.imported).length} de {results.length} importados
            </p>
            <button
              onClick={() => {
                const notImported = results.filter(r => !r.imported && !r.importing)
                notImported.forEach(item => handleImport(item))
              }}
              className="text-xs text-green-600 hover:text-green-700 font-semibold flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar todos ({results.filter(r => !r.imported).length})
            </button>
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {!loading && results.length === 0 && activeTab !== 'cnpj' && (
        <div className="bg-white rounded-2xl border border-gray-200 px-8 py-16 text-center">
          <div className="text-6xl mb-4">📡</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Pronto para varrer</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Configure os filtros acima e clique em <strong>Varrer Mapa</strong> ou <strong>Buscar por CNAE</strong> para descobrir empresas no seu nicho.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {['Transportadora SP', 'Locadora MG', 'Mineradora PA', 'Segurança RS'].map(s => (
              <button
                key={s}
                onClick={() => {
                  const [kw, uf] = s.split(' ')
                  setMapKeyword(kw + ' de veículos')
                  setMapLocation(uf)
                  setActiveTab('map')
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
              >
                🔍 {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal de detalhe */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailItem(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{detailItem.name}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{detailItem.formattedAddress}</p>
              </div>
              <button onClick={() => setDetailItem(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {detailItem.phoneNumber && (
              <p className="text-sm"><span className="text-gray-500">Telefone:</span> <strong>{detailItem.phoneNumber}</strong></p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { handleImport(detailItem); setDetailItem(null) }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                Importar para CRM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

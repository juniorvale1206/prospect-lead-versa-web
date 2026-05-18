/**
 * GET /api/admin/veiculo/placa/[placa]
 *
 * Consulta dados do veículo pela placa.
 * Estratégia em cascata:
 *   1. SINESP via sinesp-api (apicarros.com)      — dados completos + situação roubo/furto
 *   2. Consulta direta SINESP Cidadão (HTTP POST) — fallback se apicarros estiver protegido
 *   3. Resposta graceful OFFLINE                  — placa válida, dados manuais
 *
 * Resposta normalizada:
 *   { source, found, placa, marca?, modelo?, ano?, cor?, chassi?,
 *     uf?, municipio?, situacao?, codigoSituacao?, vehicleType?, message? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// ─── Normalizar / Validar placa ───────────────────────────────────────────────
function normalizePlate(raw: string): string {
  return raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8)
}
function isValidPlate(p: string): boolean {
  return /^[A-Z]{3}[0-9]{4}$/.test(p) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p)
}

// ─── Cor SINESP → PT-BR ───────────────────────────────────────────────────────
function parseColor(cor?: string): string | undefined {
  if (!cor) return undefined
  const map: Record<string, string> = {
    BRANCA: 'Branca', PRETA: 'Preta', CINZA: 'Cinza', PRATA: 'Prata',
    VERMELHA: 'Vermelha', AZUL: 'Azul', VERDE: 'Verde', AMARELA: 'Amarela',
    BEGE: 'Bege', MARROM: 'Marrom', LARANJA: 'Laranja', ROXO: 'Roxo',
  }
  return map[cor.toUpperCase()] ?? cor
}

// ─── Tipo de veículo pelo modelo ──────────────────────────────────────────────
function inferVehicleType(modelo?: string): string {
  if (!modelo) return 'CARRO'
  const m = modelo.toUpperCase()
  if (/CAMINHAO|TRUCK|CARGO|CONSTELLATION|ACTROS|FH\s|VM\s|AXOR/.test(m)) return 'CAMINHAO'
  if (/ONIBUS|BUS|COMIL|MARCOPOLO|BUSSCAR|NEOBUS/.test(m))               return 'ONIBUS'
  if (/\bMOTO\b|CG\s|CB\s|XRE|TITAN|FAN\s|BIZ|FAZER|LANDER|TENERE|HORNET|BROS/.test(m)) return 'MOTO'
  if (/TRATOR|COLHEITADEIRA|PULVERIZADOR|PLANTADEIRA|RETROESCAVADEIRA/.test(m)) return 'MAQUINA_AGRICOLA'
  return 'CARRO'
}

// ─── Separar marca/modelo do campo concatenado SINESP (ex: "FIAT/UNO MILLE") ──
function splitMarcaModelo(raw: string): { marca: string; modelo: string } {
  const idx = raw.indexOf('/')
  if (idx === -1) return { marca: '', modelo: raw.trim() }
  return {
    marca:  raw.slice(0, idx).trim(),
    modelo: raw.slice(idx + 1).trim(),
  }
}

// ─── Tentativa 1: sinesp-api (apicarros.com) ─────────────────────────────────
async function trySinespApi(plate: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sinespApi = require('sinesp-api')
    const data = await sinespApi.search(plate) as Record<string, string>
    if (data?.codigoRetorno === '0') return data
    return null
  } catch {
    return null
  }
}

// ─── Tentativa 2: SINESP Cidadão HTTP direto ─────────────────────────────────
// Protocolo reverso do app mobile: POST para servicos.sinesp.gov.br
async function trySinespDirect(plate: string) {
  try {
    const url = 'https://cidadao.sinesp.gov.br/sinesp-cidadao/mobile/consultar-placa'
    const body = JSON.stringify({ placa: plate })
    const res  = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'User-Agent':   'SinespCidadao/5.4.0 (Android)',
        'Accept':       'application/json',
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json() as Record<string, string>
    // retorno: { codigoSituacao, situacao, modelo, marca, cor, ano, anoModelo, placa, uf, municipio, chassi, ... }
    if (data?.situacao) return data
    return null
  } catch {
    return null
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { placa: string } },
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const plate = normalizePlate(params.placa)

  if (!isValidPlate(plate)) {
    return NextResponse.json(
      { error: `Placa "${plate}" inválida. Use ABC1234 (antigo) ou ABC1D23 (Mercosul).` },
      { status: 400 },
    )
  }

  // ── Fonte 1: sinesp-api ───────────────────────────────────────────────────
  let raw = await trySinespApi(plate)

  // ── Fonte 2: SINESP Cidadão direto ────────────────────────────────────────
  if (!raw) {
    raw = await trySinespDirect(plate)
  }

  if (raw) {
    const modeloRaw = raw.modelo ?? raw.marca ?? ''
    const { marca, modelo } = splitMarcaModelo(modeloRaw)
    const anoVal = parseInt(raw.anoModelo ?? raw.ano ?? '0') || undefined

    // codigoSituacao: "0" = sem restrição, "1" = roubo/furto
    const codigoSituacao = raw.codigoSituacao ?? raw.codigoRetorno ?? '0'

    return NextResponse.json({
      source:         'SINESP',
      found:          true,
      placa:          plate,
      marca:          marca  || undefined,
      modelo:         modelo || undefined,
      ano:            anoVal,
      cor:            parseColor(raw.cor),
      chassi:         raw.chassi   || undefined,
      uf:             raw.uf       || undefined,
      municipio:      raw.municipio || undefined,
      situacao:       raw.situacao ?? 'Sem restrição',
      codigoSituacao,
      vehicleType:    inferVehicleType(modelo || modeloRaw),
      updatedAt:      raw.data || new Date().toISOString(),
    })
  }

  // ── Fallback graceful ─────────────────────────────────────────────────────
  return NextResponse.json({
    source:  'OFFLINE',
    found:   false,
    placa:   plate,
    message: 'Serviço SINESP indisponível no momento. Preencha marca, modelo e ano manualmente.',
  })
}

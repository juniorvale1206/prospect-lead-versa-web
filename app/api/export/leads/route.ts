/**
 * GET /api/export/leads
 * ─────────────────────────────────────────────────────────────────────────────
 * Exporta leads em formato Excel (.xlsx) com planilha principal estruturada,
 * cabeçalhos destacados, larguras de coluna otimizadas e aba de sumário.
 *
 * Query params:
 *   ?tenantId=xxx          → filtro por franquia  (só ADMIN_MASTER)
 *   ?leadType=B2C|B2B|all  (default: all)
 *   ?funnelStage=...       (default: all)
 *   ?status=...            (default: all)
 *   ?from=YYYY-MM-DD  &to=YYYY-MM-DD
 */

import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getSession } from '@/lib/auth'
import { prisma }      from '@/lib/prisma'

// ─── Labels traduzidos ────────────────────────────────────────────────────────
const FUNNEL_LABELS: Record<string, string> = {
  LEAD_COLETADO:     'Lead Coletado',
  IA_EM_ATENDIMENTO: 'IA em Atendimento',
  REUNIAO_AGENDADA:  'Reunião Agendada',
  CONVERTIDO:        'Convertido / Venda Fechada',
}

const STATUS_LABELS: Record<string, string> = {
  PENDENTE_AUDITORIA: 'Pendente',
  AUDITADO_APROVADO:  'Aprovado',
  AUDITADO_REJEITADO: 'Rejeitado',
}

const LEAD_TYPE_LABELS: Record<string, string> = {
  B2C: 'B2C — Pessoa Física',
  B2B: 'B2B — Empresa',
}

// ─── Formatar data para pt-BR ─────────────────────────────────────────────────
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function fmtDateShort(d: Date | string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

// ─── Estilo de célula de cabeçalho (linha 1 — título do relatório) ────────────
function headerTitleStyle() {
  return {
    font:      { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
    fill:      { fgColor: { rgb: '1E3A5F' } },  // azul escuro ProspecLead
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: borderThin(),
  }
}

// ─── Estilo coluna-grupo (ex: "DADOS DO CLIENTE") ────────────────────────────
function groupHeaderStyle(rgb: string) {
  return {
    font:      { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill:      { fgColor: { rgb } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: borderThin(),
  }
}

// ─── Estilo campo de coluna (linha 3) ─────────────────────────────────────────
function colHeaderStyle(rgb: string) {
  return {
    font:      { bold: true, sz: 9, color: { rgb: '1E3A5F' } },
    fill:      { fgColor: { rgb } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: borderThin(),
  }
}

// ─── Estilo de célula de dados normal ────────────────────────────────────────
function dataStyle(bgRgb = 'FFFFFF') {
  return {
    font:      { sz: 9 },
    fill:      { fgColor: { rgb: bgRgb } },
    alignment: { vertical: 'center', wrapText: true },
    border: borderThin(),
  }
}

// ─── Estilo de dado zebrado (linhas ímpares) ──────────────────────────────────
function dataStyleZebra() { return dataStyle('F0F4FA') }

// ─── Badge status (colorido) ──────────────────────────────────────────────────
function statusStyle(status: string, zebra: boolean) {
  const colors: Record<string, { bg: string; font: string }> = {
    'Pendente':  { bg: 'FFF3CD', font: '856404' },
    'Aprovado':  { bg: 'D4EDDA', font: '155724' },
    'Rejeitado': { bg: 'F8D7DA', font: '721C24' },
  }
  const c = colors[status] ?? { bg: zebra ? 'F0F4FA' : 'FFFFFF', font: '000000' }
  return {
    font:      { sz: 9, bold: true, color: { rgb: c.font } },
    fill:      { fgColor: { rgb: c.bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: borderThin(),
  }
}

// ─── Badge funil ──────────────────────────────────────────────────────────────
function funnelStyle(stage: string, zebra: boolean) {
  const colors: Record<string, { bg: string; font: string }> = {
    'Lead Coletado':             { bg: 'E3F2FD', font: '0D47A1' },
    'IA em Atendimento':         { bg: 'EDE7F6', font: '4527A0' },
    'Reunião Agendada':          { bg: 'FFF8E1', font: 'F57F17' },
    'Convertido / Venda Fechada':{ bg: 'E8F5E9', font: '1B5E20' },
  }
  const c = colors[stage] ?? { bg: zebra ? 'F0F4FA' : 'FFFFFF', font: '000000' }
  return {
    font:      { sz: 9, bold: true, color: { rgb: c.font } },
    fill:      { fgColor: { rgb: c.bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: borderThin(),
  }
}

// ─── Badge tipo B2C / B2B ─────────────────────────────────────────────────────
function leadTypeStyle(tipo: string, zebra: boolean) {
  const colors: Record<string, { bg: string; font: string }> = {
    'B2C — Pessoa Física': { bg: 'E8EAF6', font: '283593' },
    'B2B — Empresa':       { bg: 'E0F2F1', font: '004D40' },
  }
  const c = colors[tipo] ?? { bg: zebra ? 'F0F4FA' : 'FFFFFF', font: '000000' }
  return {
    font:      { sz: 9, bold: true, color: { rgb: c.font } },
    fill:      { fgColor: { rgb: c.bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: borderThin(),
  }
}

// ─── Valor monetário (verde) ──────────────────────────────────────────────────
function moneyStyle(zebra: boolean) {
  return {
    font:      { sz: 9, bold: true, color: { rgb: '155724' } },
    fill:      { fgColor: { rgb: zebra ? 'D4EDDA' : 'E8F5E9' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: borderThin(),
    numFmt: 'R$ #,##0.00',
  }
}

// ─── Borda fina padrão ────────────────────────────────────────────────────────
function borderThin() {
  const side = { style: 'thin', color: { rgb: 'BDC3C7' } }
  return { top: side, bottom: side, left: side, right: side }
}

// ─── Helpers de endereço de célula ────────────────────────────────────────────
function colLetter(idx: number): string {
  let s = ''
  idx++ // 1-based
  while (idx > 0) {
    idx--
    s = String.fromCharCode(65 + (idx % 26)) + s
    idx = Math.floor(idx / 26)
  }
  return s
}

function addr(col: number, row: number): string {
  return `${colLetter(col)}${row}`
}

// ─── Aplicar estilo em um range completo ─────────────────────────────────────
function styleRange(
  ws: XLSX.WorkSheet,
  c1: number, r1: number,
  c2: number, r2: number,
  style: object,
) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const a = addr(c, r)
      if (!ws[a]) ws[a] = { v: '', t: 's' }
      ws[a].s = style
    }
  }
}

// ─── Definição das colunas da planilha ────────────────────────────────────────
// Cada coluna: { header, key, width, group, groupColor, headerColor }
interface ColDef {
  header:      string
  key:         string
  width:       number
  group:       string
  groupColor:  string   // cor do grupo (row 2)
  headerColor: string   // cor do cabeçalho de campo (row 3)
  align?:      'left' | 'center' | 'right'
}

const COLUMNS: ColDef[] = [
  // ── Identificação ─────────────────────────────────────────────────────────
  { header: '#',              key: 'seq',          width: 5,  group: 'IDENTIFICAÇÃO',  groupColor: '1E3A5F', headerColor: 'D6E4F0', align: 'center' },
  { header: 'ID do Lead',     key: 'id',           width: 28, group: 'IDENTIFICAÇÃO',  groupColor: '1E3A5F', headerColor: 'D6E4F0' },
  { header: 'Tipo',           key: 'leadType',     width: 20, group: 'IDENTIFICAÇÃO',  groupColor: '1E3A5F', headerColor: 'D6E4F0', align: 'center' },
  { header: 'Franquia',       key: 'tenant',       width: 16, group: 'IDENTIFICAÇÃO',  groupColor: '1E3A5F', headerColor: 'D6E4F0', align: 'center' },
  { header: 'Estágio do Funil', key: 'funnelStage', width: 26, group: 'IDENTIFICAÇÃO', groupColor: '1E3A5F', headerColor: 'D6E4F0', align: 'center' },
  { header: 'Status Auditoria', key: 'status',     width: 16, group: 'IDENTIFICAÇÃO',  groupColor: '1E3A5F', headerColor: 'D6E4F0', align: 'center' },

  // ── Dados do Cliente ──────────────────────────────────────────────────────
  { header: 'Nome do Cliente',  key: 'nomeCliente',  width: 30, group: 'DADOS DO CLIENTE', groupColor: '2471A3', headerColor: 'D6EAF8' },
  { header: 'WhatsApp / Tel.',  key: 'telefone',     width: 20, group: 'DADOS DO CLIENTE', groupColor: '2471A3', headerColor: 'D6EAF8', align: 'center' },
  { header: 'E-mail',           key: 'email',        width: 30, group: 'DADOS DO CLIENTE', groupColor: '2471A3', headerColor: 'D6EAF8' },

  // ── B2C: Veículo ──────────────────────────────────────────────────────────
  { header: 'Veículo / Modelo', key: 'veiculo',   width: 30, group: 'B2C — VEÍCULO', groupColor: '1A5276', headerColor: 'D5D8DC' },
  { header: 'Placa',            key: 'placa',     width: 12, group: 'B2C — VEÍCULO', groupColor: '1A5276', headerColor: 'D5D8DC', align: 'center' },
  { header: 'Praça / Cidade',   key: 'praca',     width: 24, group: 'B2C — VEÍCULO', groupColor: '1A5276', headerColor: 'D5D8DC' },
  { header: 'Foto da Placa',    key: 'fotoPlaca', width: 12, group: 'B2C — VEÍCULO', groupColor: '1A5276', headerColor: 'D5D8DC', align: 'center' },

  // ── B2B: Empresa ──────────────────────────────────────────────────────────
  { header: 'Empresa / Razão Social', key: 'empresaNome', width: 30, group: 'B2B — EMPRESA', groupColor: '117A65', headerColor: 'D1F2EB' },
  { header: 'CNPJ',                   key: 'cnpj',        width: 20, group: 'B2B — EMPRESA', groupColor: '117A65', headerColor: 'D1F2EB', align: 'center' },
  { header: 'Tamanho da Frota',       key: 'frota',       width: 24, group: 'B2B — EMPRESA', groupColor: '117A65', headerColor: 'D1F2EB' },
  { header: 'Segmento',               key: 'segmento',    width: 22, group: 'B2B — EMPRESA', groupColor: '117A65', headerColor: 'D1F2EB' },

  // ── Qualificação ──────────────────────────────────────────────────────────
  { header: 'Dores Identificadas', key: 'dores', width: 40, group: 'QUALIFICAÇÃO', groupColor: '6C3483', headerColor: 'E8DAEF' },

  // ── Comissionamento ───────────────────────────────────────────────────────
  { header: 'Comissão (R$)',       key: 'comissao',       width: 16, group: 'COMISSIONAMENTO', groupColor: '1E8449', headerColor: 'D5F5E3', align: 'right' },
  { header: 'Motivo Rejeição',     key: 'motivoRejeicao', width: 30, group: 'COMISSIONAMENTO', groupColor: '1E8449', headerColor: 'D5F5E3' },

  // ── Promotor ──────────────────────────────────────────────────────────────
  { header: 'Nome do Promotor',  key: 'promotorNome',  width: 24, group: 'PROMOTOR / CAPTURA', groupColor: '784212', headerColor: 'FAD7A0' },
  { header: 'E-mail Promotor',   key: 'promotorEmail', width: 30, group: 'PROMOTOR / CAPTURA', groupColor: '784212', headerColor: 'FAD7A0' },
  { header: 'ID Promotor',       key: 'promotorId',    width: 28, group: 'PROMOTOR / CAPTURA', groupColor: '784212', headerColor: 'FAD7A0' },

  // ── Datas ─────────────────────────────────────────────────────────────────
  { header: 'Data de Criação',       key: 'createdAt',    width: 20, group: 'DATAS', groupColor: '566573', headerColor: 'D7DBDD', align: 'center' },
  { header: 'Última Atualização',    key: 'updatedAt',    width: 20, group: 'DATAS', groupColor: '566573', headerColor: 'D7DBDD', align: 'center' },
  { header: 'Data de Auditoria',     key: 'auditadoEm',   width: 20, group: 'DATAS', groupColor: '566573', headerColor: 'D7DBDD', align: 'center' },
]

// ─── Montar grupos de colunas para merge de cabeçalho ────────────────────────
interface GroupRange { label: string; color: string; start: number; end: number }

function buildGroups(): GroupRange[] {
  const groups: GroupRange[] = []
  let i = 0
  while (i < COLUMNS.length) {
    const grp = COLUMNS[i].group
    const col = COLUMNS[i].groupColor
    let j = i
    while (j < COLUMNS.length && COLUMNS[j].group === grp) j++
    groups.push({ label: grp, color: col, start: i, end: j - 1 })
    i = j
  }
  return groups
}

// ─── Principal ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { role, tenantId: sessionTenantId } = session
  if (!['ADMIN_MASTER', 'FINANCIAL', 'MANAGER'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // ── Filtros ─────────────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url)
  const qTenant    = searchParams.get('tenantId')
  const qLeadType  = searchParams.get('leadType')    ?? 'all'
  const qStage     = searchParams.get('funnelStage') ?? 'all'
  const qStatus    = searchParams.get('status')      ?? 'all'
  const qFrom      = searchParams.get('from')
  const qTo        = searchParams.get('to')

  // Multi-tenant
  let tenantFilter: string | null | undefined
  if (role === 'MANAGER' || role === 'FINANCIAL') {
    tenantFilter = sessionTenantId ?? undefined
  } else {
    tenantFilter = qTenant ?? undefined
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {}
  if (tenantFilter !== undefined) where.tenantId = tenantFilter || null
  if (qLeadType !== 'all') where.leadType    = qLeadType
  if (qStage    !== 'all') where.funnelStage = qStage
  if (qStatus   !== 'all') where.status      = qStatus
  if (qFrom || qTo) {
    where.createdAt = {}
    if (qFrom) where.createdAt.gte = new Date(qFrom)
    if (qTo)   where.createdAt.lte = new Date(qTo + 'T23:59:59.999Z')
  }

  // ── Query ────────────────────────────────────────────────────────────────
  const leads = await prisma.lead.findMany({
    where,
    include: {
      tenant:   { select: { id: true, nome: true } },
      promotor: { select: { id: true, nome: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // ── Montar workbook ──────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new()

  // ══════════════════════════════════════════════════════════════════════════
  // ABA 1 — LEADS (tabela principal)
  // ══════════════════════════════════════════════════════════════════════════
  const ws: XLSX.WorkSheet = {}
  const TOTAL_COLS = COLUMNS.length
  const DATA_START_ROW = 4  // row 1=título, row 2=grupos, row 3=campos, row 4+=dados

  // ── Título do relatório (row 1) ────────────────────────────────────────
  const exportDate  = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const tenantLabel = tenantFilter
    ? (leads[0]?.tenant?.nome ?? tenantFilter)
    : 'Todas as Franquias'

  ws['A1'] = {
    v: `ProspecLead — Relatório de Leads  |  Exportado em: ${exportDate}  |  Franquia: ${tenantLabel}  |  Total: ${leads.length} registros`,
    t: 's',
    s: headerTitleStyle(),
  }

  // Merge título across all columns
  if (!ws['!merges']) ws['!merges'] = []
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: TOTAL_COLS - 1 } })

  // ── Cabeçalhos de grupo (row 2) ───────────────────────────────────────
  const groups = buildGroups()
  for (const g of groups) {
    const cellAddr = addr(g.start, 2)
    ws[cellAddr] = { v: g.label, t: 's', s: groupHeaderStyle(g.color) }
    if (g.end > g.start) {
      ws['!merges'].push({ s: { r: 1, c: g.start }, e: { r: 1, c: g.end } })
      // preencher células mescladas
      for (let c = g.start + 1; c <= g.end; c++) {
        ws[addr(c, 2)] = { v: '', t: 's', s: groupHeaderStyle(g.color) }
      }
    }
  }

  // ── Cabeçalhos de campo (row 3) ───────────────────────────────────────
  for (let ci = 0; ci < COLUMNS.length; ci++) {
    const col = COLUMNS[ci]
    ws[addr(ci, 3)] = {
      v: col.header,
      t: 's',
      s: colHeaderStyle(col.headerColor),
    }
  }

  // ── Dados (row 4 em diante) ───────────────────────────────────────────
  for (let li = 0; li < leads.length; li++) {
    const l    = leads[li]
    const row  = DATA_START_ROW + li
    const zebra = li % 2 === 1

    // Pré-processar valores
    const tipoLabel    = LEAD_TYPE_LABELS[l.leadType]   ?? l.leadType
    const funnelLabel  = FUNNEL_LABELS[l.funnelStage]   ?? l.funnelStage
    const statusLabel  = STATUS_LABELS[l.status]         ?? l.status
    const temFoto      = l.platePhotoUrl ? 'Sim ✓' : 'Não'

    // Mapa de valores por key
    const vals: Record<string, { v: unknown; t: string; s: object; numFmt?: string }> = {
      seq:          { v: li + 1,              t: 'n', s: { ...dataStyle(zebra ? 'EBF5FB' : 'D6EAF8'), font: { bold: true, sz: 9, color: { rgb: '1E3A5F' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin() } },
      id:           { v: l.id,               t: 's', s: { ...dataStyle(zebra ? 'F0F4FA' : 'FFFFFF'), font: { sz: 7, color: { rgb: '7F8C8D' } }, alignment: { vertical: 'center' }, border: borderThin() } },
      leadType:     { v: tipoLabel,           t: 's', s: leadTypeStyle(tipoLabel, zebra) },
      tenant:       { v: l.tenant?.nome ?? '—', t: 's', s: { ...dataStyle(zebra ? 'F0F4FA' : 'FFFFFF'), alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin() } },
      funnelStage:  { v: funnelLabel,         t: 's', s: funnelStyle(funnelLabel, zebra) },
      status:       { v: statusLabel,         t: 's', s: statusStyle(statusLabel, zebra) },

      nomeCliente:  { v: l.nomeCliente,       t: 's', s: { ...dataStyle(zebra ? 'F0F4FA' : 'FFFFFF'), font: { bold: true, sz: 9 }, border: borderThin() } },
      telefone:     { v: l.telefone ?? '—',   t: 's', s: { ...dataStyle(zebra ? 'F0F4FA' : 'FFFFFF'), alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin() } },
      email:        { v: l.email ?? '—',      t: 's', s: dataStyle(zebra ? 'F0F4FA' : 'FFFFFF') },

      veiculo:      { v: l.veiculo || '—',    t: 's', s: dataStyle(zebra ? 'EAECEE' : 'F8F9FA') },
      placa:        { v: l.placa || '—',      t: 's', s: { ...dataStyle(zebra ? 'EAECEE' : 'F8F9FA'), font: { bold: true, sz: 10, color: { rgb: l.placa ? '1A5276' : '7F8C8D' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin() } },
      praca:        { v: l.praca || '—',      t: 's', s: dataStyle(zebra ? 'EAECEE' : 'F8F9FA') },
      fotoPlaca:    { v: temFoto,             t: 's', s: { ...dataStyle(zebra ? 'EAECEE' : 'F8F9FA'), font: { bold: !!l.platePhotoUrl, sz: 9, color: { rgb: l.platePhotoUrl ? '1E8449' : '7F8C8D' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin() } },

      empresaNome:  { v: l.empresaNome || '—',t: 's', s: dataStyle(zebra ? 'E8F8F5' : 'F0FBF8') },
      cnpj:         { v: l.cnpj || '—',       t: 's', s: { ...dataStyle(zebra ? 'E8F8F5' : 'F0FBF8'), alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin() } },
      frota:        { v: l.frota || '—',       t: 's', s: dataStyle(zebra ? 'E8F8F5' : 'F0FBF8') },
      segmento:     { v: l.segmento || '—',    t: 's', s: dataStyle(zebra ? 'E8F8F5' : 'F0FBF8') },

      dores:        { v: l.doresIdentificadas || '—', t: 's', s: { ...dataStyle(zebra ? 'F5EEF8' : 'FAF5FF'), alignment: { vertical: 'top', wrapText: true }, border: borderThin() } },

      comissao:     { v: l.commissionValue,   t: 'n', s: moneyStyle(zebra), numFmt: '"R$"#,##0.00' },
      motivoRejeicao: { v: l.motivoRejeicao || '—', t: 's', s: dataStyle(zebra ? 'FDF2F2' : 'FFF5F5') },

      promotorNome:  { v: l.promotor?.nome  ?? '—', t: 's', s: dataStyle(zebra ? 'FEF5E7' : 'FFFBF0') },
      promotorEmail: { v: l.promotor?.email ?? '—', t: 's', s: dataStyle(zebra ? 'FEF5E7' : 'FFFBF0') },
      promotorId:    { v: l.promotor?.id    ?? '—', t: 's', s: { ...dataStyle(zebra ? 'FEF5E7' : 'FFFBF0'), font: { sz: 7, color: { rgb: '7F8C8D' } }, border: borderThin() } },

      createdAt:  { v: fmtDate(l.createdAt),  t: 's', s: { ...dataStyle(zebra ? 'EAECEE' : 'F8F9FA'), alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin() } },
      updatedAt:  { v: fmtDate(l.updatedAt),  t: 's', s: { ...dataStyle(zebra ? 'EAECEE' : 'F8F9FA'), alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin() } },
      auditadoEm: { v: fmtDate(l.auditadoEm), t: 's', s: { ...dataStyle(zebra ? 'EAECEE' : 'F8F9FA'), alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin() } },
    }

    for (let ci = 0; ci < COLUMNS.length; ci++) {
      const key = COLUMNS[ci].key
      const cell = vals[key]
      const a = addr(ci, row)
      ws[a] = { v: cell.v, t: cell.t as XLSX.ExcelDataType, s: cell.s }
      if (cell.numFmt) ws[a].z = cell.numFmt
    }
  }

  // ── Linha de totais (última linha) ───────────────────────────────────────
  if (leads.length > 0) {
    const totalRow = DATA_START_ROW + leads.length
    const totalComissao = leads.reduce((s, l) => s + l.commissionValue, 0)
    const totalStyle = {
      font: { bold: true, sz: 9, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1E3A5F' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: borderThin(),
    }

    for (let ci = 0; ci < COLUMNS.length; ci++) {
      const col = COLUMNS[ci]
      const a   = addr(ci, totalRow)
      if (col.key === 'seq') {
        ws[a] = { v: 'TOTAL', t: 's', s: totalStyle }
      } else if (col.key === 'nomeCliente') {
        ws[a] = { v: `${leads.length} leads`, t: 's', s: totalStyle }
      } else if (col.key === 'comissao') {
        ws[a] = { v: totalComissao, t: 'n', s: { ...totalStyle, fill: { fgColor: { rgb: '1E8449' } } }, z: '"R$"#,##0.00' }
      } else {
        ws[a] = { v: '', t: 's', s: totalStyle }
      }
    }
  }

  // ── Larguras das colunas ──────────────────────────────────────────────────
  ws['!cols'] = COLUMNS.map(c => ({ wch: c.width }))

  // ── Alturas das linhas ────────────────────────────────────────────────────
  ws['!rows'] = [
    { hpt: 32 },   // row 1 — título
    { hpt: 22 },   // row 2 — grupos
    { hpt: 28 },   // row 3 — cabeçalhos
    ...leads.map(() => ({ hpt: 18 })),
    { hpt: 22 },   // linha de total
  ]

  // ── Range da planilha ─────────────────────────────────────────────────────
  const lastRow  = DATA_START_ROW + leads.length
  ws['!ref'] = `A1:${colLetter(TOTAL_COLS - 1)}${lastRow}`

  // ── Freeze panes: fixa as 3 linhas de cabeçalho ──────────────────────────
  ws['!freeze'] = { xSplit: 0, ySplit: 3 }

  XLSX.utils.book_append_sheet(wb, ws, '📋 Leads')

  // ══════════════════════════════════════════════════════════════════════════
  // ABA 2 — RESUMO / SUMÁRIO
  // ══════════════════════════════════════════════════════════════════════════
  const wsSummary: XLSX.WorkSheet = {}

  const b2c    = leads.filter(l => l.leadType === 'B2C')
  const b2b    = leads.filter(l => l.leadType === 'B2B')
  const pendentes  = leads.filter(l => l.status === 'PENDENTE_AUDITORIA')
  const aprovados  = leads.filter(l => l.status === 'AUDITADO_APROVADO')
  const rejeitados = leads.filter(l => l.status === 'AUDITADO_REJEITADO')
  const convertidos = leads.filter(l => l.funnelStage === 'CONVERTIDO')
  const totalComissao = leads.reduce((s, l) => s + l.commissionValue, 0)
  const comissaoPendente = pendentes.reduce((s, l) => s + l.commissionValue, 0)

  const summaryData = [
    ['ProspecLead — Sumário Executivo', ''],
    ['Exportado em', exportDate],
    ['Franquia filtrada', tenantLabel],
    ['', ''],
    ['📊 TOTAIS GERAIS', ''],
    ['Total de Leads', leads.length],
    ['Leads B2C (Pessoa Física)', b2c.length],
    ['Leads B2B (Empresa/Frota)', b2b.length],
    ['', ''],
    ['🔵 FUNIL DE VENDAS', ''],
    ['Lead Coletado',             leads.filter(l => l.funnelStage === 'LEAD_COLETADO').length],
    ['IA em Atendimento',         leads.filter(l => l.funnelStage === 'IA_EM_ATENDIMENTO').length],
    ['Reunião Agendada',          leads.filter(l => l.funnelStage === 'REUNIAO_AGENDADA').length],
    ['Convertido / Venda Fechada',convertidos.length],
    ['', ''],
    ['🟡 AUDITORIA DE FOTOS', ''],
    ['Pendentes de auditoria',    pendentes.length],
    ['Aprovados',                 aprovados.length],
    ['Rejeitados',                rejeitados.length],
    ['', ''],
    ['💰 COMISSIONAMENTO', ''],
    ['Total de Comissões (R$)',   totalComissao],
    ['Comissão Potencial Pendente (R$)', comissaoPendente],
    ['Média de Comissão por Lead (R$)',  leads.length > 0 ? +(totalComissao / leads.length).toFixed(2) : 0],
  ]

  XLSX.utils.sheet_add_aoa(wsSummary, summaryData, { origin: 'A1' })

  // Estilos do sumário
  const sumTitleStyle = {
    font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E3A5F' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: borderThin(),
  }
  const sumSectionStyle = (rgb: string) => ({
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: borderThin(),
  })
  const sumLabelStyle = {
    font: { sz: 10 },
    fill: { fgColor: { rgb: 'F4F6F7' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: borderThin(),
  }
  const sumValueStyle = {
    font: { bold: true, sz: 10, color: { rgb: '1E3A5F' } },
    fill: { fgColor: { rgb: 'EBF5FB' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: borderThin(),
  }

  // Aplicar estilos por seção
  if (!wsSummary['!merges']) wsSummary['!merges'] = []
  wsSummary['A1'].s = sumTitleStyle
  wsSummary['B1'] = { v: '', t: 's', s: sumTitleStyle }
  wsSummary['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } })

  // Seções e valores
  const sectionRows = [5, 10, 16, 21]
  const sectionColors = ['1E3A5F', '2471A3', 'B7950B', '1E8449']
  sectionRows.forEach((r, i) => {
    const a = `A${r}`
    const b = `B${r}`
    if (wsSummary[a]) wsSummary[a].s = sumSectionStyle(sectionColors[i])
    if (!wsSummary[b]) wsSummary[b] = { v: '', t: 's' }
    wsSummary[b].s = sumSectionStyle(sectionColors[i])
    wsSummary['!merges']!.push({ s: { r: r - 1, c: 0 }, e: { r: r - 1, c: 1 } })
  })

  // Labels e valores normais
  for (let ri = 1; ri <= summaryData.length; ri++) {
    const aAddr = `A${ri}`
    const bAddr = `B${ri}`
    if (!wsSummary[aAddr]) continue
    if (wsSummary[aAddr].v === '') continue
    if (sectionRows.includes(ri)) continue
    if (ri === 1) continue
    wsSummary[aAddr].s = sumLabelStyle
    if (wsSummary[bAddr]) {
      const isNum = typeof wsSummary[bAddr].v === 'number'
      wsSummary[bAddr].s = isNum
        ? { ...sumValueStyle, ...(String(wsSummary[bAddr].v).includes('.') ? { z: '"R$"#,##0.00' } : {}) }
        : { ...sumValueStyle, font: { sz: 10, color: { rgb: '1E3A5F' } } }
    }
  }

  wsSummary['!cols'] = [{ wch: 40 }, { wch: 24 }]
  wsSummary['!rows'] = summaryData.map(() => ({ hpt: 20 }))
  wsSummary['!ref']  = `A1:B${summaryData.length}`

  XLSX.utils.book_append_sheet(wb, wsSummary, '📊 Sumário')

  // ══════════════════════════════════════════════════════════════════════════
  // ABA 3 — COMISSÕES POR PROMOTOR
  // ══════════════════════════════════════════════════════════════════════════
  const promotorMap = new Map<string, {
    nome: string; email: string; total: number; aprovados: number; pendentes: number; comissao: number
  }>()

  for (const l of leads) {
    const pid  = l.promotor?.id    ?? 'sem-promotor'
    const pNome = l.promotor?.nome  ?? 'Sem Promotor'
    const pEmail = l.promotor?.email ?? '—'
    if (!promotorMap.has(pid)) {
      promotorMap.set(pid, { nome: pNome, email: pEmail, total: 0, aprovados: 0, pendentes: 0, comissao: 0 })
    }
    const p = promotorMap.get(pid)!
    p.total++
    p.comissao += l.commissionValue
    if (l.status === 'AUDITADO_APROVADO')  p.aprovados++
    if (l.status === 'PENDENTE_AUDITORIA') p.pendentes++
  }

  const wsPromotor: XLSX.WorkSheet = {}
  const promRows: unknown[][] = [
    ['ProspecLead — Comissões por Promotor', '', '', '', '', ''],
    [''],
    ['Nome do Promotor', 'E-mail', 'Total Leads', 'Leads Aprovados', 'Leads Pendentes', 'Comissão Total (R$)'],
    ...Array.from(promotorMap.values())
      .sort((a, b) => b.comissao - a.comissao)
      .map(p => [p.nome, p.email, p.total, p.aprovados, p.pendentes, p.comissao]),
  ]

  XLSX.utils.sheet_add_aoa(wsPromotor, promRows, { origin: 'A1' })

  // Estilos da aba promotor
  wsPromotor['A1'].s = headerTitleStyle()
  if (!wsPromotor['!merges']) wsPromotor['!merges'] = []
  wsPromotor['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } })
  styleRange(wsPromotor, 0, 0, 5, 0, headerTitleStyle())

  // Cabeçalho de coluna (row 3)
  for (let ci = 0; ci < 6; ci++) {
    const a = addr(ci, 3)
    if (wsPromotor[a]) wsPromotor[a].s = colHeaderStyle('D6E4F0')
  }

  // Dados (row 4+)
  const promData = Array.from(promotorMap.values()).sort((a, b) => b.comissao - a.comissao)
  for (let i = 0; i < promData.length; i++) {
    const ri    = 4 + i
    const zebra = i % 2 === 1
    const bg    = zebra ? 'F0F4FA' : 'FFFFFF'
    for (let ci = 0; ci < 6; ci++) {
      const a = addr(ci, ri)
      if (!wsPromotor[a]) continue
      if (ci === 0) wsPromotor[a].s = { ...dataStyle(bg), font: { bold: true, sz: 9 }, border: borderThin() }
      else if (ci === 5) wsPromotor[a].s = moneyStyle(zebra)
      else wsPromotor[a].s = { ...dataStyle(bg), alignment: { horizontal: ci >= 2 ? 'center' : 'left', vertical: 'center' }, border: borderThin() }
    }
  }

  wsPromotor['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 20 }]
  wsPromotor['!rows'] = promRows.map(() => ({ hpt: 20 }))
  wsPromotor['!ref']  = `A1:F${promRows.length}`

  XLSX.utils.book_append_sheet(wb, wsPromotor, '💰 Promotores')

  // ── Gerar buffer e retornar ──────────────────────────────────────────────
  const buffer = XLSX.write(wb, {
    type:      'buffer',
    bookType:  'xlsx',
    cellStyles: true,
  })

  const date     = new Date().toISOString().slice(0, 10)
  const filename = `ProspecLead_Leads_${date}.xlsx`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}

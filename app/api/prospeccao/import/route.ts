/**
 * /api/prospeccao/import
 * POST { leads: ProspectImportPayload[] }
 *
 * Importa um ou mais leads prospectados ao CRM.
 * Marca origem como "PROSPECCAO_ATIVA" e leadType = "B2B".
 * Verifica duplicatas por CNPJ dentro do mesmo tenant.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { ProspectImportPayload } from '@/lib/services/b2b-search.service'

const ALLOWED_ROLES = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']

export async function POST(req: NextRequest) {
  // ── Autenticação ────────────────────────────────────────────────────────
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })
  const session = await verifyToken(cookieToken)
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  let body: { leads: ProspectImportPayload[] }
  try { body = await req.json() }
  catch { return NextResponse.json({ success: false, error: 'JSON inválido.' }, { status: 400 }) }

  const leadsToImport: ProspectImportPayload[] = Array.isArray(body.leads) ? body.leads : [body.leads].filter(Boolean)

  if (!leadsToImport.length) {
    return NextResponse.json({ success: false, error: 'Nenhum lead para importar.' }, { status: 400 })
  }

  // Tenant do usuário autenticado (ADMIN_MASTER pode especificar tenantId no payload)
  const tenantId = session.role === 'ADMIN_MASTER'
    ? (leadsToImport[0]?.tenantId ?? session.tenantId ?? '')
    : (session.tenantId ?? '')

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId não encontrado na sessão.' }, { status: 400 })
  }

  const imported:   string[] = []
  const duplicates: string[] = []
  const errors:     { lead: string; error: string }[] = []

  for (const lead of leadsToImport) {
    try {
      // Verifica duplicata por CNPJ (se informado)
      if (lead.cnpj) {
        const cnpjClean = lead.cnpj.replace(/\D/g, '')
        const existing = await prisma.lead.findFirst({
          where: { cnpj: cnpjClean, tenantId },
        })
        if (existing) {
          duplicates.push(lead.cnpj)
          continue
        }
      }

      // Cria lead no CRM
      const created = await prisma.lead.create({
        data: {
          // ── Básico ──────────────────────────────────────────────────────
          nomeCliente:  lead.nomeCliente?.trim() || lead.razaoSocial?.trim() || 'Empresa sem nome',
          telefone:     lead.telefone?.replace(/\D/g, '') ?? null,
          email:        lead.email?.toLowerCase() ?? null,
          leadType:     'B2B',

          // ── Dados empresariais ───────────────────────────────────────────
          cnpj:         lead.cnpj?.replace(/\D/g, '') ?? null,
          empresaNome:  lead.empresaNome ?? lead.razaoSocial ?? null,
          razaoSocial:  lead.razaoSocial ?? null,
          frota:        lead.frota ?? null,
          segmento:     lead.segmento ?? lead.cnaeDescricao ?? null,
          cnae:         lead.cnae ?? null,
          cnaeDescricao: lead.cnaeDescricao ?? null,
          porte:        lead.porte ?? null,

          // ── Endereço ─────────────────────────────────────────────────────
          logradouro:   lead.logradouro ?? null,
          numero:       lead.numero ?? null,
          complemento:  lead.complemento ?? null,
          bairro:       lead.bairro ?? null,
          municipio:    lead.municipio ?? null,
          uf:           lead.uf ?? null,
          cep:          lead.cep?.replace(/\D/g, '') ?? null,

          // ── Prospecção ───────────────────────────────────────────────────
          sourceType:         'PROSPECCAO_ATIVA',
          googlePlaceId:      lead.googlePlaceId ?? null,
          situacaoCadastral:  lead.situacaoCadastral ?? null,
          qsa:                lead.qsa ?? null,
          doresIdentificadas: lead.doresIdentificadas ?? null,

          // ── Funil / status ───────────────────────────────────────────────
          funnelStage:  'LEAD_COLETADO',
          status:       'PENDENTE_AUDITORIA',

          // ── Tenant / promotor ────────────────────────────────────────────
          tenantId,
          promotorId:   lead.createdById ?? session.userId ?? null,
        },
      })
      imported.push(created.id)
    } catch (e) {
      console.error('[Import Lead] Erro:', e)
      errors.push({ lead: lead.nomeCliente ?? lead.cnpj ?? '?', error: (e as Error).message })
    }
  }

  return NextResponse.json({
    success:    true,
    imported:   imported.length,
    duplicates: duplicates.length,
    errors:     errors.length,
    detail: {
      importedIds: imported,
      duplicateCnpjs: duplicates,
      errors,
    },
    message: `${imported.length} lead(s) importado(s)${duplicates.length ? `, ${duplicates.length} duplicata(s) ignorada(s)` : ''}.`,
  }, { status: 201 })
}

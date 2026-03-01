/**
 * POST /api/mobile/leads
 * ─────────────────────────────────────────────────────────────────────────────
 * Recebe multipart/form-data do app Flutter para criar um novo Lead B2C ou B2B,
 * opcionalmente com foto da placa (campo `platePhoto`).
 *
 * Headers obrigatórios:
 *   Authorization: Bearer <mobile_jwt_token>
 *
 * Campos multipart/form-data:
 *   ─── Obrigatórios ────────────────────────────────────────────────────────
 *   nomeCliente   String   — nome do cliente / contato
 *   telefone      String   — WhatsApp com DDD (ex: 11987654321)
 *   leadType      String   — "B2C" ou "B2B"   (default: B2C)
 *
 *   ─── B2C (quando leadType=B2C) ───────────────────────────────────────────
 *   veiculo       String   — ex: "Toyota Hilux SW4 2022"
 *   placa         String   — ex: "ABC1D23"
 *   praca         String   — ex: "Belo Horizonte - MG"
 *   platePhoto    File?    — imagem da placa (JPEG/PNG, max 5 MB)
 *
 *   ─── B2B (quando leadType=B2B) ───────────────────────────────────────────
 *   cnpj          String?  — CNPJ da empresa
 *   empresaNome   String?  — Razão Social
 *   frota         String?  — ex: "47 caminhões"
 *   segmento      String?  — ex: "Mineração"
 *
 *   ─── Opcionais (ambos os tipos) ──────────────────────────────────────────
 *   email              String?  — e-mail do cliente
 *   doresIdentificadas String?  — texto livre sobre a dor do cliente
 *
 * Retorno 201:
 *   { status: 201, message: "Lead registrado com sucesso!", leadId: "cuid" }
 *
 * Erros:
 *   400  MISSING_FIELDS   — telefone ou nomeCliente ausentes
 *   400  FILE_TOO_LARGE   — platePhoto > 5 MB
 *   400  INVALID_TYPE     — leadType inválido
 *   401  UNAUTHORIZED     — token ausente ou inválido
 *   500  INTERNAL_ERROR   — erro genérico
 */

import { NextRequest }       from 'next/server'
import { writeFile, mkdir }  from 'fs/promises'
import path                  from 'path'
import { prisma }            from '@/lib/prisma'
import { verifyMobileToken, mobileError, mobileOk } from '@/lib/mobile-auth'

// 5 MB em bytes
const MAX_FILE_SIZE = 5 * 1024 * 1024

// Diretório público de uploads (relativo à raiz do projeto Next.js)
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'plates')

export async function POST(req: NextRequest) {
  try {
    /* ── 1. Autenticação mobile ──────────────────────────────────────────── */
    const payload = await verifyMobileToken(req)
    if (!payload) {
      return mobileError(
        'Token inválido ou expirado. Faça login novamente.',
        'UNAUTHORIZED',
        401,
      )
    }

    /* ── 2. Parse multipart/form-data ───────────────────────────────────── */
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return mobileError(
        'Requisição inválida. Use multipart/form-data.',
        'INVALID_REQUEST',
        400,
      )
    }

    /* ── 3. Extrair campos de texto ──────────────────────────────────────── */
    const nomeCliente        = formData.get('nomeCliente')?.toString().trim()        ?? ''
    const telefone           = formData.get('telefone')?.toString().trim()           ?? ''
    const email              = formData.get('email')?.toString().trim()              || null
    const leadType           = formData.get('leadType')?.toString().toUpperCase()    || 'B2C'
    const veiculo            = formData.get('veiculo')?.toString().trim()            || ''
    const placa              = formData.get('placa')?.toString().trim().toUpperCase() || ''
    const praca              = formData.get('praca')?.toString().trim()              || ''
    const cnpj               = formData.get('cnpj')?.toString().trim()              || null
    const empresaNome        = formData.get('empresaNome')?.toString().trim()       || null
    const frota              = formData.get('frota')?.toString().trim()             || null
    const segmento           = formData.get('segmento')?.toString().trim()         || null
    const doresIdentificadas = formData.get('doresIdentificadas')?.toString().trim() || null

    /* ── 4. Validações obrigatórias ──────────────────────────────────────── */
    if (!nomeCliente) {
      return mobileError(
        'O nome do cliente é obrigatório.',
        'MISSING_FIELDS',
        400,
        { field: 'nomeCliente' },
      )
    }

    if (!telefone) {
      return mobileError(
        'O telefone/WhatsApp do cliente é obrigatório.',
        'MISSING_FIELDS',
        400,
        { field: 'telefone' },
      )
    }

    if (!['B2C', 'B2B'].includes(leadType)) {
      return mobileError(
        `Tipo de lead inválido: "${leadType}". Use "B2C" ou "B2B".`,
        'INVALID_TYPE',
        400,
        { field: 'leadType' },
      )
    }

    // B2C sem placa → aviso (não bloqueia, é campo opcional)
    // B2B sem empresaNome → aviso informativo

    /* ── 5. Upload de foto da placa (opcional) ───────────────────────────── */
    let platePhotoUrl: string | null = null
    const platePhotoFile = formData.get('platePhoto')

    if (platePhotoFile && platePhotoFile instanceof File && platePhotoFile.size > 0) {

      // Validar tamanho
      if (platePhotoFile.size > MAX_FILE_SIZE) {
        return mobileError(
          `A foto da placa excede o tamanho máximo de 5 MB (enviado: ${(platePhotoFile.size / 1024 / 1024).toFixed(1)} MB).`,
          'FILE_TOO_LARGE',
          400,
          { maxSize: '5MB', sent: `${(platePhotoFile.size / 1024 / 1024).toFixed(1)}MB` },
        )
      }

      // Validar tipo MIME
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
      const mime = platePhotoFile.type || 'image/jpeg'
      if (!allowedMimes.includes(mime.toLowerCase())) {
        return mobileError(
          'Formato de imagem inválido. Use JPEG, PNG, WebP ou HEIC.',
          'INVALID_FILE_TYPE',
          400,
          { received: mime, allowed: allowedMimes.join(', ') },
        )
      }

      // Gerar nome único para o arquivo
      const ext       = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
      const timestamp = Date.now()
      const random    = Math.random().toString(36).substring(2, 8)
      const filename  = `plate_${timestamp}_${random}.${ext}`

      // Garantir que o diretório existe
      await mkdir(UPLOAD_DIR, { recursive: true })

      // Salvar arquivo no disco
      const buffer = Buffer.from(await platePhotoFile.arrayBuffer())
      await writeFile(path.join(UPLOAD_DIR, filename), buffer)

      // URL pública acessível via Next.js static serving
      platePhotoUrl = `/uploads/plates/${filename}`
    }

    /* ── 6. Determinar status inicial do Lead ────────────────────────────── */
    // Se veio foto de placa → aguarda auditoria
    // Se não veio foto → entra direto como lead sem auditoria pendente
    const status = platePhotoUrl ? 'PENDENTE_AUDITORIA' : 'PENDENTE_AUDITORIA'

    /* ── 7. Criar Lead no banco ──────────────────────────────────────────── */
    const lead = await prisma.lead.create({
      data: {
        // Dados do cliente
        nomeCliente,
        telefone,
        email,

        // Tipo do lead
        leadType,

        // Dados B2C
        veiculo:      leadType === 'B2C' ? veiculo   : '',
        placa:        leadType === 'B2C' ? placa     : '',
        praca:        leadType === 'B2C' ? praca     : '',
        platePhotoUrl,

        // Dados B2B
        cnpj:       leadType === 'B2B' ? cnpj       : null,
        empresaNome: leadType === 'B2B' ? empresaNome : null,
        frota:      leadType === 'B2B' ? frota      : null,
        segmento:   leadType === 'B2B' ? segmento   : null,

        // Qualificação
        doresIdentificadas,

        // Funil e status
        funnelStage:    'LEAD_COLETADO',
        status,
        commissionValue: 1.00,

        // Promotor (usuário logado no app)
        promotorId: payload.sub,

        // Multi-tenant (herdado do promotor)
        tenantId: payload.tenantId ?? null,
      },
      select: {
        id:           true,
        nomeCliente:  true,
        placa:        true,
        leadType:     true,
        status:       true,
        platePhotoUrl: true,
        funnelStage:  true,
        createdAt:    true,
      },
    })

    /* ── 8. Resposta de sucesso ──────────────────────────────────────────── */
    return mobileOk(
      {
        status: 201,
        message: platePhotoUrl
          ? 'Lead registrado com sucesso! Foto enviada para auditoria.'
          : 'Lead registrado com sucesso!',
        leadId:       lead.id,
        lead: {
          id:           lead.id,
          nomeCliente:  lead.nomeCliente,
          placa:        lead.placa,
          leadType:     lead.leadType,
          status:       lead.status,
          funnelStage:  lead.funnelStage,
          platePhotoUrl: lead.platePhotoUrl,
          createdAt:    lead.createdAt,
        },
      },
      201,
    )

  } catch (err) {
    console.error('[mobile/leads] erro:', err)
    return mobileError(
      'Erro interno do servidor. Tente novamente em instantes.',
      'INTERNAL_ERROR',
      500,
    )
  }
}

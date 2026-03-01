/**
 * /api/mobile/perfil
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → retorna perfil completo do promotor autenticado (KYC + Pix)
 * POST → multipart/form-data: atualiza pixKeyType, pixKey e/ou foto do documento
 *
 * Headers obrigatórios: Authorization: Bearer <JWT mobile>
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir }          from 'fs/promises'
import { join }                      from 'path'
import { prisma }                    from '@/lib/prisma'
import { verifyMobileToken }         from '@/lib/mobile-auth'

const MAX_DOC_SIZE  = 8 * 1024 * 1024   // 8 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function err(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status })
}

/* ─── GET: buscar perfil ─────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const payload = await verifyMobileToken(req)
  if (!payload) return err('Não autenticado', 401)

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true, nome: true, email: true, telefone: true,
      cpf: true, avatarUrl: true, fotoUrl: true,
      pixKeyType: true, pixKey: true, pixVerified: true,
      cpfPhotoUrl: true, kycStatus: true, kycNote: true,
      role: true, tenantId: true,
      tenant: { select: { nome: true } },
    },
  })

  if (!user) return err('Usuário não encontrado', 404)

  return NextResponse.json({
    success: true,
    perfil: {
      ...user,
      tenantNome: user.tenant?.nome ?? null,
    },
  })
}

/* ─── POST: atualizar perfil KYC + Pix ──────────────────────────────────── */
export async function POST(req: NextRequest) {
  const payload = await verifyMobileToken(req)
  if (!payload) return err('Não autenticado', 401)

  try {
    const formData = await req.formData()

    // ── Campos texto ────────────────────────────────────────────────────────
    const pixKeyType = formData.get('pixKeyType')?.toString() ?? null
    const pixKey     = formData.get('pixKey')?.toString() ?? null
    const nome       = formData.get('nome')?.toString() ?? null
    const telefone   = formData.get('telefone')?.toString() ?? null

    // Validar tipo de chave Pix
    const VALID_PIX_TYPES = ['CPF', 'EMAIL', 'TELEFONE', 'CNPJ', 'ALEATORIA']
    if (pixKeyType && !VALID_PIX_TYPES.includes(pixKeyType)) {
      return err(`Tipo de chave Pix inválido. Use: ${VALID_PIX_TYPES.join(', ')}`)
    }

    // ── Upload do documento ─────────────────────────────────────────────────
    let cpfPhotoUrl: string | undefined
    const docFile = formData.get('cpfPhoto') as File | null

    if (docFile && docFile.size > 0) {
      if (docFile.size > MAX_DOC_SIZE) {
        return err('Documento muito grande. Máximo: 8 MB')
      }
      if (!ALLOWED_TYPES.includes(docFile.type)) {
        return err('Formato inválido. Use JPG, PNG, WebP ou PDF')
      }

      const ext      = docFile.type === 'application/pdf' ? 'pdf'
                     : docFile.type.split('/')[1].replace('jpeg', 'jpg')
      const filename = `doc_${payload.sub}_${Date.now()}.${ext}`
      const dir      = join(process.cwd(), 'public', 'uploads', 'documents')
      await mkdir(dir, { recursive: true })
      const bytes    = await docFile.arrayBuffer()
      await writeFile(join(dir, filename), Buffer.from(bytes))
      cpfPhotoUrl = `/uploads/documents/${filename}`
    }

    // ── Monta objeto de update ───────────────────────────────────────────────
    const updateData: Record<string, unknown> = {}
    if (pixKeyType !== null) updateData.pixKeyType = pixKeyType
    if (pixKey     !== null) updateData.pixKey     = pixKey
    if (nome       !== null) updateData.nome       = nome.trim()
    if (telefone   !== null) updateData.telefone   = telefone.trim()
    if (cpfPhotoUrl)         {
      updateData.cpfPhotoUrl = cpfPhotoUrl
      updateData.kycStatus   = 'PENDING_REVIEW' // volta pra revisão ao enviar novo doc
    }

    if (Object.keys(updateData).length === 0) {
      return err('Nenhum campo enviado para atualização')
    }

    const updated = await prisma.user.update({
      where: { id: payload.sub },
      data:  updateData,
      select: {
        id: true, nome: true, email: true, telefone: true,
        pixKeyType: true, pixKey: true, pixVerified: true,
        cpfPhotoUrl: true, kycStatus: true,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Perfil atualizado com sucesso!',
      perfil:  updated,
    })

  } catch (e) {
    console.error('[perfil] erro:', e)
    return err('Erro interno ao atualizar perfil', 500)
  }
}

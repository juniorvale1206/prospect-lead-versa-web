/**
 * POST /api/admin/promotores/upload-doc
 * ─────────────────────────────────────────────────────────────────────────────
 * Permite ao FINANCIAL ou ADMIN_MASTER fazer upload do documento (CPF/RG)
 * de qualquer promotor.
 *
 * Body: multipart/form-data
 *   - docPhoto:  File (JPG, PNG, WebP, PDF — máx 8 MB)
 *   - userId:    string
 *
 * Retorna: { success, url }
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir }          from 'fs/promises'
import { join }                      from 'path'
import { getSession }                from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

const MAX_DOC_SIZE  = 8 * 1024 * 1024   // 8 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function err(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status })
}

function ext(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  }
  return map[mimeType] ?? 'bin'
}

export async function POST(req: NextRequest) {
  /* ── Auth ──────────────────────────────────────────────────────────────── */
  const session = await getSession()
  if (!session) return err('Não autenticado', 401)
  if (!['ADMIN_MASTER', 'FINANCIAL'].includes(session.role)) {
    return err('Permissão insuficiente', 403)
  }

  try {
    const formData  = await req.formData()
    const userId    = formData.get('userId')?.toString()
    const docPhoto  = formData.get('docPhoto') as File | null

    if (!userId)   return err('userId é obrigatório')
    if (!docPhoto) return err('Campo "docPhoto" é obrigatório')

    if (docPhoto.size > MAX_DOC_SIZE) return err('Arquivo muito grande. Máximo: 8 MB')
    if (!ALLOWED_TYPES.includes(docPhoto.type)) {
      return err('Formato inválido. Use JPG, PNG, WebP ou PDF')
    }

    /* ── Garante existência do promotor ──────────────────────────────────── */
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) return err('Promotor não encontrado', 404)

    /* ── Gera nome único ─────────────────────────────────────────────────── */
    const timestamp = Date.now()
    const rand      = Math.random().toString(36).substring(2, 8)
    const filename  = `doc_${userId.slice(0, 8)}_${timestamp}_${rand}.${ext(docPhoto.type)}`

    /* ── Salva em /public/uploads/documents/ ─────────────────────────────── */
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'documents')
    await mkdir(uploadDir, { recursive: true })

    const bytes  = await docPhoto.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(join(uploadDir, filename), buffer)

    const publicUrl = `/uploads/documents/${filename}`

    /* ── Atualiza Prisma ─────────────────────────────────────────────────── */
    await prisma.user.update({
      where: { id: userId },
      data:  {
        cpfPhotoUrl: publicUrl,
        kycStatus:   'PENDING_REVIEW',  // Reset para revisão após novo upload
      },
    })

    return NextResponse.json({ success: true, url: publicUrl })
  } catch (e) {
    console.error('[upload-doc]', e)
    return err('Erro interno ao fazer upload', 500)
  }
}

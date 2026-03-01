/**
 * POST /api/admin/promotores/upload-foto
 * ─────────────────────────────────────────────────────────────────────────────
 * Recebe multipart/form-data com campo "foto" (imagem).
 * Salva em /public/uploads/promoters/
 * Retorna: { url: "/uploads/promoters/filename.jpg" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir }          from 'fs/promises'
import { join }                      from 'path'
import { getSession }                from '@/lib/auth'

const MAX_SIZE   = 5 * 1024 * 1024  // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function error(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    /* ── Auth ────────────────────────────────────────────────────────────── */
    const session = await getSession()
    if (!session) return error('Não autenticado', 401)
    if (!['ADMIN_MASTER', 'MANAGER'].includes(session.role)) {
      return error('Permissão insuficiente', 403)
    }

    /* ── Parse multipart ─────────────────────────────────────────────────── */
    const formData = await req.formData()
    const foto = formData.get('foto') as File | null

    if (!foto) return error('Campo "foto" é obrigatório')
    if (foto.size > MAX_SIZE) return error('Arquivo muito grande. Máximo: 5 MB')
    if (!ALLOWED_TYPES.includes(foto.type)) {
      return error('Formato inválido. Use JPG, PNG ou WebP')
    }

    /* ── Gera nome único ─────────────────────────────────────────────────── */
    const ext      = foto.type.split('/')[1].replace('jpeg', 'jpg')
    const filename = `promoter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

    /* ── Garante que o diretório existe ──────────────────────────────────── */
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'promoters')
    await mkdir(uploadDir, { recursive: true })

    /* ── Salva o arquivo ─────────────────────────────────────────────────── */
    const bytes  = await foto.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(join(uploadDir, filename), buffer)

    const url = `/uploads/promoters/${filename}`

    return NextResponse.json({ success: true, url }, { status: 201 })
  } catch (err) {
    console.error('[upload-foto] erro:', err)
    return error('Erro interno ao salvar imagem', 500)
  }
}

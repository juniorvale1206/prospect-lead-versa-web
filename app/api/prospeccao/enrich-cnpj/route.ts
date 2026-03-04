/**
 * /api/prospeccao/enrich-cnpj
 * GET ?cnpj=12345678000190
 *
 * Busca dados completos de uma empresa via BrasilAPI / ReceitaWS.
 * Usado no auto-preenchimento do formulário de lead B2B.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { enrichCnpj } from '@/lib/services/b2b-search.service'

export async function GET(req: NextRequest) {
  // Autenticação
  const cookieToken = req.cookies.get('prospeclead-token')?.value
  if (!cookieToken) {
    return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })
  }
  const session = await verifyToken(cookieToken)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Token inválido.' }, { status: 401 })
  }

  const cnpj = req.nextUrl.searchParams.get('cnpj')?.replace(/\D/g, '') ?? ''
  if (!cnpj || cnpj.length !== 14) {
    return NextResponse.json({ success: false, error: 'Informe um CNPJ válido com 14 dígitos.' }, { status: 400 })
  }

  const result = await enrichCnpj(cnpj)
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 422 })
  }

  return NextResponse.json({ success: true, data: result })
}

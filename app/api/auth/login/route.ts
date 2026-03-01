import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'E-mail e senha são obrigatórios' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { tenant: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    if (!user.ativo) {
      return NextResponse.json(
        { error: 'Usuário inativo. Contate o administrador.' },
        { status: 403 }
      )
    }

    const senhaValida = await bcrypt.compare(password, user.password)
    if (!senhaValida) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    const token = await signToken({
      userId: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role as 'ADMIN_MASTER' | 'FINANCIAL' | 'MANAGER' | 'PROMOTER' | 'PARTNER_EMPLOYEE',
      tenantId: user.tenantId,
      tenantNome: user.tenant?.nome || null,
    })

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        role: user.role as 'ADMIN_MASTER' | 'FINANCIAL' | 'MANAGER' | 'PROMOTER' | 'PARTNER_EMPLOYEE',
        tenantId: user.tenantId,
        tenantNome: user.tenant?.nome || null,
      },
    })

    response.cookies.set('prospeclead-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 horas
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Erro no login:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

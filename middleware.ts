import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'prospeclead-super-secret-key-2024'
)

interface JWTPayload {
  userId: string
  email: string
  nome: string
  role: 'ADMIN_MASTER' | 'FINANCIAL' | 'MANAGER'
  tenantId: string | null
}

async function getPayload(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('prospeclead-token')?.value

  // ── Rotas mobile (Bearer token, sem cookie) ──────────────────────────────
  // Autenticação feita internamente por verifyMobileToken() em cada handler
  if (pathname.startsWith('/api/mobile/')) {
    return NextResponse.next()
  }

  // ── Webhooks externos (autenticação via X-Webhook-Secret) ────────────────
  // O webhook da IA não usa cookie de sessão — autenticação feita no handler
  if (pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next()
  }

  // ── Cron Jobs (autenticação via CRON_SECRET no query param) ──────────────
  // Cada handler verifica internamente o secret — não depende de cookie
  if (pathname.startsWith('/api/cron/')) {
    return NextResponse.next()
  }

  // ── Rotas de Admin API (autenticação via cookie + role check no handler) ──
  if (pathname.startsWith('/api/admin/')) {
    return NextResponse.next()
  }

  // Rotas públicas - não precisa de autenticação
  const publicRoutes = ['/login', '/api/auth/login']
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    // Se já está logado e tenta acessar login, redirecionar para dashboard
    if (pathname === '/login' && token) {
      const payload = await getPayload(token)
      if (payload) {
        if (payload.role === 'ADMIN_MASTER') return NextResponse.redirect(new URL('/dashboard', request.url))
        if (payload.role === 'FINANCIAL') return NextResponse.redirect(new URL('/financeiro', request.url))
        return NextResponse.redirect(new URL('/operacao', request.url))
      }
    }
    return NextResponse.next()
  }

  // Verificar se está autenticado
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const payload = await getPayload(token)
  if (!payload) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('prospeclead-token')
    return response
  }

  const role = payload.role

  // /admin/* → apenas ADMIN_MASTER
  if (pathname.startsWith('/admin')) {
    if (role !== 'ADMIN_MASTER') {
      return NextResponse.redirect(new URL('/acesso-negado', request.url))
    }
  }

  // /financeiro/* → ADMIN_MASTER ou FINANCIAL
  if (pathname.startsWith('/financeiro')) {
    if (role !== 'ADMIN_MASTER' && role !== 'FINANCIAL') {
      return NextResponse.redirect(new URL('/acesso-negado', request.url))
    }
  }

  // /dashboard → apenas ADMIN_MASTER
  if (pathname.startsWith('/dashboard')) {
    if (role !== 'ADMIN_MASTER') {
      if (role === 'FINANCIAL') return NextResponse.redirect(new URL('/financeiro', request.url))
      return NextResponse.redirect(new URL('/operacao', request.url))
    }
  }

  // /operacao/* → qualquer usuário logado
  // Adicionar o usuário ao header para uso nas páginas
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', payload.userId)
  requestHeaders.set('x-user-email', payload.email)
  requestHeaders.set('x-user-role', payload.role)
  requestHeaders.set('x-user-nome', payload.nome)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: [
    // Exclui assets estáticos, rotas de auth e rotas mobile (têm seu próprio auth via Bearer)
    '/((?!_next/static|_next/image|favicon.ico|uploads|api/auth/login|api/auth/logout|api/mobile|api/webhooks|api/cron).*)',
  ],
}

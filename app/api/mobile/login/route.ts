/**
 * POST /api/mobile/login
 * ─────────────────────────────────────────────────────────────────────────────
 * Autenticação do Promotor / Frentista / PDV no app Flutter.
 *
 * Body (JSON):
 *   email       String  obrigatório
 *   password    String  obrigatório
 *   deviceInfo  String  opcional  — ex: "iPhone 14 / iOS 17.4"
 *
 * Retorno 200:
 *   {
 *     success: true,
 *     token: "eyJ...",           // JWT 30 dias — salvar no SecureStorage do app
 *     expiresAt: "ISO string",
 *     user: {
 *       id, email, nome, role, tenantId, tenantNome,
 *       telefone, avatarUrl
 *     }
 *   }
 *
 * Erros:
 *   400  MISSING_FIELDS   — email ou senha ausentes
 *   401  INVALID_CREDENTIALS — usuário não existe ou senha errada
 *   403  ROLE_NOT_ALLOWED — role não autorizado para o app mobile
 *   403  ACCOUNT_INACTIVE — conta desativada
 */

import { NextRequest }      from 'next/server'
import bcrypt               from 'bcryptjs'
import { prisma }           from '@/lib/prisma'
import {
  createMobileToken,
  mobileError,
  mobileOk,
  MOBILE_ROLES,
} from '@/lib/mobile-auth'

// Roles liberados para autenticar no app mobile
const ALLOWED_ROLES = new Set([...MOBILE_ROLES, 'MANAGER'])

export async function POST(req: NextRequest) {
  try {
    /* ── 1. Parse do body ────────────────────────────────────────────────── */
    let body: { email?: string; password?: string; deviceInfo?: string }

    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      body = await req.json()
    } else {
      // Aceita também form-urlencoded (compatibilidade)
      const fd = await req.formData()
      body = {
        email:      fd.get('email')?.toString(),
        password:   fd.get('password')?.toString(),
        deviceInfo: fd.get('deviceInfo')?.toString(),
      }
    }

    const { email, password, deviceInfo } = body

    /* ── 2. Validação ────────────────────────────────────────────────────── */
    if (!email?.trim())    return mobileError('E-mail é obrigatório',   'MISSING_FIELDS', 400)
    if (!password?.trim()) return mobileError('Senha é obrigatória',    'MISSING_FIELDS', 400)

    /* ── 3. Buscar usuário ───────────────────────────────────────────────── */
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { tenant: { select: { id: true, nome: true } } },
    })

    if (!user) {
      return mobileError('E-mail ou senha incorretos', 'INVALID_CREDENTIALS', 401)
    }

    /* ── 4. Verificar senha ──────────────────────────────────────────────── */
    const senhaValida = await bcrypt.compare(password, user.password)
    if (!senhaValida) {
      return mobileError('E-mail ou senha incorretos', 'INVALID_CREDENTIALS', 401)
    }

    /* ── 5. Verificar role e status ──────────────────────────────────────── */
    if (!ALLOWED_ROLES.has(user.role)) {
      return mobileError(
        `A sua conta (${user.role}) não tem permissão para usar o aplicativo mobile.`,
        'ROLE_NOT_ALLOWED',
        403,
      )
    }

    if (!user.ativo) {
      return mobileError(
        'Sua conta está desativada. Contate o administrador.',
        'ACCOUNT_INACTIVE',
        403,
      )
    }

    /* ── 6. Gerar token ──────────────────────────────────────────────────── */
    const { token, expiresAt } = await createMobileToken(
      user.id,
      user.email,
      user.nome,
      user.role,
      user.tenantId  ?? null,
      user.tenant?.nome ?? null,
      deviceInfo,
    )

    /* ── 7. Resposta ─────────────────────────────────────────────────────── */
    return mobileOk({
      token,
      expiresAt:  expiresAt.toISOString(),
      user: {
        id:         user.id,
        email:      user.email,
        nome:       user.nome,
        role:       user.role,
        tenantId:   user.tenantId   ?? null,
        tenantNome: user.tenant?.nome ?? null,
        telefone:   user.telefone   ?? null,
        avatarUrl:  user.avatarUrl  ?? null,
      },
    })

  } catch (err) {
    console.error('[mobile/login] erro:', err)
    return mobileError('Erro interno do servidor', 'INTERNAL_ERROR', 500)
  }
}

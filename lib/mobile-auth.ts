/**
 * lib/mobile-auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilitários de autenticação para o app mobile (Flutter).
 * Usa JWT Bearer token no header Authorization, separado do sistema de cookies
 * do painel web. Os tokens têm 30 dias de validade e são registrados na tabela
 * MobileToken para controle e possibilidade de revogação remota.
 */

import { SignJWT, jwtVerify } from 'jose'
import { NextRequest }       from 'next/server'
import { prisma }            from '@/lib/prisma'

// ─── Roles que têm permissão de usar o app mobile ───────────────────────────
export const MOBILE_ROLES = ['PROMOTER', 'PARTNER_EMPLOYEE', 'MANAGER'] as const
export type  MobileRole   = typeof MOBILE_ROLES[number]

const MOBILE_SECRET = new TextEncoder().encode(
  process.env.MOBILE_JWT_SECRET || 'prospeclead-mobile-jwt-secret-2024'
)

export interface MobileJWTPayload {
  sub:        string   // userId
  email:      string
  nome:       string
  role:       string
  tenantId:   string | null
  tenantNome: string | null
  tokenId:    string   // ID do registro em MobileToken
  type:       'mobile'
  [key: string]: unknown  // index signature for jose compatibility
}

// ─── Criar token mobile (30 dias) ────────────────────────────────────────────
export async function createMobileToken(
  userId: string,
  email: string,
  nome: string,
  role: string,
  tenantId: string | null,
  tenantNome: string | null,
  deviceInfo?: string,
): Promise<{ token: string; tokenId: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 dias

  // Registrar no banco para controle
  const record = await prisma.mobileToken.create({
    data: {
      userId,
      token:      'pending', // placeholder — atualiza abaixo
      deviceInfo: deviceInfo ?? null,
      expiresAt,
    },
  })

  const token = await new SignJWT({
    sub:        userId,
    email,
    nome,
    role,
    tenantId,
    tenantNome,
    tokenId:    record.id,
    type:       'mobile',
  } as MobileJWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(MOBILE_SECRET)

  // Atualizar com o token real
  await prisma.mobileToken.update({
    where: { id: record.id },
    data:  { token },
  })

  return { token, tokenId: record.id, expiresAt }
}

// ─── Verificar token mobile do header Authorization: Bearer <token> ──────────
export async function verifyMobileToken(
  req: NextRequest,
): Promise<MobileJWTPayload | null> {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7).trim()
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, MOBILE_SECRET)
    const p = payload as unknown as MobileJWTPayload

    if (p.type !== 'mobile') return null

    // Verificar se o token não foi revogado no banco
    const record = await prisma.mobileToken.findUnique({
      where: { token },
    })
    if (!record || record.revoked) return null
    if (record.expiresAt < new Date()) return null

    // Atualizar lastUsedAt (fire-and-forget)
    prisma.mobileToken.update({
      where: { id: record.id },
      data:  { lastUsedAt: new Date() },
    }).catch(() => {})

    return p
  } catch {
    return null
  }
}

// ─── Resposta de erro padronizada para o mobile ───────────────────────────────
export function mobileError(
  message: string,
  code: string,
  status: number,
  details?: Record<string, string>,
) {
  return Response.json(
    { success: false, error: { code, message, details } },
    { status },
  )
}

// ─── Resposta de sucesso padronizada para o mobile ───────────────────────────
export function mobileOk<T>(data: T, status = 200) {
  return Response.json({ success: true, ...data }, { status })
}

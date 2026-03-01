import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'prospeclead-super-secret-key-2024'
)

export interface JWTPayload {
  userId: string
  email: string
  nome: string
  role: 'ADMIN_MASTER' | 'FINANCIAL' | 'MANAGER' | 'PROMOTER' | 'PARTNER_EMPLOYEE'
  tenantId: string | null
  tenantNome: string | null
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = cookies()
  const token = cookieStore.get('prospeclead-token')?.value
  if (!token) return null
  return verifyToken(token)
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    ADMIN_MASTER: 'Admin Master',
    FINANCIAL: 'Financeiro',
    MANAGER: 'Gestor',
    PROMOTER: 'Promotor',
    PARTNER_EMPLOYEE: 'Parceiro',
  }
  return labels[role] || role
}

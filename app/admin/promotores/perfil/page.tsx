import { getSession } from '@/lib/auth'
import { redirect }   from 'next/navigation'
import { prisma }     from '@/lib/prisma'
import PerfilPromotorClient from './PerfilPromotorClient'

export const metadata = { title: 'Meu Perfil — ProspecLead' }

export default async function PerfilPromotorPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Busca perfil completo do usuário logado
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, nome: true, email: true,
      telefone: true, cpf: true,
      avatarUrl: true, fotoUrl: true,
      role: true,
      pixKeyType: true, pixKey: true,
      pixVerified: true,
      cpfPhotoUrl: true,
      kycStatus: true, kycNote: true,
      tenant: { select: { nome: true } },
    },
  })

  if (!user) redirect('/login')

  const roleLabel: Record<string, string> = {
    PROMOTER:         'Promotor de Rua',
    PARTNER_EMPLOYEE: 'Funcionário PDV',
    MANAGER:          'Gestor',
    FINANCIAL:        'Financeiro',
    ADMIN_MASTER:     'Admin Master',
  }

  const initialPerfil = {
    id:          user.id,
    nome:        user.nome,
    email:       user.email,
    telefone:    user.telefone    ?? '',
    cpf:         user.cpf         ?? '',
    role:        roleLabel[user.role] ?? user.role,
    tenant:      user.tenant?.nome ?? '',
    avatarUrl:   user.avatarUrl   ?? null,
    fotoUrl:     user.fotoUrl     ?? null,
    cpfPhotoUrl: user.cpfPhotoUrl ?? null,
    kycStatus:   (user.kycStatus  ?? 'PENDING_REVIEW') as 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED',
    kycNote:     user.kycNote     ?? null,
    pixKeyType:  (user.pixKeyType ?? null) as 'CPF' | 'EMAIL' | 'TELEFONE' | 'CNPJ' | 'ALEATORIA' | null,
    pixKey:      user.pixKey      ?? null,
    pixVerified: user.pixVerified ?? false,
  }

  return <PerfilPromotorClient initialPerfil={initialPerfil}/>
}

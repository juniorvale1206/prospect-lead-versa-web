import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import FilaPdvClient from './FilaPdvClient'

export const metadata = { title: 'Fila de Oportunidades PDV | ProspecLead' }

export default async function FilaPdvPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const allowed = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']
  if (!allowed.includes(session.role)) redirect('/acesso-negado')
  return (
    <FilaPdvClient
      session={{ role: session.role, nome: session.nome, tenantId: session.tenantId }}
    />
  )
}

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ConfiguracoesClient from './ConfiguracoesClient'

export const dynamic  = 'force-dynamic'
export const metadata = { title: 'Configurações & Integrações | ProspecLead' }

export default async function ConfiguracoesPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['ADMIN_MASTER', 'MANAGER', 'FINANCIAL'].includes(session.role)) redirect('/acesso-negado')

  return (
    <ConfiguracoesClient
      tenantId={session.tenantId ?? ''}
      role={session.role}
      userName={session.nome}
    />
  )
}

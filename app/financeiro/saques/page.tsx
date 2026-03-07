import { getSession } from '@/lib/auth'
import { redirect }   from 'next/navigation'
import SaquesClient   from './SaquesClient'

export const metadata = { title: 'Gestão de Saques — ProspecLead' }

export default async function SaquesPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'ADMIN_MASTER' && session.role !== 'FINANCIAL') {
    redirect('/acesso-negado')
  }
  return <SaquesClient userRole={session.role} />
}

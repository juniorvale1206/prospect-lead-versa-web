import { getSession } from '@/lib/auth'
import { redirect }   from 'next/navigation'
import ComissoesClientPage from './ComissoesClient'

export const metadata = { title: 'Comissões e Fechamento — ProspecLead' }

export default async function ComissoesPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'ADMIN_MASTER' && session.role !== 'FINANCIAL') {
    redirect('/acesso-negado')
  }
  return <ComissoesClientPage />
}

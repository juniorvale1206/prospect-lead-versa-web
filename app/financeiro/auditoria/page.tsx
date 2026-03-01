import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AuditoriaClientPage from './AuditoriaClient'

export default async function AuditoriaPage() {
  const session = await getSession()

  if (!session) redirect('/login')
  if (session.role === 'MANAGER') redirect('/acesso-negado')

  return <AuditoriaClientPage />
}

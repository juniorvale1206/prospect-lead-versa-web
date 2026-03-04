import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import GestaoMarcasClient from './GestaoMarcasClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gestão de Marcas | ProspecLead' }

export default async function TenantsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'ADMIN_MASTER') redirect('/acesso-negado')
  return <GestaoMarcasClient />
}

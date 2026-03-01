import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ProdutosClient from './ProdutosClient'

export const metadata = { title: 'Catálogo e Comissionamento | ProspecLead' }

export default async function ProdutosPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'ADMIN_MASTER') redirect('/acesso-negado')
  return <ProdutosClient />
}

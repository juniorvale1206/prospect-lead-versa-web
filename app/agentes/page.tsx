import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AgentesListClient from './AgentesListClient'

export default async function AgentesPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <AgentesListClient session={{ role: session.role, tenantId: session.tenantId }} />
}

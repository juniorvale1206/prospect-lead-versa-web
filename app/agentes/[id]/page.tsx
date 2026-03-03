import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AgentBuilderClient from './AgentBuilderClient'

export default async function AgentBuilderPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')
  return <AgentBuilderClient agentId={params.id} session={{ role: session.role, nome: session.nome, tenantId: session.tenantId }} />
}

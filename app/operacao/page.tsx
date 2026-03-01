import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import KanbanClient from './KanbanClient'

export const metadata = { title: 'Operação — Kanban | ProspecLead' }

export default async function OperacaoPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  // Todos os roles autenticados podem ver o Kanban
  return (
    <KanbanClient
      userRole={session.role}
      userTenantId={session.tenantId ?? null}
      userName={session.nome}
    />
  )
}

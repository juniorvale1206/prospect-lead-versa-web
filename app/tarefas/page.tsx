import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import TarefasClient from './TarefasClient'

export const dynamic = 'force-dynamic'

export default async function TarefasPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <TarefasClient
      role={session.role}
      userId={session.userId}
      tenantId={session.tenantId ?? ''}
    />
  )
}

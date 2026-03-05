import { redirect }   from 'next/navigation'
import { getSession }  from '@/lib/auth'
import LeadProfileClient from './LeadProfileClient'

export const dynamic  = 'force-dynamic'
export const metadata = { title: 'Perfil do Lead | ProspecLead' }

export default async function LeadProfilePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <LeadProfileClient
      leadId={params.id}
      userRole={session.role}
      userName={session.nome}
      tenantId={session.tenantId ?? null}
    />
  )
}

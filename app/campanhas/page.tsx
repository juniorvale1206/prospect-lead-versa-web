import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import CampanhasDashboard from './CampanhasDashboard'

export const metadata = { title: 'Campanhas WhatsApp | ProspecLead' }

export default async function CampanhasPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <CampanhasDashboard
      session={{ role: session.role, nome: session.nome, tenantId: session.tenantId }}
    />
  )
}

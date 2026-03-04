import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import RadarB2BClient from './RadarB2BClient'

export const metadata = { title: 'Radar B2B — Prospecção Ativa | ProspecLead' }

export default async function RadarB2BPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <RadarB2BClient
      session={{ role: session.role, nome: session.nome, tenantId: session.tenantId }}
    />
  )
}

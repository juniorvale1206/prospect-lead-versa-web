import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import NovaCampanhaWizard from './NovaCampanhaWizard'

export default async function NovaCampanhaPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <NovaCampanhaWizard session={{ role: session.role, nome: session.nome, tenantId: session.tenantId }} />
}

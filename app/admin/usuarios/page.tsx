import { getSession }    from '@/lib/auth'
import { redirect }      from 'next/navigation'
import UsuariosClient    from './UsuariosClient'

export const metadata = { title: 'Usuários do Sistema — ProspecLead' }

export default async function UsuariosPage() {
  const session = await getSession()
  if (!session)                        redirect('/login')
  if (session.role !== 'ADMIN_MASTER') redirect('/acesso-negado')

  return <UsuariosClient currentUserId={session.userId} />
}

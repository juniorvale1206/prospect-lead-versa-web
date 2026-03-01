import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Sidebar from '@/components/sidebar/Sidebar'
import Header from '@/components/sidebar/Header'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'ADMIN_MASTER') redirect('/acesso-negado')

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar user={{ email: session.email, nome: session.nome, role: session.role, tenantNome: session.tenantNome }} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={{ nome: session.nome, email: session.email, role: session.role }} />
        <main className="flex-1 overflow-y-auto bg-gray-950 p-6">{children}</main>
      </div>
    </div>
  )
}

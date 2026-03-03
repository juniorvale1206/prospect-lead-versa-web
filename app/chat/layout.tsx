import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Sidebar from '@/components/sidebar/Sidebar'
import Header from '@/components/sidebar/Header'

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  const allowed = ['ADMIN_MASTER', 'MANAGER', 'FINANCIAL']
  if (!allowed.includes(session.role)) redirect('/acesso-negado')
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar user={{ email: session.email, nome: session.nome, role: session.role, tenantNome: session.tenantNome }} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={{ nome: session.nome, email: session.email, role: session.role }} />
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}

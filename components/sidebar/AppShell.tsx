import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Sidebar from '@/components/sidebar/Sidebar'
import Header from '@/components/sidebar/Header'

async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar user={{ email: session.email, nome: session.nome, role: session.role, tenantNome: session.tenantNome }} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={{ nome: session.nome, email: session.email, role: session.role }} />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  )
}

export default AppShell

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Sidebar from '@/components/sidebar/Sidebar'
import Header from '@/components/sidebar/Header'
import type { Role } from '@/lib/navigation'

export default async function RadarB2BLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={{
        email:      session.email,
        nome:       session.nome,
        role:       session.role as Role,
        tenantNome: session.tenantNome ?? null,
      }} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={{ nome: session.nome, email: session.email, role: session.role }} />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

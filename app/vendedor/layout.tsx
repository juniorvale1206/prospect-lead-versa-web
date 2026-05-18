import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import VendedorSidebar from '@/components/vendedor/VendedorSidebar'

export default async function VendedorLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['PARTNER_EMPLOYEE', 'ADMIN_MASTER', 'MANAGER'].includes(session.role)) redirect('/acesso-negado')

  return (
    <div className="flex min-h-screen bg-slate-50">
      <VendedorSidebar
        user={{
          nome:       session.nome,
          email:      session.email,
          role:       session.role,
          tenantNome: session.tenantNome,
        }}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}

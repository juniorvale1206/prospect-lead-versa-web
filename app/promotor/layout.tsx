import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import PromoterSidebar from '@/components/promotor/PromoterSidebar'

export default async function PromotorLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['PROMOTER', 'ADMIN_MASTER', 'MANAGER'].includes(session.role)) redirect('/acesso-negado')

  return (
    <div className="flex min-h-screen bg-slate-50">
      <PromoterSidebar
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

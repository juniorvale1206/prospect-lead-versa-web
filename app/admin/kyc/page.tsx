import { getSession }  from '@/lib/auth'
import { redirect }    from 'next/navigation'
import KycReviewClient from './KycReviewClient'

export const metadata = { title: 'Revisão KYC — ProspecLead' }

export default async function KycReviewPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['ADMIN_MASTER', 'FINANCIAL'].includes(session.role)) redirect('/app')

  return <KycReviewClient />
}

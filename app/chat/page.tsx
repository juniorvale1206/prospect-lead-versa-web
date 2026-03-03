import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ChatInboxClient from './ChatInboxClient'

export default async function ChatPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <ChatInboxClient
      session={{ role: session.role, nome: session.nome, userId: session.userId, tenantId: session.tenantId }}
    />
  )
}

import { redirect } from 'next/navigation'
// /vendedor/novo-lead → redireciona para leads com modal flag
export default function NovoLeadPage() {
  redirect('/vendedor/leads')
}

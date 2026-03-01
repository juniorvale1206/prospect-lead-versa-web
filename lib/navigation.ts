export type Role = 'ADMIN_MASTER' | 'FINANCIAL' | 'MANAGER'

export interface NavItem {
  label: string
  href: string
  icon: string
  badge?: string
}

export function getNavItems(role: Role): NavItem[] {
  if (role === 'ADMIN_MASTER') {
    return [
      { label: 'Dashboard Global',         href: '/dashboard',         icon: 'dashboard'  },
      { label: 'Catálogo e Comissões',        href: '/admin/produtos',     icon: 'products'   },
      { label: 'Gestão de Marcas',            href: '/admin/tenants',      icon: 'building'   },
      { label: 'Usuários',                    href: '/admin/usuarios',     icon: 'users'      },
      { label: 'Configurações',               href: '/admin/configuracoes',icon: 'settings'   },
    ]
  }

  if (role === 'FINANCIAL') {
    return [
      { label: 'Dashboard Financeiro', href: '/financeiro', icon: 'chart' },
      { label: 'Auditoria de Placas', href: '/financeiro/auditoria', icon: 'audit' },
      { label: 'Comissões', href: '/financeiro/comissoes', icon: 'commission' },
      { label: 'Extratos', href: '/financeiro/extratos', icon: 'extract' },
    ]
  }

  // MANAGER
  return [
    { label: 'Operação (Kanban)', href: '/operacao', icon: 'kanban' },
    { label: 'Equipe (Promotores)', href: '/operacao/equipe', icon: 'team' },
    { label: 'Mapa de Calor', href: '/operacao/mapa', icon: 'map' },
  ]
}

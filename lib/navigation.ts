export type Role = 'ADMIN_MASTER' | 'FINANCIAL' | 'MANAGER'

export interface NavItem {
  label:   string
  href:    string
  icon:    string
  badge?:  string
  section?: string
}

export function getNavItems(role: Role): NavItem[] {
  if (role === 'ADMIN_MASTER') {
    return [
      // Visão geral
      { label: 'Dashboard Global',       href: '/dashboard',          icon: 'dashboard', section: 'Visão Geral'  },
      // Operação (acesso total)
      { label: 'Kanban — Funil',         href: '/operacao',           icon: 'kanban',    section: 'Operação'     },
      // Admin
      { label: 'Catálogo e Comissões',   href: '/admin/produtos',     icon: 'products',  section: 'Administração'},
      { label: 'Gestão de Marcas',       href: '/admin/tenants',      icon: 'building',  section: 'Administração'},
      { label: 'Usuários',               href: '/admin/usuarios',     icon: 'users',     section: 'Administração'},
      { label: 'Configurações',          href: '/admin/configuracoes',icon: 'settings',  section: 'Administração'},
      // Financeiro
      { label: 'Auditoria de Fotos',     href: '/financeiro/auditoria',icon: 'audit',    section: 'Financeiro'   },
    ]
  }

  if (role === 'FINANCIAL') {
    return [
      { label: 'Dashboard Financeiro',   href: '/financeiro',             icon: 'chart',      section: 'Visão Geral' },
      { label: 'Auditoria de Fotos',     href: '/financeiro/auditoria',   icon: 'audit',      section: 'Financeiro'  },
      { label: 'Kanban — Funil',         href: '/operacao',               icon: 'kanban',     section: 'Operação'    },
      { label: 'Comissões',              href: '/financeiro/comissoes',   icon: 'commission', section: 'Financeiro'  },
      { label: 'Extratos',               href: '/financeiro/extratos',    icon: 'extract',    section: 'Financeiro'  },
    ]
  }

  // MANAGER
  return [
    { label: 'Kanban — Funil',         href: '/operacao',         icon: 'kanban', section: 'Operação'    },
    { label: 'Equipe (Promotores)',    href: '/operacao/equipe',  icon: 'team',   section: 'Operação'    },
    { label: 'Mapa de Calor',          href: '/operacao/mapa',    icon: 'map',    section: 'Operação'    },
  ]
}

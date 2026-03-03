export type Role = 'ADMIN_MASTER' | 'FINANCIAL' | 'MANAGER' | 'PROMOTER' | 'PARTNER_EMPLOYEE'

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
      { label: 'Dashboard Global',       href: '/dashboard',                     icon: 'dashboard',  section: 'Visão Geral'   },
      // Omnichannel IA
      { label: 'Caixa de Entrada',       href: '/chat',                          icon: 'chat',       section: 'Omnichannel IA' },
      { label: 'Agentes de IA',          href: '/agentes',                       icon: 'robot',      section: 'Omnichannel IA' },
      // Operação (acesso total)
      { label: 'Kanban — Funil',         href: '/operacao',                      icon: 'kanban',     section: 'Operação'      },
      // Admin
      { label: 'Catálogo e Comissões',   href: '/admin/produtos',                icon: 'products',   section: 'Administração' },
      { label: 'Gestão de Marcas',       href: '/admin/tenants',                 icon: 'building',   section: 'Administração' },
      { label: 'Promotores',             href: '/admin/promotores',              icon: 'team',       section: 'Administração' },
      { label: 'Usuários',               href: '/admin/usuarios',                icon: 'users',      section: 'Administração' },
      { label: 'Configurações',          href: '/admin/configuracoes',           icon: 'settings',   section: 'Administração' },
      // Financeiro
      { label: 'Auditoria de Fotos',     href: '/financeiro/auditoria',          icon: 'audit',      section: 'Financeiro'    },
      { label: 'Comissões & KYC',        href: '/financeiro/comissoes',          icon: 'commission', section: 'Financeiro'    },
      { label: 'Revisão KYC',            href: '/admin/kyc',                     icon: 'shield',     section: 'Financeiro'    },
    ]
  }

  if (role === 'FINANCIAL') {
    return [
      { label: 'Dashboard Financeiro',   href: '/financeiro',                    icon: 'chart',      section: 'Visão Geral' },
      { label: 'Auditoria de Fotos',     href: '/financeiro/auditoria',          icon: 'audit',      section: 'Financeiro'  },
      { label: 'Kanban — Funil',         href: '/operacao',                      icon: 'kanban',     section: 'Operação'    },
      { label: 'Comissões',              href: '/financeiro/comissoes',          icon: 'commission', section: 'Financeiro'  },
      { label: 'Revisão KYC',            href: '/admin/kyc',                     icon: 'shield',     section: 'Financeiro'  },
      { label: 'Extratos',               href: '/financeiro/extratos',           icon: 'extract',    section: 'Financeiro'  },
    ]
  }

  if (role === 'MANAGER') {
    return [
      { label: 'Kanban — Funil',         href: '/operacao',                      icon: 'kanban',     section: 'Operação'      },
      { label: 'Equipe (Promotores)',    href: '/operacao/equipe',               icon: 'team',       section: 'Operação'      },
      { label: 'Mapa de Calor',          href: '/operacao/mapa',                 icon: 'map',        section: 'Operação'      },
      { label: 'Promotores',             href: '/admin/promotores',              icon: 'users',      section: 'Gestão'        },
      { label: 'Fila de Aprovação',      href: '/admin/promotores/aprovacoes',   icon: 'audit',      section: 'Gestão'        },
    ]
  }

  // PROMOTER / PARTNER_EMPLOYEE — acesso somente via app mobile (Flutter)
  // Essas roles não usam o painel web — são redirecionadas ao login
  return []
}

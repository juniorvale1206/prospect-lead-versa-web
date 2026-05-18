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
      { label: 'Motor de Campanhas',     href: '/campanhas',                     icon: 'megaphone',  section: 'Omnichannel IA' },
      { label: 'Radar B2B',              href: '/radar-b2b',                     icon: 'radar',      section: 'Omnichannel IA' },
      // Operação (acesso total)
      { label: 'Tarefas & Agenda',        href: '/tarefas',                       icon: 'tasks',      section: 'Operação'      },
      { label: 'Kanban — Funil',         href: '/operacao',                      icon: 'kanban',     section: 'Operação'      },
      // Admin
      { label: 'Catálogo e Comissões',   href: '/admin/produtos',                icon: 'products',   section: 'Administração' },
      { label: 'Gestão de Marcas',       href: '/admin/tenants',                 icon: 'building',   section: 'Administração' },
      { label: 'Promotores',             href: '/admin/promotores',              icon: 'team',       section: 'Administração' },
      { label: 'Usuários',               href: '/admin/usuarios',                icon: 'users',      section: 'Administração' },
      { label: 'Configurações',          href: '/admin/configuracoes',           icon: 'settings',   section: 'Administração' },
      // Pedidos & Pagamentos
      { label: 'Pedidos B2B/B2C',        href: '/admin/pedidos',                 icon: 'products',   section: 'Pagamentos'    },
      { label: 'Pagamentos & Stripe',    href: '/admin/pagamentos',              icon: 'wallet',     section: 'Pagamentos'    },
      { label: 'Nova Assinatura',        href: '/checkout',                      icon: 'commission', section: 'Pagamentos'    },
      { label: 'Agenda & Técnicos',      href: '/admin/agenda',                  icon: 'calendar',   section: 'Pagamentos'    },
      // Financeiro
      { label: 'Comissões VAPEC',        href: '/admin/comissoes',               icon: 'commission', section: 'Financeiro'    },
      { label: 'Auditoria de Fotos',     href: '/financeiro/auditoria',          icon: 'audit',      section: 'Financeiro'    },
      { label: 'Comissões & KYC',        href: '/financeiro/comissoes',          icon: 'commission', section: 'Financeiro'    },
      { label: 'Revisão KYC',            href: '/admin/kyc',                     icon: 'shield',     section: 'Financeiro'    },
      { label: 'Saques PIX',             href: '/financeiro/saques',             icon: 'wallet',     section: 'Financeiro'    },
      // Rede PDV
      { label: 'Leads PDV',              href: '/admin/leads/pdv',               icon: 'building',   section: 'Rede PDV'      },
      { label: 'Fila de Oportunidades',  href: '/campanhas/fila-pdv',            icon: 'kanban',     section: 'Rede PDV'      },
    ]
  }

  if (role === 'FINANCIAL') {
    return [
      { label: 'Dashboard Financeiro',   href: '/financeiro',                    icon: 'chart',      section: 'Visão Geral'   },
      { label: 'Caixa de Entrada',       href: '/chat',                          icon: 'chat',       section: 'Omnichannel IA' },
      { label: 'Motor de Campanhas',     href: '/campanhas',                     icon: 'megaphone',  section: 'Omnichannel IA' },
      { label: 'Radar B2B',              href: '/radar-b2b',                     icon: 'radar',      section: 'Omnichannel IA' },
      { label: 'Tarefas & Agenda',        href: '/tarefas',                       icon: 'tasks',      section: 'Operação'      },
      { label: 'Auditoria de Fotos',     href: '/financeiro/auditoria',          icon: 'audit',      section: 'Financeiro'    },
      { label: 'Kanban — Funil',         href: '/operacao',                      icon: 'kanban',     section: 'Operação'      },
      { label: 'Comissões VAPEC',        href: '/admin/comissoes',               icon: 'commission', section: 'Financeiro'    },
      { label: 'Comissões (legacy)',      href: '/financeiro/comissoes',          icon: 'commission', section: 'Financeiro'    },
      { label: 'Pedidos B2B/B2C',        href: '/admin/pedidos',                 icon: 'products',   section: 'Pagamentos'    },
      { label: 'Pagamentos & Stripe',    href: '/admin/pagamentos',              icon: 'wallet',     section: 'Pagamentos'    },
      { label: 'Agenda & Técnicos',      href: '/admin/agenda',                  icon: 'calendar',   section: 'Pagamentos'    },
      { label: 'Revisão KYC',            href: '/admin/kyc',                     icon: 'shield',     section: 'Financeiro'    },
      { label: 'Extratos',               href: '/financeiro/extratos',           icon: 'extract',    section: 'Financeiro'    },
      { label: 'Saques PIX',             href: '/financeiro/saques',             icon: 'wallet',     section: 'Financeiro'    },
      { label: 'Leads PDV',              href: '/admin/leads/pdv',               icon: 'building',   section: 'Rede PDV'      },
      { label: 'Fila de Oportunidades',  href: '/campanhas/fila-pdv',            icon: 'kanban',     section: 'Rede PDV'      },
    ]
  }

  if (role === 'MANAGER') {
    return [
      { label: 'Tarefas & Agenda',        href: '/tarefas',                       icon: 'tasks',      section: 'Operação'      },
      { label: 'Kanban — Funil',         href: '/operacao',                      icon: 'kanban',     section: 'Operação'      },
      { label: 'Equipe (Promotores)',    href: '/operacao/equipe',               icon: 'team',       section: 'Operação'      },
      { label: 'Mapa de Calor',          href: '/operacao/mapa',                 icon: 'map',        section: 'Operação'      },
      { label: 'Caixa de Entrada',       href: '/chat',                          icon: 'chat',       section: 'Omnichannel IA' },
      { label: 'Agentes de IA',          href: '/agentes',                       icon: 'robot',      section: 'Omnichannel IA' },
      { label: 'Motor de Campanhas',     href: '/campanhas',                     icon: 'megaphone',  section: 'Omnichannel IA' },
      { label: 'Radar B2B',              href: '/radar-b2b',                     icon: 'radar',      section: 'Omnichannel IA' },
      { label: 'Promotores',             href: '/admin/promotores',              icon: 'users',      section: 'Gestão'        },
      { label: 'Fila de Aprovação',      href: '/admin/promotores/aprovacoes',   icon: 'audit',      section: 'Gestão'        },
      { label: 'Leads PDV',              href: '/admin/leads/pdv',               icon: 'building',   section: 'Rede PDV'      },
      { label: 'Fila de Oportunidades',  href: '/campanhas/fila-pdv',            icon: 'kanban',     section: 'Rede PDV'      },
    ]
  }

  // PROMOTER / PARTNER_EMPLOYEE — acesso somente via app mobile (Flutter)
  // Essas roles não usam o painel web — são redirecionadas ao login
  return []
}

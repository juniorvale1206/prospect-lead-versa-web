import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const PLATE_PHOTOS = [
  'https://images.unsplash.com/photo-1603386329225-868f9b1ee6c9?w=800&q=80',
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
  'https://images.unsplash.com/photo-1549924231-f129b911e442?w=800&q=80',
  'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=80',
  'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80',
]

async function main() {
  console.log('🌱 Iniciando seed completo...')

  /* ── Tenants ─────────────────────────────── */
  const tenant1 = await prisma.tenant.upsert({
    where: { slug: 'rastremix' }, update: {},
    create: { nome: 'Rastremix', slug: 'rastremix', ativo: true },
  })
  const tenant2 = await prisma.tenant.upsert({
    where: { slug: 'valeteck' }, update: {},
    create: { nome: 'Valeteck', slug: 'valeteck', ativo: true },
  })
  const tenant3 = await prisma.tenant.upsert({
    where: { slug: 'gpslove' }, update: {},
    create: { nome: 'Gps Love', slug: 'gpslove', ativo: true },
  })
  console.log('✅ Tenants:', tenant1.nome, '|', tenant2.nome, '|', tenant3.nome)

  /* ── Usuários ────────────────────────────── */
  const senha = await bcrypt.hash('123456', 12)

  const adminMaster = await prisma.user.upsert({
    where: { email: 'admin@prospeclead.com' }, update: {},
    create: { email: 'admin@prospeclead.com', password: senha, nome: 'Admin Master', role: 'ADMIN_MASTER', ativo: true },
  })
  const financeiro = await prisma.user.upsert({
    where: { email: 'financeiro@prospeclead.com' }, update: {},
    create: { email: 'financeiro@prospeclead.com', password: senha, nome: 'Financeiro', role: 'FINANCIAL', ativo: true },
  })
  const gestor = await prisma.user.upsert({
    where: { email: 'gestor@prospeclead.com' }, update: {},
    create: { email: 'gestor@prospeclead.com', password: senha, nome: 'Gestor Rastremix', role: 'MANAGER', tenantId: tenant1.id, ativo: true },
  })

  // Promotores da equipe (MANAGER — acesso ao painel web + app mobile)
  const promotor1 = await prisma.user.upsert({
    where: { email: 'ana.silva@prospeclead.com' }, update: {},
    create: { email: 'ana.silva@prospeclead.com', password: senha, nome: 'Ana Silva', role: 'MANAGER', tenantId: tenant1.id, ativo: true },
  })
  const promotor2 = await prisma.user.upsert({
    where: { email: 'joao.costa@prospeclead.com' }, update: {},
    create: { email: 'joao.costa@prospeclead.com', password: senha, nome: 'João Costa', role: 'MANAGER', tenantId: tenant1.id, ativo: true },
  })
  const promotor3 = await prisma.user.upsert({
    where: { email: 'mariana.ramos@prospeclead.com' }, update: {},
    create: { email: 'mariana.ramos@prospeclead.com', password: senha, nome: 'Mariana Ramos', role: 'MANAGER', tenantId: tenant2.id, ativo: true },
  })
  const promotor4 = await prisma.user.upsert({
    where: { email: 'lucas.ferreira@prospeclead.com' }, update: {},
    create: { email: 'lucas.ferreira@prospeclead.com', password: senha, nome: 'Lucas Ferreira', role: 'MANAGER', tenantId: tenant2.id, ativo: true },
  })

  // ── Promotores mobile exclusivos (role PROMOTER — apenas app Flutter) ────
  const mobilePromotor1 = await prisma.user.upsert({
    where: { email: 'promotor.rastremix@prospeclead.com' }, update: {},
    create: {
      email: 'promotor.rastremix@prospeclead.com',
      password: senha,
      nome: 'Carlos Promotor',
      role: 'PROMOTER',
      tenantId: tenant1.id,
      ativo: true,
      telefone: '(31) 98800-1234',
    },
  })
  const mobilePromotor2 = await prisma.user.upsert({
    where: { email: 'promotor.valeteck@prospeclead.com' }, update: {},
    create: {
      email: 'promotor.valeteck@prospeclead.com',
      password: senha,
      nome: 'Beatriz Promotora',
      role: 'PROMOTER',
      tenantId: tenant2.id,
      ativo: true,
      telefone: '(11) 97700-5678',
    },
  })

  // ── Funcionário parceiro (role PARTNER_EMPLOYEE — pdv/revendedor) ─────────
  const partnerEmployee = await prisma.user.upsert({
    where: { email: 'parceiro.gpslove@prospeclead.com' }, update: {},
    create: {
      email: 'parceiro.gpslove@prospeclead.com',
      password: senha,
      nome: 'Diego Parceiro',
      role: 'PARTNER_EMPLOYEE',
      tenantId: tenant3.id,
      ativo: true,
      telefone: '(47) 96600-9999',
    },
  })

  console.log('✅ Usuários + Promotores criados (senha: 123456)')
  console.log('   promotor.rastremix@prospeclead.com → PROMOTER (Rastremix)')
  console.log('   promotor.valeteck@prospeclead.com  → PROMOTER (Valeteck)')
  console.log('   parceiro.gpslove@prospeclead.com   → PARTNER_EMPLOYEE (Gps Love)')

  /* ── Produtos ────────────────────────────── */
  await prisma.product.deleteMany({})
  await prisma.product.createMany({ data: [
    { name: 'Antifurto Partida Remota',       type: 'HARDWARE',          price: 299.90, commissionPercentage: 30, isActive: true  },
    { name: 'Rastreador Conect GPS Pro',       type: 'HARDWARE',          price: 450.00, commissionPercentage: 30, isActive: true,  tenantId: tenant1.id },
    { name: 'Kit Câmera ADAS + DMS',           type: 'HARDWARE',          price: 1200.00,commissionPercentage: 30, isActive: true  },
    { name: 'Sensor de Fadiga FatigueGuard',   type: 'HARDWARE',          price: 890.00, commissionPercentage: 30, isActive: true,  tenantId: tenant2.id },
    { name: 'Adesão Plano Rastremix Básico',   type: 'SUBSCRIPTION_PLAN', price: 99.90,  commissionPercentage: 30, isActive: true,  tenantId: tenant1.id },
    { name: 'Plano Valeteck Premium Anual',    type: 'SUBSCRIPTION_PLAN', price: 599.00, commissionPercentage: 30, isActive: true,  tenantId: tenant2.id },
    { name: 'Plano Gps Love Motoboy',          type: 'SUBSCRIPTION_PLAN', price: 149.90, commissionPercentage: 30, isActive: true,  tenantId: tenant3.id },
    { name: 'Combo Rastreador + Adesão',       type: 'SUBSCRIPTION_PLAN', price: 749.80, commissionPercentage: 30, isActive: true  },
    { name: 'Bloqueador Imobilizador Smart',   type: 'HARDWARE',          price: 179.90, commissionPercentage: 30, isActive: false },
  ]})
  console.log('✅ 9 produtos criados')

  /* ── Leads — Auditoria + Kanban ───────────── */
  await prisma.lead.deleteMany({})

  // ── B2C: Leads de auditoria de placa ──────────────────────────────────────
  const b2cAuditoria = [
    {
      leadType: 'B2C', nomeCliente: 'Carlos Alberto Mendes',
      telefone: '(31) 99821-4455', email: 'carlos.mendes@email.com',
      veiculo: 'Toyota Hilux SW4 2022', placa: 'BRA2E19', praca: 'Belo Horizonte - MG',
      platePhotoUrl: PLATE_PHOTOS[0],
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'LEAD_COLETADO',
      tenantId: tenant1.id, promotorId: promotor1.id,
      doresIdentificadas: 'Preocupado com roubo, trabalha em área de risco.',
    },
    {
      leadType: 'B2C', nomeCliente: 'Fernanda Lima Costa',
      telefone: '(11) 97654-3210', email: 'fernanda.lima@empresa.com',
      veiculo: 'Ford Ranger XLS 2021', placa: 'ABC1D23', praca: 'São Paulo - SP',
      platePhotoUrl: PLATE_PHOTOS[1],
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'IA_EM_ATENDIMENTO',
      tenantId: tenant1.id, promotorId: promotor2.id,
      doresIdentificadas: 'Financia o carro, seguro não cobre roubo eletrônico.',
    },
    {
      leadType: 'B2C', nomeCliente: 'Roberto Souza Pinto',
      telefone: '(21) 98765-5522', email: 'roberto.souza@gmail.com',
      veiculo: 'Chevrolet S10 High Country 2023', placa: 'XYZ9A87', praca: 'Rio de Janeiro - RJ',
      platePhotoUrl: PLATE_PHOTOS[2],
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'REUNIAO_AGENDADA',
      tenantId: tenant2.id, promotorId: promotor3.id,
      doresIdentificadas: 'Caminhão de entrega, precisa de controle em tempo real.',
    },
    {
      leadType: 'B2C', nomeCliente: 'Patricia Oliveira Santos',
      telefone: '(41) 97722-8899', email: 'patricia.oliveira@corp.com',
      veiculo: 'Mitsubishi L200 Triton 2022', placa: 'CWB5F88', praca: 'Curitiba - PR',
      platePhotoUrl: PLATE_PHOTOS[3],
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'LEAD_COLETADO',
      tenantId: tenant1.id, promotorId: promotor1.id,
    },
    {
      leadType: 'B2C', nomeCliente: 'Thiago Barros Ferreira',
      telefone: '(51) 98833-7766', email: 'thiago.barros@empresa.com',
      veiculo: 'Volkswagen Amarok V6 2023', placa: 'POA4K21', praca: 'Porto Alegre - RS',
      platePhotoUrl: PLATE_PHOTOS[4],
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'CONVERTIDO',
      tenantId: tenant2.id, promotorId: promotor4.id,
      doresIdentificadas: 'Acompanhou uma palestra sobre roubo de veículos, tomou a decisão.',
    },
    // Histórico auditado
    {
      leadType: 'B2C', nomeCliente: 'Marcelo Dias Ferreira',
      telefone: '(62) 91234-5678', email: 'marcelo.dias@corp.com',
      veiculo: 'Mitsubishi L200 Triton 2022', placa: 'GOI3F45', praca: 'Goiânia - GO',
      platePhotoUrl: PLATE_PHOTOS[0],
      status: 'AUDITADO_APROVADO', commissionValue: 2.00, funnelStage: 'CONVERTIDO',
      auditadoPorId: financeiro.id, auditadoEm: new Date(Date.now() - 1000*60*60*2),
      tenantId: tenant1.id, promotorId: promotor2.id,
    },
    {
      leadType: 'B2C', nomeCliente: 'Ana Paula Rodrigues',
      telefone: '(85) 93344-2211', email: 'ana.rodrigues@outlook.com',
      veiculo: 'VW Amarok V6 2023', placa: 'FOR5K78', praca: 'Fortaleza - CE',
      platePhotoUrl: PLATE_PHOTOS[1],
      status: 'AUDITADO_REJEITADO', commissionValue: 1.00, funnelStage: 'LEAD_COLETADO',
      motivoRejeicao: 'Foto desfocada — placa ilegível',
      auditadoPorId: adminMaster.id, auditadoEm: new Date(Date.now() - 1000*60*60*5),
      tenantId: tenant2.id, promotorId: promotor3.id,
    },
  ]

  // ── B2B: Leads de frota empresarial ───────────────────────────────────────
  const b2bLeads = [
    {
      leadType: 'B2B', nomeCliente: 'Diretor Logística — TransBrasil',
      telefone: '(11) 3344-5566', email: 'logistica@transbrasil.com.br',
      veiculo: '', placa: '', praca: 'São Paulo - SP',
      cnpj: '12.345.678/0001-90',
      empresaNome: 'TransBrasil Logística Ltda',
      frota: '47 caminhões',
      segmento: 'Transporte de Carga',
      doresIdentificadas: 'Alto índice de roubo de carga, frota sem rastreamento centralizado. Perda de 3 caminhões em 2024.',
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'LEAD_COLETADO',
      tenantId: tenant1.id, promotorId: gestor.id,
    },
    {
      leadType: 'B2B', nomeCliente: 'Gerente de Frota — MineraMax',
      telefone: '(31) 98877-4422', email: 'frota@mineramax.com.br',
      veiculo: '', placa: '', praca: 'Belo Horizonte - MG',
      cnpj: '98.765.432/0001-11',
      empresaNome: 'MineraMax Mineração S/A',
      frota: '120 equipamentos (motoniveladoras, escavadeiras)',
      segmento: 'Mineração',
      doresIdentificadas: 'Equipamentos de alto valor em áreas remotas, sem controle de acesso ou geofencing.',
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'IA_EM_ATENDIMENTO',
      tenantId: tenant1.id, promotorId: promotor1.id,
    },
    {
      leadType: 'B2B', nomeCliente: 'CEO — Distribuidora VitaFresh',
      telefone: '(47) 99911-3344', email: 'ceo@vitafresh.com.br',
      veiculo: '', placa: '', praca: 'Joinville - SC',
      cnpj: '55.444.333/0001-22',
      empresaNome: 'VitaFresh Distribuidora',
      frota: '18 furgões refrigerados',
      segmento: 'Distribuição de Alimentos',
      doresIdentificadas: 'Produto perecível exige rastreio de temperatura + localização. Falhas custam perdas de R$ 40k/mês.',
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'REUNIAO_AGENDADA',
      tenantId: tenant2.id, promotorId: promotor3.id,
    },
    {
      leadType: 'B2B', nomeCliente: 'Diretor de Operações — Vale do Ouro Construtora',
      telefone: '(62) 98800-1122', email: 'operacoes@valdoouro.com.br',
      veiculo: '', placa: '', praca: 'Goiânia - GO',
      cnpj: '77.888.999/0001-33',
      empresaNome: 'Vale do Ouro Construtora',
      frota: '35 veículos + 12 maquinas',
      segmento: 'Construção Civil',
      doresIdentificadas: 'Obras em regiões periféricas, veículos partem sem autorização após o expediente.',
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'CONVERTIDO',
      tenantId: tenant1.id, promotorId: promotor2.id,
    },
    {
      leadType: 'B2B', nomeCliente: 'TI Manager — FastDelivery Express',
      telefone: '(85) 97766-5544', email: 'ti@fastdelivery.com.br',
      veiculo: '', placa: '', praca: 'Fortaleza - CE',
      cnpj: '44.333.222/0001-55',
      empresaNome: 'FastDelivery Express',
      frota: '60 motos + 8 vans',
      segmento: 'Entrega Rápida (Last Mile)',
      doresIdentificadas: 'Integração com sistema ERP, API necessária. Motoristas com comportamento de risco elevado.',
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'IA_EM_ATENDIMENTO',
      tenantId: tenant2.id, promotorId: promotor4.id,
    },
  ]

  // ── Leads gerados pelo promotor mobile (para teste do dashboard) ─────────
  const leadsMobilePromotor = [
    // Leads de hoje (para bônus do dia)
    {
      leadType: 'B2C', nomeCliente: 'Wagner Alves Neto',
      telefone: '(31) 99900-1111', email: 'wagner.neto@gmail.com',
      veiculo: 'Fiat Toro Ranch 2023', placa: 'MGA3H11', praca: 'Contagem - MG',
      platePhotoUrl: PLATE_PHOTOS[0],
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'LEAD_COLETADO',
      tenantId: tenant1.id, promotorId: mobilePromotor1.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 min atrás
    },
    {
      leadType: 'B2C', nomeCliente: 'Sônia Pereira de Souza',
      telefone: '(31) 98811-2222', email: 'sonia.souza@outlook.com',
      veiculo: 'Jeep Compass Limited 2022', placa: 'BHZ7K22', praca: 'Belo Horizonte - MG',
      platePhotoUrl: PLATE_PHOTOS[1],
      status: 'AUDITADO_APROVADO', commissionValue: 2.00, funnelStage: 'IA_EM_ATENDIMENTO',
      auditadoPorId: financeiro.id, auditadoEm: new Date(Date.now() - 1000 * 60 * 15),
      tenantId: tenant1.id, promotorId: mobilePromotor1.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 60), // 1h atrás
    },
    {
      leadType: 'B2C', nomeCliente: 'Renato Lima dos Santos',
      telefone: '(31) 97722-3333', email: 'renato.santos@empresa.com',
      veiculo: 'Volkswagen Nivus Highline 2023', placa: 'MGL5J33', praca: 'Betim - MG',
      platePhotoUrl: PLATE_PHOTOS[2],
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'LEAD_COLETADO',
      tenantId: tenant1.id, promotorId: mobilePromotor1.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 90), // 1,5h atrás
    },
    // Lead histórico (ontem) — não conta no "hoje"
    {
      leadType: 'B2C', nomeCliente: 'Cláudia Martins Barbosa',
      telefone: '(31) 96633-4444', email: 'claudia.barbosa@email.com',
      veiculo: 'Honda HR-V EXL 2022', placa: 'MGB2F44', praca: 'Nova Lima - MG',
      platePhotoUrl: PLATE_PHOTOS[3],
      status: 'AUDITADO_APROVADO', commissionValue: 2.00, funnelStage: 'CONVERTIDO',
      auditadoPorId: financeiro.id, auditadoEm: new Date(Date.now() - 1000 * 60 * 60 * 26),
      tenantId: tenant1.id, promotorId: mobilePromotor1.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26), // ontem
    },
    {
      leadType: 'B2C', nomeCliente: 'Eduardo Pinto Carvalho',
      telefone: '(31) 95544-5555', email: 'eduardo.carvalho@gmail.com',
      veiculo: 'Chevrolet Tracker Premier 2023', placa: 'MGC9G55', praca: 'Uberlândia - MG',
      platePhotoUrl: PLATE_PHOTOS[4],
      status: 'AUDITADO_REJEITADO', commissionValue: 1.00, funnelStage: 'LEAD_COLETADO',
      motivoRejeicao: 'Foto com reflexo — placa parcialmente ilegível',
      auditadoPorId: adminMaster.id, auditadoEm: new Date(Date.now() - 1000 * 60 * 60 * 48),
      tenantId: tenant1.id, promotorId: mobilePromotor1.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48), // anteontem
    },
    // Lead do parceiro Gps Love
    {
      leadType: 'B2C', nomeCliente: 'Alexandre Rocha Mendes',
      telefone: '(47) 99955-6666', email: 'alex.rocha@email.com',
      veiculo: 'Renault Kwid Intense 2023', placa: 'JVA4L66', praca: 'Joinville - SC',
      platePhotoUrl: PLATE_PHOTOS[0],
      status: 'PENDENTE_AUDITORIA', commissionValue: 1.00, funnelStage: 'LEAD_COLETADO',
      tenantId: tenant3.id, promotorId: partnerEmployee.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 45), // 45 min atrás
    },
  ]

  for (const lead of [...b2cAuditoria, ...b2bLeads, ...leadsMobilePromotor]) {
    await prisma.lead.create({ data: lead as any })
  }

  const total = b2cAuditoria.length + b2bLeads.length + leadsMobilePromotor.length
  console.log(`✅ ${total} leads criados (${b2cAuditoria.length} B2C existentes + ${b2bLeads.length} B2B + ${leadsMobilePromotor.length} mobile)`)

  console.log('')
  console.log('═══════════════════════════════════════════════')
  console.log('🚀 SEED COMPLETO — ProspecLead')
  console.log('═══════════════════════════════════════════════')
  console.log('')
  console.log('👤 Usuários (senha: 123456):')
  console.log('   admin@prospeclead.com                   → ADMIN_MASTER')
  console.log('   financeiro@prospeclead.com               → FINANCIAL')
  console.log('   gestor@prospeclead.com                   → MANAGER (Rastremix)')
  console.log('   ana.silva@prospeclead.com                → Promotora MANAGER (Rastremix)')
  console.log('   joao.costa@prospeclead.com               → Promotor MANAGER (Rastremix)')
  console.log('   mariana.ramos@prospeclead.com            → Promotora MANAGER (Valeteck)')
  console.log('   lucas.ferreira@prospeclead.com           → Promotor MANAGER (Valeteck)')
  console.log('')
  console.log('📱 Mobile App (Flutter) — roles exclusivos:')
  console.log('   promotor.rastremix@prospeclead.com  → PROMOTER (Rastremix)')
  console.log('   promotor.valeteck@prospeclead.com   → PROMOTER (Valeteck)')
  console.log('   parceiro.gpslove@prospeclead.com    → PARTNER_EMPLOYEE (Gps Love)')
  console.log('')
  console.log('📊 Kanban B2C:')
  console.log('   LEAD_COLETADO: 3 | IA_ATENDIMENTO: 1 | REUNIAO: 1 | CONVERTIDO: 2')
  console.log('📊 Kanban B2B:')
  console.log('   LEAD_COLETADO: 1 | IA_ATENDIMENTO: 2 | REUNIAO: 1 | CONVERTIDO: 1')
}

main()
  .catch(e => { console.error('❌ Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Imagens de carros reais para teste (via picsum/unsplash público)
const PLATE_PHOTOS = [
  'https://images.unsplash.com/photo-1603386329225-868f9b1ee6c9?w=800&q=80',
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
  'https://images.unsplash.com/photo-1549924231-f129b911e442?w=800&q=80',
  'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=80',
  'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80',
]

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...')

  /* ── Tenants ─────────────────────────────── */
  const tenant1 = await prisma.tenant.upsert({
    where:  { slug: 'rastremix' },
    update: {},
    create: { nome: 'Rastremix', slug: 'rastremix', ativo: true },
  })
  const tenant2 = await prisma.tenant.upsert({
    where:  { slug: 'valeteck' },
    update: {},
    create: { nome: 'Valeteck', slug: 'valeteck', ativo: true },
  })
  const tenant3 = await prisma.tenant.upsert({
    where:  { slug: 'gpslove' },
    update: {},
    create: { nome: 'Gps Love', slug: 'gpslove', ativo: true },
  })
  console.log('✅ Tenants:', tenant1.nome, '|', tenant2.nome, '|', tenant3.nome)

  /* ── Usuários ────────────────────────────── */
  const senha = await bcrypt.hash('123456', 12)

  const adminMaster = await prisma.user.upsert({
    where:  { email: 'admin@prospeclead.com' },
    update: {},
    create: { email: 'admin@prospeclead.com', password: senha, nome: 'Admin Master', role: 'ADMIN_MASTER', ativo: true },
  })
  const financeiro = await prisma.user.upsert({
    where:  { email: 'financeiro@prospeclead.com' },
    update: {},
    create: { email: 'financeiro@prospeclead.com', password: senha, nome: 'Financeiro', role: 'FINANCIAL', ativo: true },
  })
  await prisma.user.upsert({
    where:  { email: 'gestor@prospeclead.com' },
    update: {},
    create: { email: 'gestor@prospeclead.com', password: senha, nome: 'Gestor Rastremix', role: 'MANAGER', tenantId: tenant1.id, ativo: true },
  })
  console.log('✅ Usuários criados (senha: 123456)')

  /* ── PRODUTOS ────────────────────────────── */
  await prisma.product.deleteMany({})

  const productsData = [
    // ── HARDWARE ──
    {
      name:                 'Antifurto Partida Remota',
      type:                 'HARDWARE',
      description:          'Bloqueador de partida com acionamento remoto via app. Instalação inclusa.',
      price:                299.90,
      commissionPercentage: 30,
      tenantId:             null,          // Produto global
      isActive:             true,
    },
    {
      name:                 'Rastreador Conect GPS Pro',
      type:                 'HARDWARE',
      description:          'Rastreador veicular com chip 4G, bateria interna de 30 dias e cerca eletrônica.',
      price:                450.00,
      commissionPercentage: 30,
      tenantId:             tenant1.id,    // Exclusivo Rastremix
      isActive:             true,
    },
    {
      name:                 'Kit Câmera ADAS + DMS',
      type:                 'HARDWARE',
      description:          'Videotelemetria com visão frontal ADAS e câmera DMS de fadiga. Inclui instalação.',
      price:                1_200.00,
      commissionPercentage: 30,
      tenantId:             null,
      isActive:             true,
    },
    {
      name:                 'Sensor de Fadiga FatigueGuard',
      type:                 'HARDWARE',
      description:          'Monitora sinais de sonolência e distração do motorista em tempo real.',
      price:                890.00,
      commissionPercentage: 30,
      tenantId:             tenant2.id,    // Exclusivo Valeteck
      isActive:             true,
    },
    {
      name:                 'Bloqueador Imobilizador Smart',
      type:                 'HARDWARE',
      description:          'Imobilizador integrado à central do veículo com senha de emergência.',
      price:                179.90,
      commissionPercentage: 30,
      tenantId:             null,
      isActive:             false,         // Produto descontinuado
    },
    // ── SUBSCRIPTION_PLAN ──
    {
      name:                 'Adesão Plano Rastremix Básico',
      type:                 'SUBSCRIPTION_PLAN',
      description:          'Monitoramento 24h, app para gestão e suporte básico. Mensalidade após adesão: R$ 39,90.',
      price:                99.90,
      commissionPercentage: 30,
      tenantId:             tenant1.id,
      isActive:             true,
    },
    {
      name:                 'Plano Valeteck Premium Anual',
      type:                 'SUBSCRIPTION_PLAN',
      description:          'Plano anual com telemetria avançada, relatórios e API integração. Sem fidelidade.',
      price:                599.00,
      commissionPercentage: 30,
      tenantId:             tenant2.id,
      isActive:             true,
    },
    {
      name:                 'Plano Gps Love Motoboy',
      type:                 'SUBSCRIPTION_PLAN',
      description:          'Rastreamento em tempo real para motos, inclui seguro básico.',
      price:                149.90,
      commissionPercentage: 30,
      tenantId:             tenant3.id,
      isActive:             true,
    },
    {
      name:                 'Combo Rastreador + Adesão Básico',
      type:                 'SUBSCRIPTION_PLAN',
      description:          'Hardware rastreador + 6 meses de plano básico. Ativação imediata.',
      price:                749.80,
      commissionPercentage: 30,
      tenantId:             null,
      isActive:             true,
    },
  ]

  for (const p of productsData) {
    await prisma.product.create({ data: p as any })
  }

  const totalProdutos = productsData.length
  const ativos        = productsData.filter(p => p.isActive).length
  console.log(`✅ ${totalProdutos} produtos criados (${ativos} ativos, ${totalProdutos - ativos} inativo)`)

  /* ── Leads para auditoria ────────────────── */
  await prisma.lead.deleteMany({})

  const leadsData = [
    {
      nomeCliente:    'Thiago Barros Ferreira',
      telefone:       '(51) 98833-7766',
      email:          'thiago.barros@empresa.com',
      veiculo:        'Volkswagen Amarok V6 2023',
      placa:          'POA4K21',
      praca:          'Porto Alegre - RS',
      platePhotoUrl:  PLATE_PHOTOS[3],
      status:         'PENDENTE_AUDITORIA',
      commissionValue: 1.00,
      tenantId:       tenant2.id,
    },
    {
      nomeCliente:    'Patricia Oliveira Santos',
      telefone:       '(41) 97722-8899',
      email:          'patricia.oliveira@corp.com',
      veiculo:        'Mitsubishi L200 Triton 2022',
      placa:          'CWB5F88',
      praca:          'Curitiba - PR',
      platePhotoUrl:  PLATE_PHOTOS[4],
      status:         'PENDENTE_AUDITORIA',
      commissionValue: 1.00,
      tenantId:       tenant1.id,
    },
    {
      nomeCliente:    'Roberto Souza Pinto',
      telefone:       '(21) 98765-5522',
      email:          'roberto.souza@gmail.com',
      veiculo:        'Chevrolet S10 High Country 2023',
      placa:          'XYZ9A87',
      praca:          'Rio de Janeiro - RJ',
      platePhotoUrl:  PLATE_PHOTOS[2],
      status:         'PENDENTE_AUDITORIA',
      commissionValue: 1.00,
      tenantId:       tenant2.id,
    },
    {
      nomeCliente:    'Fernanda Lima Costa',
      telefone:       '(11) 97654-3210',
      email:          'fernanda.lima@empresa.com',
      veiculo:        'Ford Ranger XLS 2021',
      placa:          'ABC1D23',
      praca:          'São Paulo - SP',
      platePhotoUrl:  PLATE_PHOTOS[1],
      status:         'PENDENTE_AUDITORIA',
      commissionValue: 1.00,
      tenantId:       tenant1.id,
    },
    {
      nomeCliente:    'Carlos Alberto Mendes',
      telefone:       '(31) 99821-4455',
      email:          'carlos.mendes@email.com',
      veiculo:        'Toyota Hilux SW4 2022',
      placa:          'BRA2E19',
      praca:          'Belo Horizonte - MG',
      platePhotoUrl:  PLATE_PHOTOS[0],
      status:         'PENDENTE_AUDITORIA',
      commissionValue: 1.00,
      tenantId:       tenant1.id,
    },
    // Histórico
    {
      nomeCliente:    'Marcelo Dias Ferreira',
      telefone:       '(62) 91234-5678',
      email:          'marcelo.dias@corp.com',
      veiculo:        'Mitsubishi L200 Triton 2022',
      placa:          'GOI3F45',
      praca:          'Goiânia - GO',
      platePhotoUrl:  PLATE_PHOTOS[0],
      status:         'AUDITADO_APROVADO',
      commissionValue: 2.00,
      auditadoPorId:  financeiro.id,
      auditadoEm:     new Date(Date.now() - 1000 * 60 * 60 * 2),
      tenantId:       tenant1.id,
    },
    {
      nomeCliente:    'Ana Paula Rodrigues',
      telefone:       '(85) 93344-2211',
      email:          'ana.rodrigues@outlook.com',
      veiculo:        'VW Amarok V6 2023',
      placa:          'FOR5K78',
      praca:          'Fortaleza - CE',
      platePhotoUrl:  PLATE_PHOTOS[1],
      status:         'AUDITADO_REJEITADO',
      commissionValue: 1.00,
      motivoRejeicao: 'Foto desfocada — placa ilegível',
      auditadoPorId:  adminMaster.id,
      auditadoEm:     new Date(Date.now() - 1000 * 60 * 60 * 5),
      tenantId:       tenant2.id,
    },
  ]

  for (const lead of leadsData) {
    await prisma.lead.create({ data: lead as any })
  }

  console.log(`✅ ${leadsData.length} leads criados (5 pendentes, 1 aprovado, 1 rejeitado)`)
  console.log('')
  console.log('═══════════════════════════════════════')
  console.log('🚀 SEED COMPLETO — ProspecLead')
  console.log('═══════════════════════════════════════')
  console.log('👤 Usuários (senha: 123456):')
  console.log('   admin@prospeclead.com      → ADMIN_MASTER')
  console.log('   financeiro@prospeclead.com → FINANCIAL')
  console.log('   gestor@prospeclead.com     → MANAGER')
  console.log('')
  console.log('📦 Produtos criados:')
  for (const p of productsData) {
    const comm = ((p.price * p.commissionPercentage) / 100).toFixed(2)
    const status = p.isActive ? '✅' : '🔴'
    const tenant = p.tenantId === tenant1.id ? 'Rastremix'
                 : p.tenantId === tenant2.id ? 'Valeteck'
                 : p.tenantId === tenant3.id ? 'Gps Love'
                 : 'Global'
    console.log(`   ${status} ${p.name} — R$ ${p.price.toFixed(2)} — 30% → R$ ${comm} [${tenant}]`)
  }
  console.log('')
}

main()
  .catch(e => { console.error('❌ Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())

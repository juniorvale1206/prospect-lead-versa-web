import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Imagens de carros reais para teste (via picsum/unsplash público)
const PLATE_PHOTOS = [
  'https://images.unsplash.com/photo-1603386329225-868f9b1ee6c9?w=800&q=80', // placa genérica
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80', // carro 2
  'https://images.unsplash.com/photo-1549924231-f129b911e442?w=800&q=80', // carro 3
]

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...')

  /* ── Tenants ─────────────────────────────── */
  const tenant1 = await prisma.tenant.upsert({
    where: { slug: 'rastremix' },
    update: {},
    create: { nome: 'Rastremix', slug: 'rastremix', ativo: true },
  })
  const tenant2 = await prisma.tenant.upsert({
    where: { slug: 'valeteck' },
    update: {},
    create: { nome: 'Valeteck', slug: 'valeteck', ativo: true },
  })
  console.log('✅ Tenants:', tenant1.nome, '|', tenant2.nome)

  /* ── Usuários ────────────────────────────── */
  const senha = await bcrypt.hash('123456', 12)

  const adminMaster = await prisma.user.upsert({
    where: { email: 'admin@prospeclead.com' },
    update: {},
    create: { email: 'admin@prospeclead.com', password: senha, nome: 'Admin Master', role: 'ADMIN_MASTER', ativo: true },
  })
  const financeiro = await prisma.user.upsert({
    where: { email: 'financeiro@prospeclead.com' },
    update: {},
    create: { email: 'financeiro@prospeclead.com', password: senha, nome: 'Financeiro', role: 'FINANCIAL', ativo: true },
  })
  await prisma.user.upsert({
    where: { email: 'gestor@prospeclead.com' },
    update: {},
    create: { email: 'gestor@prospeclead.com', password: senha, nome: 'Gestor Rastremix', role: 'MANAGER', tenantId: tenant1.id, ativo: true },
  })
  console.log('✅ Usuários criados (senha: 123456)')

  /* ── Leads mockados para teste de Auditoria ─ */
  const leadsData = [
    {
      nomeCliente:   'Carlos Alberto Mendes',
      telefone:      '(31) 99821-4455',
      email:         'carlos.mendes@email.com',
      veiculo:       'Toyota Hilux SW4 2022',
      placa:         'BRA2E19',
      praca:         'Belo Horizonte - MG',
      platePhotoUrl: PLATE_PHOTOS[0],
      status:        'PENDENTE_AUDITORIA',
      commissionValue: 1.00,
      tenantId:      tenant1.id,
    },
    {
      nomeCliente:   'Fernanda Lima Costa',
      telefone:      '(11) 97654-3210',
      email:         'fernanda.lima@empresa.com',
      veiculo:       'Ford Ranger XLS 2021',
      placa:         'ABC1D23',
      praca:         'São Paulo - SP',
      platePhotoUrl: PLATE_PHOTOS[1],
      status:        'PENDENTE_AUDITORIA',
      commissionValue: 1.00,
      tenantId:      tenant1.id,
    },
    {
      nomeCliente:   'Roberto Souza Pinto',
      telefone:      '(21) 98765-5522',
      email:         'roberto.souza@gmail.com',
      veiculo:       'Chevrolet S10 High Country 2023',
      placa:         'XYZ9A87',
      praca:         'Rio de Janeiro - RJ',
      platePhotoUrl: PLATE_PHOTOS[2],
      status:        'PENDENTE_AUDITORIA',
      commissionValue: 1.00,
      tenantId:      tenant2.id,
    },
    // Lead já auditado (para visualizar histórico)
    {
      nomeCliente:   'Marcelo Dias Ferreira',
      telefone:      '(62) 91234-5678',
      email:         'marcelo.dias@corp.com',
      veiculo:       'Mitsubishi L200 Triton 2022',
      placa:         'GOI3F45',
      praca:         'Goiânia - GO',
      platePhotoUrl: PLATE_PHOTOS[0],
      status:        'AUDITADO_APROVADO',
      commissionValue: 2.00,
      auditadoPorId:  financeiro.id,
      auditadoEm:     new Date(Date.now() - 1000 * 60 * 60 * 2), // 2h atrás
      tenantId:       tenant1.id,
    },
    {
      nomeCliente:   'Ana Paula Rodrigues',
      telefone:      '(85) 93344-2211',
      email:         'ana.rodrigues@outlook.com',
      veiculo:       'VW Amarok V6 2023',
      placa:         'FOR5K78',
      praca:         'Fortaleza - CE',
      platePhotoUrl: PLATE_PHOTOS[1],
      status:        'AUDITADO_REJEITADO',
      commissionValue: 1.00,
      motivoRejeicao: 'Foto desfocada — placa ilegível',
      auditadoPorId:  adminMaster.id,
      auditadoEm:     new Date(Date.now() - 1000 * 60 * 60 * 5),
      tenantId:       tenant2.id,
    },
  ]

  // Apagar leads existentes para não duplicar no re-seed
  await prisma.lead.deleteMany({})

  for (const lead of leadsData) {
    await prisma.lead.create({ data: lead as any })
  }

  console.log(`✅ ${leadsData.length} leads criados (3 pendentes, 1 aprovado, 1 rejeitado)`)
  console.log('')
  console.log('🎯 Leads para auditoria:')
  console.log('   • Carlos Alberto Mendes  — BRA2E19 — Toyota Hilux')
  console.log('   • Fernanda Lima Costa   — ABC1D23 — Ford Ranger')
  console.log('   • Roberto Souza Pinto   — XYZ9A87 — Chevrolet S10')
  console.log('')
  console.log('🚀 Seed concluído!')
}

main()
  .catch(e => { console.error('❌ Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())

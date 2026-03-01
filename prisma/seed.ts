import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...')

  // Criar Tenants
  const tenant1 = await prisma.tenant.upsert({
    where: { slug: 'rastremix' },
    update: {},
    create: {
      nome: 'Rastremix',
      slug: 'rastremix',
      ativo: true,
    },
  })

  const tenant2 = await prisma.tenant.upsert({
    where: { slug: 'valeteck' },
    update: {},
    create: {
      nome: 'Valeteck',
      slug: 'valeteck',
      ativo: true,
    },
  })

  console.log('✅ Tenants criados:', tenant1.nome, '|', tenant2.nome)

  const senha = await bcrypt.hash('123456', 12)

  // Admin Master - sem tenant (acesso global)
  const adminMaster = await prisma.user.upsert({
    where: { email: 'admin@prospeclead.com' },
    update: {},
    create: {
      email: 'admin@prospeclead.com',
      password: senha,
      nome: 'Admin Master',
      role: 'ADMIN_MASTER',
      ativo: true,
    },
  })

  // Financeiro - sem tenant (acesso financeiro global)
  const financeiro = await prisma.user.upsert({
    where: { email: 'financeiro@prospeclead.com' },
    update: {},
    create: {
      email: 'financeiro@prospeclead.com',
      password: senha,
      nome: 'Financeiro',
      role: 'FINANCIAL',
      ativo: true,
    },
  })

  // Gestor - vinculado ao tenant Rastremix
  const gestor = await prisma.user.upsert({
    where: { email: 'gestor@prospeclead.com' },
    update: {},
    create: {
      email: 'gestor@prospeclead.com',
      password: senha,
      nome: 'Gestor Rastremix',
      role: 'MANAGER',
      tenantId: tenant1.id,
      ativo: true,
    },
  })

  console.log('✅ Usuários criados:')
  console.log('   📧', adminMaster.email, '| Role:', adminMaster.role)
  console.log('   📧', financeiro.email, '| Role:', financeiro.role)
  console.log('   📧', gestor.email, '| Role:', gestor.role, '| Tenant:', tenant1.nome)
  console.log('')
  console.log('🔑 Senha para todos: 123456')
  console.log('🚀 Seed concluído com sucesso!')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

module.exports = {
  apps: [
    {
      name: 'prospeclead',
      script: 'node_modules/.bin/next',
      args: 'dev -p 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        DATABASE_URL: 'file:/home/user/webapp/prisma/dev.db',
        JWT_SECRET: 'prospeclead-super-secret-key-2024-change-in-production',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
    }
  ]
}

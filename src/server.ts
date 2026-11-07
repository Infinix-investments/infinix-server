import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { seedDatabase } from './seed.js';
import { authRoutes } from './routes/auth.routes.js';
import { clientRoutes } from './routes/client.routes.js';
import { planRoutes } from './routes/plan.routes.js';
import { investmentRoutes } from './routes/investment.routes.js';
import { withdrawalRoutes } from './routes/withdrawal.routes.js';
import { transactionRoutes } from './routes/transaction.routes.js';
import { referralRoutes } from './routes/referral.routes.js';
import { auditRoutes } from './routes/audit.routes.js';

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'infinix_super_secret_jwt_key_2026_wealth_desk_auth_token_998';

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

async function main() {
  try {
    // 1. Connect to MongoDB Atlas
    await connectDB();

    // 2. Auto-seed if collections are empty
    await seedDatabase(false);

    // 3. Register CORS (permits both mobile clients and web admin interface)
    await server.register(cors, {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
    });

    // 4. Register JWT
    await server.register(jwt, {
      secret: JWT_SECRET,
    });

    // 5. Health Check & Root Endpoints
    server.get('/', async () => {
      return {
        status: 'ok',
        service: 'INFINIX API Engine',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      };
    });

    server.get('/api/health', async () => {
      return {
        status: 'ok',
        service: 'INFINIX API Engine',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      };
    });

    // 6. Register Modular Routes
    await server.register(authRoutes, { prefix: '/api/auth' });
    await server.register(clientRoutes, { prefix: '/api/clients' });
    await server.register(planRoutes, { prefix: '/api/plans' });
    await server.register(investmentRoutes, { prefix: '/api/investments' });
    await server.register(withdrawalRoutes, { prefix: '/api/withdrawals' });
    await server.register(transactionRoutes, { prefix: '/api/transactions' });
    await server.register(referralRoutes, { prefix: '/api/referrals' });
    await server.register(auditRoutes, { prefix: '/api/audit-logs' });

    // 7. Start Listening
    await server.listen({ port: PORT, host: HOST });
    console.log(`\n================================================================`);
    console.log(`🚀 INFINIX FASTIFY SERVER RUNNING ON: http://${HOST}:${PORT}`);
    console.log(`🌐 Health endpoint: http://${HOST}:${PORT}/api/health`);
    console.log(`📡 Ready for web admin interface & mobile client app connections`);
    console.log(`================================================================\n`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

main();


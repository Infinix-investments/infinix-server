import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Client } from './models/Client.js';
import { Plan } from './models/Plan.js';
import { Investment } from './models/Investment.js';
import { Withdrawal } from './models/Withdrawal.js';
import { Transaction } from './models/Transaction.js';
import { Referral } from './models/Referral.js';
import { ReferralTier } from './models/ReferralTier.js';
import { AuditLog } from './models/AuditLog.js';
import {
  SEED_ADMIN,
  SEED_CLIENTS,
  SEED_PLANS,
  SEED_INVESTMENTS,
  SEED_WITHDRAWALS,
  SEED_TRANSACTIONS,
  SEED_REFERRALS,
  SEED_REFERRAL_TIERS,
  SEED_AUDIT_LOGS,
} from './data/seed-data.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

export async function seedDatabase(force = false) {
  try {
    console.log('[Seeder] Checking database for initial data...');

    const clientCount = await Client.countDocuments();
    if (clientCount > 0 && !force) {
      console.log(`[Seeder] Database already populated with ${clientCount} users/clients. Skipping seed.`);
      return;
    }

    if (force) {
      console.log('[Seeder] Force flag enabled: Clearing existing collections...');
      await Promise.all([
        Client.deleteMany({}),
        Plan.deleteMany({}),
        Investment.deleteMany({}),
        Withdrawal.deleteMany({}),
        Transaction.deleteMany({}),
        Referral.deleteMany({}),
        ReferralTier.deleteMany({}),
        AuditLog.deleteMany({}),
      ]);
    }

    console.log('[Seeder] Seeding Admin and Clients...');
    await Client.insertMany([SEED_ADMIN, ...SEED_CLIENTS]);

    console.log('[Seeder] Seeding Plans...');
    await Plan.insertMany(SEED_PLANS);

    console.log('[Seeder] Seeding Investments...');
    await Investment.insertMany(SEED_INVESTMENTS);

    console.log('[Seeder] Seeding Withdrawals...');
    await Withdrawal.insertMany(SEED_WITHDRAWALS);

    console.log('[Seeder] Seeding Transactions...');
    await Transaction.insertMany(SEED_TRANSACTIONS);

    console.log('[Seeder] Seeding Referrals...');
    await Referral.insertMany(SEED_REFERRALS);

    console.log('[Seeder] Seeding Referral Tiers...');
    await ReferralTier.insertMany(SEED_REFERRAL_TIERS);

    console.log('[Seeder] Seeding Audit Logs...');
    await AuditLog.insertMany(SEED_AUDIT_LOGS);

    console.log('✅ [Seeder] Database seeding successfully completed.');
  } catch (error: any) {
    console.error('❌ [Seeder] Error seeding database:', error.message);
  }
}

// Standalone execution
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  mongoose
    .connect(MONGODB_URI)
    .then(async () => {
      console.log('Connected to MongoDB. Running seed...');
      await seedDatabase(process.argv.includes('--force'));
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to connect:', err.message);
      process.exit(1);
    });
}


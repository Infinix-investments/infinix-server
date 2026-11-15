import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Withdrawal } from '../models/Withdrawal.js';
import { Client } from '../models/Client.js';
import { Investment } from '../models/Investment.js';
import { Plan } from '../models/Plan.js';
import { Transaction } from '../models/Transaction.js';
import { AuditLog } from '../models/AuditLog.js';
import { Referral } from '../models/Referral.js';

// In-memory monotonic lock per client to block race-condition double-clicks
const activeWithdrawalLocks = new Set<string>();

export async function withdrawalRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // GET /api/withdrawals/server-time (Authoritative server timestamp to eliminate device clock skew)
  fastify.get('/server-time', async (request, reply) => {
    const now = new Date();
    return reply.send({
      success: true,
      serverTime: now.toISOString(),
      timestamp: now.getTime(),
    });
  });

  // GET /api/withdrawals
  fastify.get('/', async (request, reply) => {
    const { clientId, status } = request.query as any;
    const query: any = {};
    if (clientId) query.clientId = clientId;
    if (status) query.status = status;

    const withdrawals = await Withdrawal.find(query).sort({ createdAt: -1 });
    const now = new Date();

    return reply.send({
      success: true,
      serverTime: now.toISOString(),
      timestamp: now.getTime(),
      data: withdrawals.map((w) => ({
        id: w.withdrawalId,
        withdrawalId: w.withdrawalId,
        clientId: w.clientId,
        clientName: w.clientName,
        amount: w.amount,
        grossAmount: w.grossAmount || w.amount,
        partIndex: w.partIndex,
        feePct: w.feePct,
        feeAmount: w.feeAmount,
        netAmount: w.netAmount,
        isLate: false,
        monthIndex: w.monthIndex,
        requestDate: w.requestDate,
        disbursedDate: w.disbursedDate,
        status: w.status,
        bankAccount: w.bankAccount,
        utrReference: w.utrReference,
        notes: w.notes,
        createdAt: w.createdAt,
      })),
    });
  });

  // POST /api/withdrawals/request (Client requests earned yield disbursement with 10-day gap & 3% fee)
  fastify.post('/request', async (request, reply) => {
    const { clientId, amount, requestedAmount, grossAmount, bankAccount, notes } = request.body as any;

    if (!clientId) {
      return reply.status(400).send({ success: false, error: 'Client identification required.' });
    }

    const lockKey = String(clientId).trim().toLowerCase();
    if (activeWithdrawalLocks.has(lockKey)) {
      return reply.status(429).send({
        success: false,
        error: 'A withdrawal transaction for this account is already processing. Please wait a moment.',
      });
    }

    activeWithdrawalLocks.add(lockKey);

    try {
      const client = await Client.findOne({ clientId });
      if (!client) {
        return reply.status(404).send({ success: false, error: 'Client not found.' });
      }

      // Find all active plans/investments for this client
      const activeInvestments = await Investment.find({
        clientId: client.clientId,
        assetClass: 'private_plan',
        status: 'active',
      });

      const now = new Date();

    // Calculate total yield accrued across ALL active plans individually
    let totalAccruedYield = 0;
    if (activeInvestments.length > 0) {
      for (const inv of activeInvestments) {
        const invStart = inv.investmentDate ? new Date(inv.investmentDate) : (client.assignedPlanStartDate ? new Date(client.assignedPlanStartDate) : new Date(inv.createdAt));
        const pDays = Math.max(0, Math.floor((now.getTime() - invStart.getTime()) / (1000 * 60 * 60 * 24)));
        const maxDays = (inv.durationMonths || 14) * 30;
        const effectiveDays = Math.min(maxDays, pDays);
        const rate = (inv.dailyReturnPct || 0.5) / 100;
        const planAccrued = (inv.investedAmount || 0) * rate * effectiveDays;
        totalAccruedYield += planAccrued;
      }
      totalAccruedYield = Math.round(totalAccruedYield * 100) / 100;
    } else if (client.assignedPlanAmount && client.assignedPlanStatus === 'active') {
      const startDate = client.assignedPlanStartDate
        ? new Date(client.assignedPlanStartDate)
        : new Date(client.joinedDate || Date.now());
      const pDays = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      // Dynamic duration and daily return lookup based on assigned plan ID
      let durMonths = 14;
      let dailyRate = 0.005; // default 0.5%
      if (client.assignedPlanId) {
        const matchedPlan = await Plan.findOne({ planId: client.assignedPlanId });
        if (matchedPlan) {
          durMonths = matchedPlan.durationMonths || 14;
          dailyRate = (matchedPlan.dailyReturnPct || 0.5) / 100;
        }
      }

      const maxDays = durMonths * 30;
      const effectiveAccruedDays = Math.min(maxDays, pDays);
      const dailyProfitAmount = (client.assignedPlanAmount || 0) * dailyRate;
      totalAccruedYield = Math.round(dailyProfitAmount * effectiveAccruedDays * 100) / 100;
    }

    // Earliest plan start date for initial 10-day unlock rule & cycle indexing
    let earliestStartDate = client.assignedPlanStartDate ? new Date(client.assignedPlanStartDate) : new Date(client.joinedDate || Date.now());
    if (activeInvestments.length > 0) {
      const dates = activeInvestments
        .map((i: any) => i.investmentDate ? new Date(i.investmentDate).getTime() : 0)
        .filter((t: number) => t > 0);
      if (dates.length > 0) {
        earliestStartDate = new Date(Math.min(...dates));
      }
    }
    const diffDays = Math.max(0, Math.floor((now.getTime() - earliestStartDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Calculate referral earnings (5% of each active referee's invested capital)
    // Multi-key deduplication prevents double-counting across duplicate Referral docs or registered client records
    let referralEarnings = 0;
    if (client.referralCode) {
      const cleanNorm = client.referralCode.trim().toUpperCase().replace(/^INF-?/, '');
      const canonicalCode = `INF-${cleanNorm}`;
      const safeNorm = cleanNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const referralRecords = await Referral.find({
        $or: [
          { referrerId: client.clientId },
          { referrerCode: client.referralCode },
          { referrerCode: canonicalCode },
          { referrerCode: new RegExp(`^(INF-?)?${safeNorm}$`, 'i') },
        ],
        status: 'active',
      });

      const countedRefereeKeys = new Set<string>();

      for (const r of referralRecords) {
        const refId = (r.refereeId || '').toString().trim().toLowerCase();
        const refEmail = (r.refereeEmail || '').toString().trim().toLowerCase();
        const refPhone = (r.refereePhone || '').toString().trim().replace(/[\s+-]/g, '');

        const isAlreadyCounted =
          (refId && countedRefereeKeys.has(`id:${refId}`)) ||
          (refEmail && countedRefereeKeys.has(`email:${refEmail}`)) ||
          (refPhone && countedRefereeKeys.has(`phone:${refPhone}`));

        if (isAlreadyCounted) continue;

        if (refId) countedRefereeKeys.add(`id:${refId}`);
        if (refEmail) countedRefereeKeys.add(`email:${refEmail}`);
        if (refPhone) countedRefereeKeys.add(`phone:${refPhone}`);

        const earned = Number(r.totalEarnedAmount) || Number(r.monthlyCommissionAmount) || Math.round(Number(r.capitalAmount || 0) * 0.05 * 100) / 100;
        referralEarnings += earned;
      }

      // Also check for clients who registered with this referral code but don't have a counted Referral doc
      const registeredReferees = await Client.find({
        $or: [
          { referredByCode: client.referralCode },
          { referredByCode: canonicalCode },
          { referredByCode: new RegExp(`^(INF-?)?${safeNorm}$`, 'i') },
        ],
        assignedPlanStatus: 'active',
      });

      for (const rc of registeredReferees) {
        const rcId = (rc.clientId || rc._id?.toString() || '').trim().toLowerCase();
        const rcEmail = (rc.email || '').trim().toLowerCase();
        const rcPhone = (rc.phone || '').trim().replace(/[\s+-]/g, '');

        const isAlreadyCounted =
          (rcId && countedRefereeKeys.has(`id:${rcId}`)) ||
          (rcEmail && countedRefereeKeys.has(`email:${rcEmail}`)) ||
          (rcPhone && countedRefereeKeys.has(`phone:${rcPhone}`));

        if (!isAlreadyCounted) {
          if (rcId) countedRefereeKeys.add(`id:${rcId}`);
          if (rcEmail) countedRefereeKeys.add(`email:${rcEmail}`);
          if (rcPhone) countedRefereeKeys.add(`phone:${rcPhone}`);

          const cap = Number(rc.assignedPlanAmount) || 0;
          if (cap > 0) {
            referralEarnings += Math.round(cap * 0.05 * 100) / 100;
          }
        }
      }
    }

    if (activeInvestments.length === 0 && (!client.assignedPlanAmount || client.assignedPlanStatus !== 'active') && referralEarnings <= 0) {
      return reply.status(400).send({
        success: false,
        error: 'No active wealth plan or withdrawable earnings found for this account.',
      });
    }

    // Strict pending withdrawal check
    const pendingWds = await Withdrawal.find({
      clientId: client.clientId,
      status: 'pending_approval',
    });
    const totalPendingGross = pendingWds.reduce((sum, w) => sum + (w.grossAmount || w.amount), 0);
    if (pendingWds.length > 0) {
      const pendingAmount = pendingWds[0].grossAmount || pendingWds[0].amount;
      return reply.status(400).send({
        success: false,
        error: `You already have a withdrawal request of ${pendingAmount.toLocaleString()} USDT pending Admin settlement.`,
      });
    }

    // Sum existing settled (disbursed) withdrawals — pending withdrawals DO NOT deduct until settled by Admin
    const settledWds = await Withdrawal.find({
      clientId: client.clientId,
      status: 'disbursed',
    });
    const totalWithdrawnGross = settledWds.reduce((sum, w) => sum + (w.grossAmount || w.amount), 0);
    const availableToWithdraw = Math.max(0, Math.round((totalAccruedYield + referralEarnings - totalWithdrawnGross) * 100) / 100);

    // Reserved balance check: ensures that even if pending check was bypassed via direct API call, balance is strictly locked
    const unreservedAvailable = Math.max(0, Math.round((availableToWithdraw - totalPendingGross) * 100) / 100);

    // 10-Day Mandatory Gap Rule
    const latestWd = await Withdrawal.findOne({
      clientId: client.clientId,
      status: { $in: ['pending_approval', 'disbursed'] },
    }).sort({ createdAt: -1 });

    if (latestWd) {
      const lastDate = new Date(latestWd.requestDate || latestWd.createdAt);
      const daysSinceLast = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLast < 10) {
        const remaining = 10 - daysSinceLast;
        return reply.status(400).send({
          success: false,
          error: `Withdrawals require a 10-day gap between requests. Next withdrawal available in ${remaining} day${remaining !== 1 ? 's' : ''}.`,
        });
      }
    } else {
      // First withdrawal unlocks 10 days after earliest plan inception
      if (diffDays < 10) {
        const remaining = 10 - diffDays;
        return reply.status(400).send({
          success: false,
          error: `First withdrawal unlocks 10 days after plan activation. Available in ${remaining} day${remaining !== 1 ? 's' : ''}.`,
        });
      }
    }

    // Determine gross withdrawal amount
    let claimGross = Number(requestedAmount ?? grossAmount ?? amount);
    if (isNaN(claimGross) || claimGross <= 0) {
      claimGross = availableToWithdraw;
    }

    if (claimGross > availableToWithdraw) {
      return reply.status(400).send({
        success: false,
        error: `Requested amount (${claimGross} USDT) exceeds available accrued balance (${availableToWithdraw} USDT).`,
      });
    }

    if (claimGross > unreservedAvailable) {
      return reply.status(400).send({
        success: false,
        error: `Requested amount (${claimGross} USDT) exceeds unreserved available balance (${unreservedAvailable} USDT).`,
      });
    }

    if (claimGross <= 0) {
      return reply.status(400).send({
        success: false,
        error: 'No accrued earnings available to withdraw at this time.',
      });
    }

    // Flat 3% processing fee - ZERO late fee
    const feePct = 3;
    const feeAmount = Math.round(claimGross * 0.03 * 100) / 100;
    const netAmount = Math.round((claimGross - feeAmount) * 100) / 100;

    const withdrawalId = `wd-${Date.now().toString().slice(-4)}`;
    const requestDate = new Date().toISOString().split('T')[0];

    let withdrawal;
    try {
      withdrawal = await Withdrawal.create({
        withdrawalId,
        clientId: client.clientId,
        clientName: `${client.firstName} ${client.lastName}`,
        amount: netAmount,
        grossAmount: claimGross,
        partIndex: 1,
        feePct: 3,
        feeAmount,
        netAmount,
        isLate: false,
        monthIndex: Math.min(14, Math.floor(diffDays / 30) + 1),
        requestDate,
        status: 'pending_approval',
        bankAccount: bankAccount || client.bankAccount || 'USDT TRC20 Wallet',
        notes:
          notes ||
          `Yield claim: ${claimGross.toLocaleString()} USDT • 3% Fee: ${feeAmount.toLocaleString()} USDT • Net: ${netAmount.toLocaleString()} USDT`,
      });
    } catch (createErr: any) {
      // Catch MongoDB duplicate key error on compound unique index (clientId + status: pending_approval)
      if (createErr?.code === 11000) {
        return reply.status(400).send({
          success: false,
          error: 'You already have a withdrawal request pending Admin settlement.',
        });
      }
      throw createErr;
    }

    client.lastWithdrawalDate = requestDate;
    await client.save();

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'Investor Request',
      action: 'Withdrawal Requested',
      category: 'withdrawal_approval',
      details: `${client.firstName} ${client.lastName} requested yield withdrawal of ${claimGross.toLocaleString()} USDT (3% fee: ${feeAmount.toLocaleString()} USDT, Net: ${netAmount.toLocaleString()} USDT)`,
    });

    return reply.status(201).send({
      success: true,
      message: `Withdrawal request for ${netAmount.toLocaleString()} USDT submitted successfully (3% fee deducted).`,
      data: withdrawal,
    });
  } finally {
    activeWithdrawalLocks.delete(lockKey);
  }
  });

  // PATCH /api/withdrawals/:id/status (Admin approval / disbursement)
  fastify.patch('/:id/status', async (request, reply) => {
    const { id } = request.params as any;
    const { status, utrReference, adminName, notes } = request.body as any;

    const withdrawal = await Withdrawal.findOne({ withdrawalId: id });
    if (!withdrawal) {
      return reply.status(404).send({ success: false, error: 'Withdrawal record not found.' });
    }

    withdrawal.status = status;
    if (utrReference) withdrawal.utrReference = utrReference;
    if (notes) withdrawal.notes = notes;

    if (status === 'disbursed') {
      withdrawal.disbursedDate = new Date().toISOString().split('T')[0];

      await Transaction.create({
        transactionId: `tx-${Date.now()}-wd`,
        clientId: withdrawal.clientId,
        type: 'withdrawal',
        typeLabel: 'Yield Disbursement',
        amount: -withdrawal.netAmount,
        date: withdrawal.disbursedDate,
        description: `Yield withdrawal of ${withdrawal.netAmount} USDT disbursed • Ref ${utrReference || 'USDT Transfer'}`,
        currency: 'USDT',
        status: 'settled',
      });

      if (withdrawal.feeAmount && withdrawal.feeAmount > 0) {
        await Transaction.create({
          transactionId: `tx-${Date.now()}-fee`,
          clientId: withdrawal.clientId,
          type: 'fee',
          typeLabel: '3% Processing Fee',
          amount: -withdrawal.feeAmount,
          date: withdrawal.disbursedDate,
          description: `3% standard withdrawal fee deducted.`,
          currency: 'USDT',
          status: 'settled',
        });
      }

      // Update client state
      const client = await Client.findOne({ clientId: withdrawal.clientId });
      if (client) {
        client.lastWithdrawalDate = withdrawal.disbursedDate;
        await client.save();
      }
    }

    await withdrawal.save();

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: adminName || 'Administrator',
      action: status === 'disbursed' ? 'Disbursement Executed' : `Withdrawal ${status}`,
      category: 'withdrawal_approval',
      details: `${adminName || 'Admin'} marked withdrawal ${withdrawal.withdrawalId} as ${status}. Ref: ${utrReference || 'N/A'}`,
    });

    return reply.send({
      success: true,
      message: `Withdrawal marked as ${status}.`,
      data: withdrawal,
    });
  });
}

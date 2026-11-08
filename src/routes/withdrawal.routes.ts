import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Withdrawal } from '../models/Withdrawal.js';
import { Client } from '../models/Client.js';
import { Transaction } from '../models/Transaction.js';
import { AuditLog } from '../models/AuditLog.js';

export async function withdrawalRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // GET /api/withdrawals
  fastify.get('/', async (request, reply) => {
    const { clientId, status } = request.query as any;
    const query: any = {};
    if (clientId) query.clientId = clientId;
    if (status) query.status = status;

    const withdrawals = await Withdrawal.find(query).sort({ createdAt: -1 });

    return reply.send({
      success: true,
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

    const client = await Client.findOne({ clientId });
    if (!client) {
      return reply.status(404).send({ success: false, error: 'Client not found.' });
    }

    if (!client.assignedPlanAmount || client.assignedPlanStatus !== 'active') {
      return reply.status(400).send({
        success: false,
        error: 'No active wealth plan assigned to this account.',
      });
    }

    const startDate = client.assignedPlanStartDate
      ? new Date(client.assignedPlanStartDate)
      : new Date(client.joinedDate || Date.now());
    const now = new Date();
    const diffDays = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Calculate total yield accrued till date (0.5% daily, max 14 months = 420 days)
    const maxDays = 14 * 30;
    const effectiveAccruedDays = Math.min(maxDays, diffDays);
    const dailyProfitAmount = client.assignedPlanAmount * 0.005; // 0.5% per day
    const totalAccruedYield = Math.round(dailyProfitAmount * effectiveAccruedDays * 100) / 100;

    // Sum existing non-rejected withdrawals
    const existingWds = await Withdrawal.find({
      clientId: client.clientId,
      status: { $in: ['pending_approval', 'disbursed'] },
    });
    const totalWithdrawnGross = existingWds.reduce((sum, w) => sum + (w.grossAmount || w.amount), 0);
    const availableToWithdraw = Math.max(0, Math.round((totalAccruedYield - totalWithdrawnGross) * 100) / 100);

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
      // First withdrawal unlocks 10 days after plan inception
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

    const withdrawal = await Withdrawal.create({
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

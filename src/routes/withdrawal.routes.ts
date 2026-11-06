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
        monthIndex: w.monthIndex,
        requestDate: w.requestDate,
        disbursedDate: w.disbursedDate,
        status: w.status,
        bankAccount: w.bankAccount,
        utrReference: w.utrReference,
        notes: w.notes,
      })),
    });
  });

  // POST /api/withdrawals/request (Client requests monthly disbursement)
  fastify.post('/request', async (request, reply) => {
    const { clientId, bankAccount, notes } = request.body as any;

    const client = await Client.findOne({ clientId });
    if (!client) {
      return reply.status(404).send({ success: false, error: 'Client not found.' });
    }

    if (!client.assignedPlanAmount) {
      return reply.status(400).send({
        success: false,
        error: 'No active wealth plan assigned to this account.',
      });
    }

    if (client.currentMonthWithdrawn) {
      return reply.status(400).send({
        success: false,
        error: 'Monthly withdrawal already submitted or disbursed for the current cycle.',
      });
    }

    // 15% contractual monthly disbursement calculation (7.5% profit + 7.5% principal return)
    const monthlyRate = 0.15;
    const amount = Math.round(client.assignedPlanAmount * monthlyRate);
    const withdrawalId = `wd-${Date.now().toString().slice(-4)}`;
    const requestDate = new Date().toISOString().split('T')[0];

    const withdrawal = await Withdrawal.create({
      withdrawalId,
      clientId: client.clientId,
      clientName: `${client.firstName} ${client.lastName}`,
      amount,
      monthIndex: client.currentMonthIndex || 1,
      requestDate,
      status: 'pending_approval',
      bankAccount: bankAccount || client.bankAccount || 'Client Verified Bank Account',
      notes: notes || `Month ${client.currentMonthIndex || 1} contractual 15% disbursement request.`,
    });

    client.currentMonthWithdrawn = true;
    client.lastWithdrawalDate = requestDate;
    await client.save();

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'Client Request',
      action: 'Withdrawal Requested',
      category: 'withdrawal_approval',
      details: `${client.firstName} ${client.lastName} requested Month ${client.currentMonthIndex} disbursement of ₹${amount.toLocaleString('en-IN')}`,
    });

    return reply.status(201).send({
      success: true,
      message: `Withdrawal request for ₹${amount.toLocaleString('en-IN')} submitted successfully.`,
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

      // Add two ledger transactions: Profit yield + Capital return
      const halfAmount = Math.round(withdrawal.amount / 2);

      await Transaction.create({
        transactionId: `tx-${Date.now()}-1`,
        clientId: withdrawal.clientId,
        type: 'monthly_profit',
        typeLabel: 'Monthly Profit Yield (7.5%)',
        amount: halfAmount,
        date: withdrawal.disbursedDate,
        description: `Contractual monthly profit yield (Month ${withdrawal.monthIndex} / 14) • Ref ${utrReference || 'IMPS/NEFT'}`,
        currency: 'INR',
        status: 'settled',
      });

      await Transaction.create({
        transactionId: `tx-${Date.now()}-2`,
        clientId: withdrawal.clientId,
        type: 'capital_return',
        typeLabel: 'Monthly Capital Return (7.5%)',
        amount: halfAmount,
        date: withdrawal.disbursedDate,
        description: `Contractual principal amortization (Month ${withdrawal.monthIndex} / 14) • Ref ${utrReference || 'IMPS/NEFT'}`,
        currency: 'INR',
        status: 'settled',
      });

      // Update client month index
      const client = await Client.findOne({ clientId: withdrawal.clientId });
      if (client) {
        client.currentMonthIndex = Math.min(14, (client.currentMonthIndex || 1) + 1);
        client.currentMonthWithdrawn = false;
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
      details: `${adminName || 'Admin'} marked withdrawal ${withdrawal.withdrawalId} as ${status}. UTR: ${utrReference || 'N/A'}`,
    });

    return reply.send({
      success: true,
      message: `Withdrawal marked as ${status}.`,
      data: withdrawal,
    });
  });
}


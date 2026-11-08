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
        amount: w.netAmount ?? w.amount,
        grossAmount: w.grossAmount ?? w.amount,
        partIndex: w.partIndex ?? 1,
        feePct: w.feePct ?? 3,
        feeAmount: w.feeAmount ?? 0,
        netAmount: w.netAmount ?? w.amount,
        isLate: w.isLate ?? false,
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

  // POST /api/withdrawals/request (Client requests 15-day tranche disbursement)
  fastify.post('/request', async (request, reply) => {
    const { clientId, monthIndex, partIndex, bankAccount, notes } = request.body as any;

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

    // 30-Day Independent Cycle Calculation
    const startDate = client.assignedPlanStartDate
      ? new Date(client.assignedPlanStartDate)
      : new Date(client.joinedDate || Date.now());
    const now = new Date();
    const diffDays = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))) + 1;
    const currentCycleMonth = Math.min(14, Math.max(1, Math.floor((diffDays - 1) / 30) + 1));
    const dayInCycle = ((diffDays - 1) % 30) + 1;

    const targetMonth = Number(monthIndex) || currentCycleMonth;
    const targetPart = Number(partIndex) === 2 ? 2 : 1;

    // Validate month boundary
    if (targetMonth > currentCycleMonth) {
      return reply.status(400).send({
        success: false,
        error: `Month ${targetMonth} is currently locked. It will unlock when your 30-day cycle advances to Month ${targetMonth}.`,
      });
    }

    // Check if target part is already requested/disbursed
    const existing = await Withdrawal.findOne({
      clientId: client.clientId,
      monthIndex: targetMonth,
      partIndex: targetPart,
      status: { $in: ['pending_approval', 'disbursed'] },
    });

    if (existing) {
      return reply.status(400).send({
        success: false,
        error: `Withdrawal for Month ${targetMonth} (Part ${targetPart}) is already ${existing.status === 'disbursed' ? 'settled' : 'under review'}.`,
      });
    }

    // Overdue late fee: 6% if requesting a past month; 3% normal fee for active month
    const isLate = targetMonth < currentCycleMonth;
    const feePct = isLate ? 6 : 3;

    // 15% monthly total, split into 2 tranches (7.5% per tranche)
    const grossAmount = Math.round(client.assignedPlanAmount * 0.075);
    const feeAmount = Math.round(grossAmount * (feePct / 100));
    const netAmount = grossAmount - feeAmount;

    const withdrawalId = `wd-${Date.now().toString().slice(-4)}`;
    const requestDate = new Date().toISOString().split('T')[0];

    const withdrawal = await Withdrawal.create({
      withdrawalId,
      clientId: client.clientId,
      clientName: `${client.firstName} ${client.lastName}`,
      amount: netAmount,
      grossAmount,
      partIndex: targetPart,
      feePct,
      feeAmount,
      netAmount,
      isLate,
      monthIndex: targetMonth,
      requestDate,
      status: 'pending_approval',
      bankAccount: bankAccount || client.bankAccount || 'Client Verified Bank Account',
      notes:
        notes ||
        `Month ${targetMonth} (Part ${targetPart} of 2) • ${
          isLate ? '6% Late Withdrawal Fee (Overdue Cycle Claim)' : '3% Standard Withdrawal Fee'
        }. Gross: ₹${grossAmount.toLocaleString('en-IN')}, Net: ₹${netAmount.toLocaleString('en-IN')}`,
    });

    client.lastWithdrawalDate = requestDate;
    await client.save();

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'Client Request',
      action: 'Withdrawal Requested',
      category: 'withdrawal_approval',
      details: `${client.firstName} ${client.lastName} requested Month ${targetMonth} Part ${targetPart} withdrawal of ₹${netAmount.toLocaleString(
        'en-IN'
      )} (Fee: ${feePct}% = ₹${feeAmount.toLocaleString('en-IN')})`,
    });

    return reply.status(201).send({
      success: true,
      message: `Withdrawal request for ₹${netAmount.toLocaleString(
        'en-IN'
      )} (Part ${targetPart} of Month ${targetMonth}) submitted successfully.`,
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

      const grossAmount = withdrawal.grossAmount || withdrawal.amount;
      const halfAmount = Math.round(grossAmount / 2);

      await Transaction.create({
        transactionId: `tx-${Date.now()}-1`,
        clientId: withdrawal.clientId,
        type: 'monthly_profit',
        typeLabel: `Tranche Profit Yield (${withdrawal.partIndex === 2 ? 'Part 2' : 'Part 1'})`,
        amount: halfAmount,
        date: withdrawal.disbursedDate,
        description: `Contractual 15-day profit tranche (Month ${withdrawal.monthIndex} / 14 • Part ${
          withdrawal.partIndex || 1
        }) • Ref ${utrReference || 'IMPS/NEFT'}`,
        currency: 'USDT',
        status: 'settled',
      });

      await Transaction.create({
        transactionId: `tx-${Date.now()}-2`,
        clientId: withdrawal.clientId,
        type: 'capital_return',
        typeLabel: `Tranche Capital Return (${withdrawal.partIndex === 2 ? 'Part 2' : 'Part 1'})`,
        amount: halfAmount,
        date: withdrawal.disbursedDate,
        description: `Contractual 15-day capital return (Month ${withdrawal.monthIndex} / 14 • Part ${
          withdrawal.partIndex || 1
        }) • Ref ${utrReference || 'IMPS/NEFT'}`,
        currency: 'USDT',
        status: 'settled',
      });

      if (withdrawal.feeAmount && withdrawal.feeAmount > 0) {
        await Transaction.create({
          transactionId: `tx-${Date.now()}-fee`,
          clientId: withdrawal.clientId,
          type: 'fee',
          typeLabel: `${withdrawal.feePct}% ${withdrawal.isLate ? 'Late' : 'Standard'} Processing Fee`,
          amount: -withdrawal.feeAmount,
          date: withdrawal.disbursedDate,
          description: `${withdrawal.isLate ? 'Late withdrawal fee (6%)' : 'Standard withdrawal fee (3%)'} deducted from disbursement.`,
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
      details: `${adminName || 'Admin'} marked withdrawal ${withdrawal.withdrawalId} as ${status}. UTR: ${utrReference || 'N/A'}`,
    });

    return reply.send({
      success: true,
      message: `Withdrawal marked as ${status}.`,
      data: withdrawal,
    });
  });
}


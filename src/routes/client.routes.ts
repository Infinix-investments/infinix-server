import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Client } from '../models/Client.js';
import { Plan } from '../models/Plan.js';
import { Investment } from '../models/Investment.js';
import { Referral } from '../models/Referral.js';
import { AuditLog } from '../models/AuditLog.js';

export async function clientRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // GET /api/clients
  fastify.get('/', async (request, reply) => {
    const { search, kycStatus, role } = request.query as any;
    const query: any = {};

    if (role) {
      query.role = role;
    } else {
      // default: return clients (hide admin from client roster unless requested)
      query.role = 'client';
    }

    if (kycStatus) {
      query.kycStatus = kycStatus;
    }

    if (search) {
      const s = search.trim();
      query.$or = [
        { firstName: { $regex: s, $options: 'i' } },
        { lastName: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { clientId: { $regex: s, $options: 'i' } },
      ];
    }

    const clients = await Client.find(query).sort({ createdAt: -1 });

    return reply.send({
      success: true,
      data: clients.map((c) => ({
        id: c.clientId,
        clientId: c.clientId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        status: c.status,
        tier: c.tier,
        riskTolerance: c.riskTolerance,
        kycStatus: c.kycStatus,
        isPhoneVerified: c.isPhoneVerified,
        assignedPlanId: c.assignedPlanId,
        assignedPlanName: c.assignedPlanName,
        assignedPlanAmount: c.assignedPlanAmount,
        assignedPlanStartDate: c.assignedPlanStartDate,
        assignedPlanStatus: c.assignedPlanStatus,
        currentMonthIndex: c.currentMonthIndex,
        currentMonthWithdrawn: c.currentMonthWithdrawn,
        lastWithdrawalDate: c.lastWithdrawalDate,
        bankAccount: c.bankAccount,
        totalAum: c.totalAum,
        referralCode: c.referralCode,
        referredByCode: c.referredByCode,
        joinedDate: c.joinedDate,
        notes: c.notes,
      })),
    });
  });

  // GET /api/clients/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const client = await Client.findOne({ clientId: id });

    if (!client) {
      return reply.status(404).send({ success: false, error: 'Client not found.' });
    }

    return reply.send({
      success: true,
      data: {
        id: client.clientId,
        clientId: client.clientId,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        status: client.status,
        tier: client.tier,
        riskTolerance: client.riskTolerance,
        kycStatus: client.kycStatus,
        isPhoneVerified: client.isPhoneVerified,
        assignedPlanId: client.assignedPlanId,
        assignedPlanName: client.assignedPlanName,
        assignedPlanAmount: client.assignedPlanAmount,
        assignedPlanStartDate: client.assignedPlanStartDate,
        assignedPlanStatus: client.assignedPlanStatus,
        currentMonthIndex: client.currentMonthIndex,
        currentMonthWithdrawn: client.currentMonthWithdrawn,
        lastWithdrawalDate: client.lastWithdrawalDate,
        bankAccount: client.bankAccount,
        totalAum: client.totalAum,
        referralCode: client.referralCode,
        referredByCode: client.referredByCode,
        joinedDate: client.joinedDate,
        notes: client.notes,
      },
    });
  });

  // POST /api/clients (Admin creates client)
  fastify.post('/', async (request, reply) => {
    const body = request.body as any;

    if (!body.email || !body.firstName) {
      return reply.status(400).send({ success: false, error: 'First name and email are required.' });
    }

    const cleanEmail = body.email.trim().toLowerCase();
    const existing = await Client.findOne({ email: cleanEmail });
    if (existing) {
      return reply.status(400).send({ success: false, error: 'A client with this email already exists.' });
    }

    const clientId = `c-${Date.now().toString().slice(-4)}`;
    const referralCode = `INF-${body.firstName.toUpperCase()}${clientId.slice(-3)}`;
    const hashedPassword = await bcrypt.hash((body.password || 'password123').trim(), 10);

    const client = await Client.create({
      clientId,
      firstName: body.firstName,
      lastName: body.lastName || 'Client',
      email: cleanEmail,
      phone: body.phone || '+91 98000 00000',
      password: hashedPassword,
      role: 'client',
      status: body.status || 'active',
      tier: body.tier || 'standard',
      riskTolerance: body.riskTolerance || 'moderate',
      kycStatus: body.kycStatus || 'pending',
      isPhoneVerified: !!body.isPhoneVerified,
      assignedPlanId: body.assignedPlanId || null,
      assignedPlanName: body.assignedPlanName,
      assignedPlanAmount: Number(body.assignedPlanAmount) || 0,
      assignedPlanStartDate: body.assignedPlanStartDate,
      assignedPlanStatus: body.assignedPlanId ? 'active' : 'pending_assignment',
      currentMonthIndex: 1,
      currentMonthWithdrawn: false,
      bankAccount: body.bankAccount || '',
      totalAum: Number(body.assignedPlanAmount) || Number(body.totalAum) || 0,
      referralCode,
      notes: body.notes || '',
      joinedDate: new Date().toISOString().split('T')[0],
    });

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: body.adminName || 'Administrator',
      action: 'Client Created',
      category: 'client_verification',
      details: `Created new client profile: ${client.firstName} ${client.lastName} (${client.email})`,
    });

    return reply.status(201).send({ success: true, data: client });
  });

  // PATCH /api/clients/:id
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const updates = request.body as any;

    const client = (await Client.findOne({ clientId: id })) || (await Client.findById(id));
    if (!client) {
      return reply.status(404).send({ success: false, error: 'Client not found.' });
    }

    if (updates.isPhoneVerified) {
      const effPhone = (updates.phone !== undefined ? updates.phone : client.phone || '').trim();
      if (effPhone.length < 7) {
        updates.isPhoneVerified = false;
      }
    }

    Object.assign(client, updates);
    await client.save();

    // If assigned plan was revoked or cleared via PATCH
    if (updates.assignedPlanStatus === 'pending_assignment' || updates.assignedPlanId === null) {
      await Investment.deleteMany({
        clientId: client.clientId,
        assetClass: 'private_plan',
      });
      await Referral.updateMany(
        { refereeId: client.clientId },
        {
          status: 'pending',
          capitalAmount: 0,
          monthlyCommissionAmount: 0,
        }
      );
    }

    return reply.send({ success: true, data: client });
  });

  // POST /api/clients/:id/assign-plan (Payment verified & plan started by Admin)
  fastify.post('/:id/assign-plan', async (request, reply) => {
    const { id } = request.params as any;
    const { planId, planName: passedPlanName, capitalAmount, startDate, paymentReference, adminName } = request.body as any;

    const client = (await Client.findOne({ clientId: id })) || (await Client.findById(id));
    if (!client) {
      return reply.status(404).send({ success: false, error: 'Client not found.' });
    }

    let plan = null;
    if (planId) {
      plan = (await Plan.findOne({ planId })) || (await Plan.findOne({ _id: mongoose.isValidObjectId(planId) ? planId : null }));
    }
    if (!plan && passedPlanName) {
      plan = await Plan.findOne({ planName: passedPlanName });
    }
    if (!plan && !passedPlanName && !planId) {
      plan = (await Plan.findOne({ isDefault: true })) || (await Plan.findOne());
    }

    const resolvedPlanId = plan ? plan.planId : (planId || 'plan-14m-15pct');
    const resolvedPlanName = plan ? plan.planName : (passedPlanName || '14-Month 15% Return Accelerator (0.5% Daily)');
    const amount = Number(capitalAmount) || 100000;
    const activeStartDate = startDate || new Date().toISOString().split('T')[0];

    // Create unique investment record for this newly purchased / allocated plan
    const investmentId = `inv-${Date.now().toString().slice(-6)}`;
    const durationMonths = plan?.durationMonths || 14;
    const dailyReturnPct = plan?.dailyReturnPct ?? 0.5;
    const monthlyReturnPct = plan?.monthlyReturnPct ?? 15.0;

    await Investment.create({
      investmentId,
      clientId: client.clientId,
      symbol: `INF-${durationMonths}M`,
      name: resolvedPlanName,
      assetClass: 'private_plan',
      shares: 1,
      investedAmount: amount,
      currentValue: amount,
      currentPrice: amount,
      currency: 'USDT',
      investmentDate: activeStartDate,
      valuationDate: activeStartDate,
      valuationType: 'manual',
      planId: resolvedPlanId,
      planName: resolvedPlanName,
      durationMonths,
      dailyReturnPct,
      monthlyReturnPct,
      status: 'active',
      notes: `Allocated by wealth administrator ${adminName || 'Admin'}. Payment verified${paymentReference ? ` (Ref: ${paymentReference})` : ''}. ${dailyReturnPct}% daily (${monthlyReturnPct}% monthly) distribution.`,
      valuationHistory: [
        {
          id: `vh-${Date.now()}`,
          date: activeStartDate,
          value: amount,
          notes: 'Initial contractual plan allocation following payment verification',
        },
      ],
    });

    // Compute cumulative active plans capital for this client
    const allActiveInvestments = await Investment.find({
      clientId: client.clientId,
      assetClass: 'private_plan',
      status: 'active',
    });
    const totalActivePlanCapital = allActiveInvestments.reduce((sum, inv) => sum + (inv.investedAmount || 0), 0);

    // Update client profile fields
    client.assignedPlanId = resolvedPlanId;
    client.assignedPlanName = resolvedPlanName;
    client.assignedPlanAmount = totalActivePlanCapital;
    client.assignedPlanStartDate = activeStartDate;
    client.assignedPlanStatus = 'active';
    client.totalAum = totalActivePlanCapital;
    client.kycStatus = 'verified';
    client.isPhoneVerified = Boolean(client.phone && client.phone.trim().length >= 7);
    await client.save();

    // Update referrals where this client is the referee with their cumulative invested capital
    await Referral.updateMany(
      { refereeId: client.clientId },
      {
        status: 'active',
        planName: resolvedPlanName,
        capitalAmount: totalActivePlanCapital,
        monthlyCommissionAmount: Math.round(totalActivePlanCapital * (monthlyReturnPct / 100) * 0.10),
      }
    );

    // Record in Audit Log
    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: adminName || 'Administrator',
      action: 'Plan Activated (Payment Verified)',
      category: 'plan_assignment',
      details: `Payment verified & activated ${resolvedPlanName} (${amount.toLocaleString('en-US')} USDT) for ${client.firstName} ${client.lastName} (${client.clientId}). Start Date: ${activeStartDate}. Ref: ${paymentReference || 'Direct USDT Escrow Verified'}.`,
    });

    return reply.send({
      success: true,
      message: `Payment verified. "${resolvedPlanName}" successfully activated for ${client.firstName} ${client.lastName}.`,
      data: client,
    });
  });

  // POST /api/clients/:id/revoke-plan (Revoke active investment plan)
  fastify.post('/:id/revoke-plan', async (request, reply) => {
    const { id } = request.params as any;
    const { adminName, reason } = (request.body as any) || {};

    const client = (await Client.findOne({ clientId: id })) || (await Client.findById(id));
    if (!client) {
      return reply.status(404).send({ success: false, error: 'Client not found.' });
    }

    const prevPlanName = client.assignedPlanName || 'Private Wealth Plan';
    const prevAmount = client.assignedPlanAmount || 0;

    // Reset client plan state
    client.assignedPlanId = null;
    client.assignedPlanName = undefined;
    client.assignedPlanAmount = 0;
    client.assignedPlanStartDate = undefined;
    client.assignedPlanStatus = 'pending_assignment';
    client.totalAum = 0;
    client.currentMonthWithdrawn = false;
    client.currentMonthIndex = 1;
    await client.save();

    // Delete active private_plan investment records so they disappear from client portfolio
    await Investment.deleteMany({
      clientId: client.clientId,
      assetClass: 'private_plan',
    });

    // Reset referral commissions associated with this referee back to pending
    await Referral.updateMany(
      { refereeId: client.clientId },
      {
        status: 'pending',
        capitalAmount: 0,
        monthlyCommissionAmount: 0,
      }
    );

    // Record in Audit Log
    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: adminName || 'Chief Wealth Admin (Altaf)',
      action: 'Plan Revoked',
      category: 'plan_assignment',
      details: `Revoked active investment plan "${prevPlanName}" (${prevAmount.toLocaleString('en-US')} USDT) from ${client.firstName} ${client.lastName} (${client.clientId}). Account returned to pending allocation.${reason ? ` Reason: ${reason}` : ''}`,
    });

    return reply.send({
      success: true,
      message: `Investment plan revoked successfully for ${client.firstName} ${client.lastName}.`,
      data: client,
    });
  });
}


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
        activePlans: c.activePlans || [],
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
        activePlans: client.activePlans || [],
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

    // Initialize or migrate activePlans array on client document
    if (!client.activePlans) {
      client.activePlans = [];
    }

    // If client had an existing plan that was not yet in activePlans, preserve it!
    if (
      client.activePlans.length === 0 &&
      client.assignedPlanId &&
      client.assignedPlanAmount &&
      client.assignedPlanAmount > 0 &&
      client.assignedPlanStatus === 'active'
    ) {
      let prevPlan = null;
      if (client.assignedPlanId) {
        prevPlan = (await Plan.findOne({ planId: client.assignedPlanId })) ||
                   (await Plan.findOne({ _id: mongoose.isValidObjectId(client.assignedPlanId) ? client.assignedPlanId : null }));
      }
      if (!prevPlan && client.assignedPlanName) {
        prevPlan = await Plan.findOne({ planName: client.assignedPlanName });
      }

      const prevDuration = prevPlan?.durationMonths || 14;
      const prevDaily = prevPlan?.dailyReturnPct ?? 0.5;
      const prevMonthly = prevPlan?.monthlyReturnPct ?? 15.0;
      const prevGross = prevPlan?.grossTotalReturnPct ?? (prevMonthly * prevDuration);

      client.activePlans.push({
        planInstanceId: `plan-initial-${client.clientId}`,
        planId: client.assignedPlanId,
        planName: client.assignedPlanName || prevPlan?.planName || 'Primary Plan',
        capitalAmount: client.assignedPlanAmount,
        startDate: client.assignedPlanStartDate || new Date().toISOString().split('T')[0],
        durationMonths: prevDuration,
        dailyReturnPct: prevDaily,
        monthlyReturnPct: prevMonthly,
        grossTotalReturnPct: prevGross,
        status: 'active',
        paymentReference: 'Initial Plan',
        assignedAt: client.assignedPlanStartDate || new Date().toISOString(),
      });
    }

    const planInstanceId = `plan-${Date.now().toString().slice(-6)}`;
    const newPlanInstance = {
      planInstanceId,
      planId: resolvedPlanId,
      planName: resolvedPlanName,
      capitalAmount: amount,
      startDate: activeStartDate,
      durationMonths,
      dailyReturnPct,
      monthlyReturnPct,
      grossTotalReturnPct: plan?.grossTotalReturnPct || (monthlyReturnPct * durationMonths),
      status: 'active' as const,
      paymentReference: paymentReference || '',
      assignedAt: new Date().toISOString(),
    };

    client.activePlans.push(newPlanInstance);

    // Compute cumulative active plans capital
    const totalActivePlanCapital = client.activePlans
      .filter((p) => p.status === 'active')
      .reduce((sum, p) => sum + (Number(p.capitalAmount) || 0), 0);

    // Earliest start date across active plans
    const validDates = client.activePlans
      .filter((p) => p.status === 'active' && p.startDate)
      .map((p) => new Date(p.startDate).getTime())
      .filter((t) => !isNaN(t));
    const earliestStartDate = validDates.length > 0
      ? new Date(Math.min(...validDates)).toISOString().split('T')[0]
      : activeStartDate;

    // Update client profile fields
    client.assignedPlanId = resolvedPlanId;
    client.assignedPlanName = resolvedPlanName;
    client.assignedPlanAmount = totalActivePlanCapital;
    client.assignedPlanStartDate = earliestStartDate;
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
    const { adminName, reason, planInstanceId } = (request.body as any) || {};

    const client = (await Client.findOne({ clientId: id })) || (await Client.findById(id));
    if (!client) {
      return reply.status(404).send({ success: false, error: 'Client not found.' });
    }

    // Revoke single plan instance if requested
    if (planInstanceId && client.activePlans && client.activePlans.length > 0) {
      const revoked = client.activePlans.find((p) => p.planInstanceId === planInstanceId);
      client.activePlans = client.activePlans.filter((p) => p.planInstanceId !== planInstanceId);
      const remainingActive = client.activePlans.filter((p) => p.status === 'active');
      const totalCap = remainingActive.reduce((sum, p) => sum + (Number(p.capitalAmount) || 0), 0);

      client.assignedPlanAmount = totalCap;
      client.totalAum = totalCap;
      if (remainingActive.length === 0) {
        client.assignedPlanId = null;
        client.assignedPlanName = undefined;
        client.assignedPlanStartDate = undefined;
        client.assignedPlanStatus = 'pending_assignment';
      } else {
        const earliest = remainingActive.map((p) => p.startDate).sort()[0];
        client.assignedPlanStartDate = earliest;
      }
      await client.save();

      await Investment.deleteMany({
        clientId: client.clientId,
        assetClass: 'private_plan',
        ...(revoked?.planId ? { planId: revoked.planId } : {}),
      });

      return reply.send({
        success: true,
        message: `Plan contract ${revoked?.planName || planInstanceId} revoked successfully.`,
        data: client,
      });
    }

    const prevPlanName = client.assignedPlanName || 'Private Wealth Plan';
    const prevAmount = client.assignedPlanAmount || 0;

    // Reset all client plan state
    client.assignedPlanId = null;
    client.assignedPlanName = undefined;
    client.assignedPlanAmount = 0;
    client.assignedPlanStartDate = undefined;
    client.assignedPlanStatus = 'pending_assignment';
    client.activePlans = [];
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


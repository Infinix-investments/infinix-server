import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import bcrypt from 'bcryptjs';
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
    const { planId, capitalAmount, startDate, paymentReference, adminName } = request.body as any;

    const client = (await Client.findOne({ clientId: id })) || (await Client.findById(id));
    if (!client) {
      return reply.status(404).send({ success: false, error: 'Client not found.' });
    }

    const plan = (await Plan.findOne({ planId })) || (await Plan.findOne({ isDefault: true })) || (await Plan.findOne());
    const planName = plan ? plan.planName : '14-Month 15% Return Accelerator (0.5% Daily)';
    const amount = Number(capitalAmount) || 100000;
    const activeStartDate = startDate || new Date().toISOString().split('T')[0];

    client.assignedPlanId = plan ? plan.planId : 'plan-14m-15pct';
    client.assignedPlanName = planName;
    client.assignedPlanAmount = amount;
    client.assignedPlanStartDate = activeStartDate;
    client.assignedPlanStatus = 'active';
    client.totalAum = amount;
    client.kycStatus = 'verified';
    client.isPhoneVerified = true;
    await client.save();

    // Remove any previous private_plan investment before creating the new active one
    await Investment.deleteMany({
      clientId: client.clientId,
      assetClass: 'private_plan',
    });

    // Create matching investment record
    const investmentId = `inv-${Date.now().toString().slice(-4)}`;
    await Investment.create({
      investmentId,
      clientId: client.clientId,
      symbol: 'INF-14M',
      name: planName,
      assetClass: 'private_plan',
      shares: 1,
      investedAmount: amount,
      currentValue: amount,
      currentPrice: amount,
      currency: 'USDT',
      investmentDate: activeStartDate,
      valuationDate: activeStartDate,
      valuationType: 'manual',
      notes: `Allocated by wealth administrator ${adminName || 'Admin'}. Payment verified${paymentReference ? ` (Ref: ${paymentReference})` : ''}. 0.5% daily (15% monthly) distribution.`,
      valuationHistory: [
        {
          id: `vh-${Date.now()}`,
          date: activeStartDate,
          value: amount,
          notes: 'Initial contractual plan allocation following payment verification',
        },
      ],
    });

    // Update referrals where this client is the referee to active
    await Referral.updateMany(
      { refereeId: client.clientId },
      {
        status: 'active',
        planName,
        capitalAmount: amount,
        monthlyCommissionAmount: Math.round(amount * 0.15 * 0.10),
      }
    );

    // Record in Audit Log
    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: adminName || 'Administrator',
      action: 'Plan Activated (Payment Verified)',
      category: 'plan_assignment',
      details: `Payment verified & activated ${planName} (${amount.toLocaleString('en-US')} USDT) for ${client.firstName} ${client.lastName} (${client.clientId}). Start Date: ${activeStartDate}. Ref: ${paymentReference || 'Direct USDT Escrow Verified'}.`,
    });

    return reply.send({
      success: true,
      message: `Payment verified. "${planName}" successfully activated for ${client.firstName} ${client.lastName}.`,
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


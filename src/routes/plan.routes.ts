import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Plan } from '../models/Plan.js';
import { AuditLog } from '../models/AuditLog.js';

export async function planRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // GET /api/plans
  fastify.get('/', async (request, reply) => {
    const plans = await Plan.find().sort({ isDefault: -1, createdAt: -1 });

    return reply.send({
      success: true,
      data: plans.map((p) => ({
        id: p.planId,
        planId: p.planId,
        planName: p.planName,
        description: p.description,
        monthlyReturnPct: p.monthlyReturnPct,
        dailyReturnPct: p.dailyReturnPct ?? 0.5,
        durationMonths: p.durationMonths,
        capitalReturnMonthlyPct: p.capitalReturnMonthlyPct,
        profitMonthlyPct: p.profitMonthlyPct,
        grossTotalReturnPct: p.grossTotalReturnPct,
        netProfitPct: p.netProfitPct,
        minInvestment: p.minInvestment,
        maxInvestment: p.maxInvestment,
        isDefault: p.isDefault,
        status: p.status,
      })),
    });
  });

  // POST /api/plans
  fastify.post('/', async (request, reply) => {
    const body = request.body as any;

    if (!body.planName) {
      return reply.status(400).send({ success: false, error: 'Plan name is required.' });
    }

    if (body.isDefault) {
      await Plan.updateMany({}, { isDefault: false });
    }

    const planId = body.planId || `plan-${Date.now().toString().slice(-4)}`;
    const monthlyReturnPct = Number(body.monthlyReturnPct) || 15.0;
    const dailyReturnPct = Number(body.dailyReturnPct) || 0.5;
    const durationMonths = Number(body.durationMonths) || 14;
    const grossTotalReturnPct = Number(body.grossTotalReturnPct) || (monthlyReturnPct * durationMonths);

    const plan = await Plan.create({
      planId,
      planName: body.planName,
      description: body.description || '',
      monthlyReturnPct,
      dailyReturnPct,
      durationMonths,
      capitalReturnMonthlyPct: Number(body.capitalReturnMonthlyPct) || parseFloat((monthlyReturnPct / 2).toFixed(2)),
      profitMonthlyPct: Number(body.profitMonthlyPct) || parseFloat((monthlyReturnPct / 2).toFixed(2)),
      grossTotalReturnPct,
      netProfitPct: Number(body.netProfitPct) || (grossTotalReturnPct - 100),
      minInvestment: body.minInvestment !== undefined ? Number(body.minInvestment) : 100,
      maxInvestment: body.maxInvestment !== undefined ? Number(body.maxInvestment) : 10000000,
      isDefault: !!body.isDefault,
      status: body.status || 'active',
    });

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: body.adminName || 'Administrator',
      action: 'Plan Created',
      category: 'plan_config',
      details: `Created new wealth plan: ${plan.planName} (${plan.monthlyReturnPct}%/mo, ${dailyReturnPct}%/day for ${plan.durationMonths}M)`,
    });

    return reply.status(201).send({ success: true, data: plan });
  });

  // PATCH /api/plans/:id
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const updates = request.body as any;

    const plan = await Plan.findOne({ planId: id });
    if (!plan) {
      return reply.status(404).send({ success: false, error: 'Plan not found.' });
    }

    if (updates.isDefault) {
      await Plan.updateMany({ planId: { $ne: id } }, { isDefault: false });
    }

    Object.assign(plan, updates);
    await plan.save();

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: updates.adminName || 'Administrator',
      action: 'Plan Modified',
      category: 'plan_config',
      details: `Updated wealth plan ${plan.planName}: ${plan.monthlyReturnPct}%/mo (${plan.dailyReturnPct ?? 0.5}%/day, ${plan.durationMonths}M)`,
    });

    return reply.send({ success: true, data: plan });
  });

  // DELETE /api/plans/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const body = (request.body as any) || {};

    const plan = await Plan.findOne({ planId: id });
    if (!plan) {
      return reply.status(404).send({ success: false, error: 'Plan not found.' });
    }

    const planName = plan.planName;
    await Plan.deleteOne({ planId: id });

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: body.adminName || 'Administrator',
      action: 'Plan Removed',
      category: 'plan_config',
      details: `Deleted wealth plan: ${planName} (${id})`,
    });

    return reply.send({ success: true, message: `Plan "${planName}" successfully removed.` });
  });
}


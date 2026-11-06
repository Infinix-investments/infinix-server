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

    const planId = body.planId || `plan-${Date.now().toString().slice(-4)}`;
    const plan = await Plan.create({
      planId,
      planName: body.planName,
      description: body.description || '',
      monthlyReturnPct: Number(body.monthlyReturnPct) || 15.0,
      durationMonths: Number(body.durationMonths) || 14,
      capitalReturnMonthlyPct: Number(body.capitalReturnMonthlyPct) || 7.5,
      profitMonthlyPct: Number(body.profitMonthlyPct) || 7.5,
      grossTotalReturnPct: Number(body.grossTotalReturnPct) || 210.0,
      netProfitPct: Number(body.netProfitPct) || 105.0,
      minInvestment: Number(body.minInvestment) || 1000000,
      maxInvestment: Number(body.maxInvestment) || 50000000,
      isDefault: !!body.isDefault,
      status: body.status || 'active',
    });

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: body.adminName || 'Administrator',
      action: 'Plan Created',
      category: 'plan_config',
      details: `Created new wealth plan: ${plan.planName} (${plan.monthlyReturnPct}%/mo for ${plan.durationMonths}M)`,
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

    Object.assign(plan, updates);
    await plan.save();

    return reply.send({ success: true, data: plan });
  });
}


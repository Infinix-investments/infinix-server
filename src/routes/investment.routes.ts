import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Investment } from '../models/Investment.js';

export async function investmentRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // GET /api/investments
  fastify.get('/', async (request, reply) => {
    const { clientId } = request.query as any;
    const query: any = {};
    if (clientId) {
      query.clientId = clientId;
    }

    const investments = await Investment.find(query).sort({ createdAt: -1 });

    return reply.send({
      success: true,
      data: investments.map((inv) => ({
        id: inv.investmentId,
        investmentId: inv.investmentId,
        clientId: inv.clientId,
        symbol: inv.symbol,
        name: inv.name,
        assetClass: inv.assetClass,
        shares: inv.shares,
        investedAmount: inv.investedAmount,
        currentValue: inv.currentValue,
        currentPrice: inv.currentPrice,
        currency: inv.currency,
        investmentDate: inv.investmentDate,
        valuationDate: inv.valuationDate,
        valuationType: inv.valuationType,
        planId: inv.planId,
        planName: inv.planName,
        durationMonths: inv.durationMonths,
        dailyReturnPct: inv.dailyReturnPct,
        monthlyReturnPct: inv.monthlyReturnPct,
        status: inv.status || 'active',
        notes: inv.notes,
        valuationHistory: inv.valuationHistory || [],
      })),
    });
  });

  // POST /api/investments
  fastify.post('/', async (request, reply) => {
    const body = request.body as any;

    if (!body.clientId || !body.name || body.investedAmount === undefined) {
      return reply.status(400).send({
        success: false,
        error: 'clientId, name, and investedAmount are required.',
      });
    }

    const investmentId = body.investmentId || `inv-${Date.now().toString().slice(-4)}`;
    const investment = await Investment.create({
      investmentId,
      clientId: body.clientId,
      symbol: body.symbol || body.name.slice(0, 6).toUpperCase(),
      name: body.name,
      assetClass: body.assetClass || 'private_plan',
      shares: Number(body.shares) || 1,
      investedAmount: Number(body.investedAmount),
      currentValue: Number(body.currentValue ?? body.investedAmount),
      currentPrice: Number(body.currentPrice ?? body.investedAmount),
      currency: body.currency || 'USDT',
      investmentDate: body.investmentDate || new Date().toISOString().split('T')[0],
      valuationDate: body.valuationDate || new Date().toISOString().split('T')[0],
      valuationType: body.valuationType || 'manual',
      notes: body.notes || '',
      valuationHistory: body.valuationHistory || [
        {
          id: `vh-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          value: Number(body.investedAmount),
          notes: 'Initial allocation',
        },
      ],
    });

    return reply.status(201).send({ success: true, data: investment });
  });

  // PATCH /api/investments/:id
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const updates = request.body as any;

    const investment = await Investment.findOne({ investmentId: id });
    if (!investment) {
      return reply.status(404).send({ success: false, error: 'Investment not found.' });
    }

    // If new valuation is provided, append to history
    if (updates.newValuation !== undefined) {
      const val = Number(updates.newValuation);
      investment.currentValue = val;
      investment.currentPrice = investment.shares ? val / investment.shares : val;
      investment.valuationDate = updates.valuationDate || new Date().toISOString().split('T')[0];
      investment.valuationHistory.push({
        id: `vh-${Date.now()}`,
        date: investment.valuationDate,
        value: val,
        notes: updates.valuationNotes || 'Manual valuation adjustment',
        enteredBy: updates.adminName || 'Admin Desk',
      });
    }

    delete updates.newValuation;
    delete updates.valuationNotes;
    Object.assign(investment, updates);
    await investment.save();

    return reply.send({ success: true, data: investment });
  });

  // DELETE /api/investments/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const res = await Investment.deleteOne({ investmentId: id });

    if (!res.deletedCount) {
      return reply.status(404).send({ success: false, error: 'Investment not found.' });
    }

    return reply.send({ success: true, message: 'Investment deleted.' });
  });
}


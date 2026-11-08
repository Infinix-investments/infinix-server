import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Transaction } from '../models/Transaction.js';

export async function transactionRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // GET /api/transactions
  fastify.get('/', async (request, reply) => {
    const { clientId, type } = request.query as any;
    const query: any = {};
    if (clientId) query.clientId = clientId;
    if (type) query.type = type;

    const transactions = await Transaction.find(query).sort({ date: -1, createdAt: -1 });

    return reply.send({
      success: true,
      data: transactions.map((t) => ({
        id: t.transactionId,
        transactionId: t.transactionId,
        clientId: t.clientId,
        investmentId: t.investmentId,
        investmentName: t.investmentName,
        type: t.type,
        typeLabel: t.typeLabel,
        amount: t.amount,
        date: t.date,
        description: t.description,
        currency: t.currency,
        status: t.status,
      })),
    });
  });

  // POST /api/transactions
  fastify.post('/', async (request, reply) => {
    const body = request.body as any;

    if (!body.clientId || !body.type || body.amount === undefined) {
      return reply.status(400).send({
        success: false,
        error: 'clientId, type, and amount are required.',
      });
    }

    const transactionId = body.transactionId || `tx-${Date.now().toString().slice(-4)}`;
    const tx = await Transaction.create({
      transactionId,
      clientId: body.clientId,
      investmentId: body.investmentId,
      investmentName: body.investmentName,
      type: body.type,
      typeLabel: body.typeLabel,
      amount: Number(body.amount),
      date: body.date || new Date().toISOString().split('T')[0],
      description: body.description || '',
      currency: body.currency || 'USDT',
      status: body.status || 'settled',
    });

    return reply.status(201).send({ success: true, data: tx });
  });
}


import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AuditLog } from '../models/AuditLog.js';

export async function auditRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // GET /api/audit-logs
  fastify.get('/', async (request, reply) => {
    const { category, search, limit } = request.query as any;
    const query: any = {};
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { action: { $regex: search, $options: 'i' } },
        { details: { $regex: search, $options: 'i' } },
        { adminName: { $regex: search, $options: 'i' } },
      ];
    }

    const maxItems = Number(limit) || 100;
    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(maxItems);

    return reply.send({
      success: true,
      data: logs.map((l) => ({
        id: l.auditId,
        auditId: l.auditId,
        timestamp: l.timestamp,
        adminName: l.adminName,
        action: l.action,
        category: l.category,
        details: l.details,
      })),
    });
  });

  // POST /api/audit-logs
  fastify.post('/', async (request, reply) => {
    const body = request.body as any;

    if (!body.action || !body.category || !body.details) {
      return reply.status(400).send({
        success: false,
        error: 'action, category, and details are required.',
      });
    }

    const log = await AuditLog.create({
      auditId: body.auditId || `audit-${Date.now()}`,
      timestamp: body.timestamp || new Date().toISOString(),
      adminName: body.adminName || 'Administrator',
      action: body.action,
      category: body.category,
      details: body.details,
    });

    return reply.status(201).send({ success: true, data: log });
  });
}


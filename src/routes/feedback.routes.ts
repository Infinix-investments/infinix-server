import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Feedback } from '../models/Feedback.js';

export async function feedbackRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // GET /api/feedbacks (Admin fetches user feedbacks)
  fastify.get('/', async (request, reply) => {
    try {
      const { category, search, limit } = request.query as any;
      const query: any = {};
      if (category && category !== 'all') query.category = category;
      if (search) {
        query.$or = [
          { message: { $regex: search, $options: 'i' } },
          { userEmail: { $regex: search, $options: 'i' } },
          { userName: { $regex: search, $options: 'i' } },
        ];
      }

      const maxItems = Number(limit) || 200;
      const items = await Feedback.find(query).sort({ createdAt: -1 }).limit(maxItems);

      return reply.send({
        success: true,
        data: items.map((f) => ({
          id: f.feedbackId,
          feedbackId: f.feedbackId,
          category: f.category,
          rating: f.rating,
          message: f.message,
          userEmail: f.userEmail,
          userName: f.userName,
          createdAt: f.createdAt ? f.createdAt.toISOString() : new Date().toISOString(),
        })),
      });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err?.message || 'Failed to fetch user feedbacks',
      });
    }
  });

  // POST /api/feedbacks (Users submit feedback)
  fastify.post('/', async (request, reply) => {
    try {
      const body = request.body as any;

      if (!body.message || !body.message.trim()) {
        return reply.status(400).send({
          success: false,
          error: 'Feedback message is required.',
        });
      }

      const item = await Feedback.create({
        feedbackId: body.feedbackId || `fb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        category: body.category || 'General',
        rating: Number(body.rating) || 5,
        message: body.message.trim(),
        userEmail: body.userEmail || 'investor@infinix.com',
        userName: body.userName || 'Investor',
      });

      return reply.status(201).send({
        success: true,
        data: {
          id: item.feedbackId,
          feedbackId: item.feedbackId,
          category: item.category,
          rating: item.rating,
          message: item.message,
          userEmail: item.userEmail,
          userName: item.userName,
          createdAt: item.createdAt ? item.createdAt.toISOString() : new Date().toISOString(),
        },
      });
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err?.message || 'Failed to submit feedback.',
      });
    }
  });
}

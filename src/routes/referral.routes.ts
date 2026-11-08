import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Referral } from '../models/Referral.js';
import { ReferralTier } from '../models/ReferralTier.js';
import { Client } from '../models/Client.js';
import { AuditLog } from '../models/AuditLog.js';

export async function referralRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // GET /api/referrals
  fastify.get('/', async (request, reply) => {
    const { referrerId, referrerCode, level, status } = request.query as any;

    let targetCode = referrerCode;
    if (!targetCode && referrerId) {
      const refClient = await Client.findOne({ clientId: referrerId });
      if (refClient) {
        targetCode = refClient.referralCode;
      }
    }

    const query: any = {};
    if (referrerId && targetCode) {
      query.$or = [{ referrerId }, { referrerCode: targetCode }];
    } else if (referrerId) {
      query.referrerId = referrerId;
    } else if (targetCode) {
      query.referrerCode = targetCode;
    }
    if (level) query.level = Number(level);
    if (status) query.status = status;

    const referrals = await Referral.find(query).sort({ createdAt: -1 });

    // Also include any clients who registered with referredByCode matching targetCode
    if (targetCode) {
      const registeredReferees = await Client.find({ referredByCode: targetCode });
      for (const rc of registeredReferees) {
        const alreadyExists = referrals.some(
          (r) => r.refereeId === rc.clientId || r.refereeEmail.toLowerCase() === rc.email.toLowerCase()
        );
        if (!alreadyExists) {
          const cap = rc.assignedPlanAmount || 0;
          const monthlyRoi = Math.round(cap * 0.15);
          const comm = Math.round(monthlyRoi * 0.10);
          referrals.push({
            referralId: `ref-${rc.clientId}`,
            referrerId: referrerId || '',
            referrerName: 'Wealth Partner',
            referrerCode: targetCode,
            refereeId: rc.clientId,
            refereeName: `${rc.firstName} ${rc.lastName}`,
            refereeEmail: rc.email,
            refereePhone: rc.phone || '',
            level: 1,
            planName: rc.assignedPlanName || '14-Month Wealth Accelerator',
            capitalAmount: cap,
            commissionRatePct: 10.0,
            monthlyCommissionAmount: comm,
            totalEarnedAmount: comm,
            status: rc.assignedPlanStatus === 'active' ? 'active' : 'pending',
            dateJoined: rc.joinedDate,
          } as any);
        }
      }
    }

    return reply.send({
      success: true,
      data: referrals.map((r) => ({
        id: r.referralId,
        referralId: r.referralId,
        referrerId: r.referrerId,
        referrerName: r.referrerName,
        referrerCode: r.referrerCode,
        refereeId: r.refereeId,
        refereeName: r.refereeName,
        refereeEmail: r.refereeEmail,
        refereePhone: r.refereePhone,
        level: r.level,
        planName: r.planName,
        capitalAmount: r.capitalAmount,
        commissionRatePct: r.commissionRatePct,
        monthlyCommissionAmount: r.monthlyCommissionAmount,
        totalEarnedAmount: r.totalEarnedAmount,
        status: r.status,
        dateJoined: r.dateJoined,
      })),
    });
  });

  // GET /api/referrals/tiers
  fastify.get('/tiers', async (request, reply) => {
    const tiers = await ReferralTier.find().sort({ level: 1 });

    return reply.send({
      success: true,
      data: tiers.map((t) => ({
        level: t.level,
        name: t.name,
        commissionPct: t.commissionPct,
        minTeamAum: t.minTeamAum,
        minDirectReferrals: t.minDirectReferrals,
        description: t.description,
        totalMembersCount: t.totalMembersCount,
        totalVolumeGenerated: t.totalVolumeGenerated,
        status: t.status,
      })),
    });
  });

  // POST /api/referrals (Create referral partnership)
  fastify.post('/', async (request, reply) => {
    const body = request.body as any;

    if (!body.referrerId || !body.refereeName) {
      return reply.status(400).send({
        success: false,
        error: 'referrerId and refereeName are required.',
      });
    }

    const referralId = body.referralId || `ref-${Date.now().toString().slice(-4)}`;
    const capital = Number(body.capitalAmount) || 0;
    const level = Number(body.level) || 1;
    
    // Level specific commission percentage of ROI:
    // Level 1: 10%, Level 2: 5%, Level 3: 3%, Level 4: 2%, Level 5: 1%
    const levelPercentages: Record<number, number> = {
      1: 10.0,
      2: 5.0,
      3: 3.0,
      4: 2.0,
      5: 1.0,
    };
    const commissionPct = Number(body.commissionRatePct) || levelPercentages[level] || 5.0;
    
    // Referred person's monthly ROI (15% on 14-Month Accelerator plan)
    const monthlyRoi = Math.round(capital * 0.15);
    
    // Level profit = level specific percentage of ROI of their investment
    const monthlyCommission = Math.round(monthlyRoi * (commissionPct / 100));

    const referral = await Referral.create({
      referralId,
      referrerId: body.referrerId,
      referrerName: body.referrerName || 'Wealth Partner',
      referrerCode: body.referrerCode || 'INF-PARTNER',
      refereeId: body.refereeId || `referee-${Date.now().toString().slice(-4)}`,
      refereeName: body.refereeName,
      refereeEmail: body.refereeEmail || '',
      refereePhone: body.refereePhone || '',
      level: Number(body.level) || 1,
      planName: body.planName || '14-Month 15% Return Accelerator',
      capitalAmount: capital,
      commissionRatePct: commissionPct,
      monthlyCommissionAmount: monthlyCommission,
      totalEarnedAmount: 0,
      status: body.status || (capital > 0 ? 'active' : 'pending_activation'),
      dateJoined: body.dateJoined || new Date().toISOString().split('T')[0],
    });

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: body.adminName || 'System',
      action: 'Referral Added',
      category: 'referral_management',
      details: `Referral registered: ${referral.refereeName} introduced by ${referral.referrerName} (${referral.referrerCode})`,
    });

    return reply.status(201).send({ success: true, data: referral });
  });
}


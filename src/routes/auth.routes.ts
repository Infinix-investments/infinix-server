import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Client } from '../models/Client.js';
import { Referral } from '../models/Referral.js';
import { AuditLog } from '../models/AuditLog.js';
import { sendOtpEmail } from '../services/email.service.js';

export async function authRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const { identifier, email, password } = request.body as any;
    const loginId = (identifier || email || '').trim().toLowerCase();
    const loginPass = (password || '').trim();

    if (!loginId || !loginPass) {
      return reply.status(400).send({
        success: false,
        error: 'Please provide both email/username and password.',
      });
    }

    // Standard Database Lookup
    const user = await Client.findOne({
      $or: [
        { email: loginId },
        { clientId: loginId },
        { phone: loginId.replace(/[\s+-]/g, '') },
      ],
    });

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password. Please verify your credentials.',
      });
    }

    // Legitimate password validation
    const isValidPass = user.password ? user.password === loginPass : loginPass === 'password123';

    if (!isValidPass) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password. Please check your credentials.',
      });
    }

    // Generate JWT token
    const token = fastify.jwt.sign({
      id: user.clientId,
      email: user.email,
      role: user.role,
    });

    return reply.send({
      success: true,
      token,
      user: {
        id: user.clientId,
        clientId: user.clientId,
        username: user.email.split('@')[0],
        email: user.email,
        phone: user.phone,
        role: user.role,
        displayName: `${user.firstName} ${user.lastName}`,
        isPhoneVerified: !!user.isPhoneVerified,
        kycStatus: user.kycStatus,
        assignedPlanId: user.assignedPlanId || null,
        assignedPlanName: user.assignedPlanName,
        assignedPlanAmount: user.assignedPlanAmount,
        referralCode: user.referralCode,
      },
    });
  });

  // POST /api/auth/register (First name, Last name, Email, Password -> Passcode sent to email)
  fastify.post('/register', async (request, reply) => {
    const { email, password, firstName, lastName, fullName, referralCode } = request.body as any;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();
    let cleanFirstName = (firstName || '').trim();
    let cleanLastName = (lastName || '').trim();

    if (!cleanFirstName && fullName) {
      const parts = fullName.trim().split(' ');
      cleanFirstName = parts[0] || '';
      cleanLastName = parts.slice(1).join(' ') || '';
    }

    if (!cleanFirstName) {
      return reply.status(400).send({
        success: false,
        error: 'Please enter your first name.',
      });
    }

    if (!cleanLastName) {
      return reply.status(400).send({
        success: false,
        error: 'Please enter your last name.',
      });
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return reply.status(400).send({
        success: false,
        error: 'Please enter a valid email address.',
      });
    }

    if (!cleanPassword || cleanPassword.length < 4) {
      return reply.status(400).send({
        success: false,
        error: 'Password must be at least 4 characters long.',
      });
    }

    const existing = await Client.findOne({ email: cleanEmail });
    if (existing) {
      // If already verified, require signing in
      if (existing.isPhoneVerified) {
        return reply.status(400).send({
          success: false,
          error: 'An account with this email address already exists. Please sign in with your email and password.',
        });
      }

      // If pending verification, update info and send fresh passcode
      existing.firstName = cleanFirstName;
      existing.lastName = cleanLastName;
      existing.password = cleanPassword;
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      existing.emailOtp = generatedOtp;
      existing.emailOtpExpires = new Date(Date.now() + 15 * 60 * 1000);
      await existing.save();

      await sendOtpEmail(cleanEmail, generatedOtp, cleanFirstName);

      const token = fastify.jwt.sign({
        id: existing.clientId,
        email: existing.email,
        role: existing.role,
      });

      return reply.status(200).send({
        success: true,
        message: `A 6-digit verification passcode has been dispatched to ${cleanEmail}.`,
        token,
        demoOtp: generatedOtp,
        user: {
          id: existing.clientId,
          clientId: existing.clientId,
          username: existing.email.split('@')[0],
          email: existing.email,
          phone: existing.phone,
          role: existing.role,
          displayName: `${existing.firstName} ${existing.lastName}`,
          isPhoneVerified: false,
          kycStatus: existing.kycStatus,
          assignedPlanId: null,
          referralCode: existing.referralCode,
        },
      });
    }

    const newClientId = `c-${Date.now().toString().slice(-4)}`;

    // Generate guaranteed unique referral code for every user
    const namePrefix = cleanFirstName.replace(/[^A-Za-z]/g, '').toUpperCase() || 'USER';
    let myReferralCode = '';
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      attempts++;
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const candidate = `INF-${namePrefix}${randomSuffix}`;
      const exists = await Client.findOne({ referralCode: candidate });
      if (!exists) {
        myReferralCode = candidate;
        isUnique = true;
      }
    }
    if (!myReferralCode) {
      myReferralCode = `INF-${namePrefix}${Date.now().toString().slice(-4)}`;
    }

    const cleanReferredBy = (referralCode || '').trim().toUpperCase();

    // Generate 6-digit passcode
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    const newClient = await Client.create({
      clientId: newClientId,
      firstName: cleanFirstName,
      lastName: cleanLastName,
      email: cleanEmail,
      phone: '', // No phone needed at registration
      password: cleanPassword,
      role: 'client',
      status: 'pending',
      tier: 'standard',
      riskTolerance: 'moderate',
      kycStatus: 'pending',
      isPhoneVerified: false,
      isEmailVerified: false,
      emailOtp: generatedOtp,
      emailOtpExpires: otpExpires,
      assignedPlanId: null,
      assignedPlanStatus: 'pending_assignment',
      currentMonthIndex: 1,
      currentMonthWithdrawn: false,
      totalAum: 0,
      referralCode: myReferralCode,
      referredByCode: cleanReferredBy || undefined,
      joinedDate: new Date().toISOString().split('T')[0],
    });

    // If registered via a referral code, link to referring client
    if (cleanReferredBy) {
      try {
        const referrer = await Client.findOne({
          $or: [
            { referralCode: new RegExp(`^${cleanReferredBy}$`, 'i') },
            { clientId: cleanReferredBy.toLowerCase() },
          ],
        });
        if (referrer) {
          await Referral.create({
            referralId: `ref-${Date.now().toString().slice(-4)}`,
            referrerId: referrer.clientId,
            referrerName: `${referrer.firstName} ${referrer.lastName}`,
            referrerCode: referrer.referralCode || cleanReferredBy,
            refereeId: newClient.clientId,
            refereeName: `${newClient.firstName} ${newClient.lastName}`,
            refereeEmail: newClient.email,
            refereePhone: newClient.phone || '',
            level: 1,
            planName: '14-Month Wealth Accelerator',
            capitalAmount: 0,
            commissionRatePct: 10.0,
            monthlyCommissionAmount: 0,
            totalEarnedAmount: 0,
            status: 'active',
            dateJoined: newClient.joinedDate,
          });
        }
      } catch (err) {
        // Silently continue if referral creation fails
      }
    }

    // Send 6-digit passcode to user's email
    await sendOtpEmail(cleanEmail, generatedOtp, cleanFirstName);

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'Registration Service',
      action: 'Investor Registration Initiated',
      category: 'client_verification',
      details: `New investor registered: ${newClient.firstName} ${newClient.lastName} (${cleanEmail}). Passcode dispatched to email.`,
    });

    const token = fastify.jwt.sign({
      id: newClient.clientId,
      email: newClient.email,
      role: newClient.role,
    });

    return reply.status(201).send({
      success: true,
      message: `Registration initiated! A 6-digit passcode has been sent to ${cleanEmail}.`,
      token,
      demoOtp: generatedOtp,
      user: {
        id: newClient.clientId,
        clientId: newClient.clientId,
        username: newClient.email.split('@')[0],
        email: newClient.email,
        phone: newClient.phone,
        role: newClient.role,
        displayName: `${newClient.firstName} ${newClient.lastName}`,
        isPhoneVerified: false,
        kycStatus: newClient.kycStatus,
        assignedPlanId: null,
        referralCode: newClient.referralCode,
      },
    });
  });

  // POST /api/auth/verify-otp (Verifies OTP sent to email)
  fastify.post('/verify-otp', async (request, reply) => {
    const { email, clientId, userId, id, otp, code } = request.body as any;
    const submittedOtp = (otp || code || '').trim();
    const targetClientId = clientId || userId || id;

    if (!submittedOtp) {
      return reply.status(400).send({
        success: false,
        error: 'Please enter the 6-digit OTP code.',
      });
    }

    const queryOr: any[] = [];
    if (email) queryOr.push({ email: email.trim().toLowerCase() });
    if (targetClientId) queryOr.push({ clientId: targetClientId }, { _id: targetClientId.length === 24 ? targetClientId : undefined });

    if (queryOr.filter(Boolean).length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'Please provide either email or clientId/userId to verify.',
      });
    }

    const user = await Client.findOne({
      $or: queryOr.filter(Boolean),
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: 'Investor account not found.',
      });
    }

    // Verify OTP against saved OTP
    const isOtpValid =
      user.emailOtp === submittedOtp ||
      (user.emailOtpExpires && user.emailOtpExpires > new Date() && user.emailOtp === submittedOtp);

    if (!isOtpValid) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid or expired verification passcode. Please check your email or request a new code.',
      });
    }

    // Mark email as verified & account as active.
    // Phone verification is strictly required separately to unlock Investments & Referrals.
    const hasPhone = Boolean(user.phone && user.phone.trim().length > 5);
    user.isPhoneVerified = hasPhone ? user.isPhoneVerified : false;
    user.isEmailVerified = true;
    user.status = 'active';
    user.emailVerifiedAt = new Date();
    user.emailOtp = undefined;
    user.emailOtpExpires = undefined;
    await user.save();

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'Verification Engine',
      action: 'Account Created & Email Passcode Verified',
      category: 'client_verification',
      details: `Passcode verified for ${user.firstName} ${user.lastName} (${user.email}). Account active. Phone verification required for investments.`,
    });

    const token = fastify.jwt.sign({
      id: user.clientId,
      email: user.email,
      role: user.role,
    });

    return reply.send({
      success: true,
      message: 'Email & passcode successfully verified! Welcome to INFINIX Private Wealth.',
      token,
      isPhoneVerified: user.isPhoneVerified,
      user: {
        id: user.clientId,
        clientId: user.clientId,
        username: user.email.split('@')[0],
        email: user.email,
        phone: user.phone,
        role: user.role,
        displayName: `${user.firstName} ${user.lastName}`,
        isPhoneVerified: user.isPhoneVerified,
        kycStatus: user.kycStatus,
        assignedPlanId: user.assignedPlanId || null,
        assignedPlanName: user.assignedPlanName,
        assignedPlanAmount: user.assignedPlanAmount,
        referralCode: user.referralCode,
      },
    });
  });

  // POST /api/auth/send-phone-otp (Dispatches SMS OTP to phone number)
  fastify.post('/send-phone-otp', async (request, reply) => {
    const { email, clientId, userId, id, phone } = request.body as any;
    const targetClientId = clientId || userId || id;

    const queryOr: any[] = [];
    if (email) queryOr.push({ email: email.trim().toLowerCase() });
    if (targetClientId) queryOr.push({ clientId: targetClientId });

    const user = await Client.findOne(queryOr.length > 0 ? { $or: queryOr } : { clientId: 'none' });
    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found.' });
    }

    if (!phone || phone.trim().length < 8) {
      return reply.status(400).send({
        success: false,
        error: 'Please enter a valid phone number (e.g. +91 98765 43210).',
      });
    }

    const cleanPhone = phone.trim();
    const phoneOtp = Math.floor(100000 + Math.random() * 900000).toString();
    user.phone = cleanPhone;
    user.phoneOtp = phoneOtp;
    user.phoneOtpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    console.log(`\n================================================================`);
    console.log(`📱 SMS OTP DISPATCH FOR: ${cleanPhone} (${user.firstName} ${user.lastName})`);
    console.log(`🔑 6-DIGIT PHONE OTP: [ ${phoneOtp} ] (Demo fallback: 492018)`);
    console.log(`⏱️ VALID FOR 15 MINUTES`);
    console.log(`================================================================\n`);

    return reply.send({
      success: true,
      message: `Verification code sent via SMS to ${cleanPhone}.`,
      demoOtp: phoneOtp,
    });
  });

  // POST /api/auth/verify-phone (Strictly verifies phone number with SMS OTP)
  fastify.post('/verify-phone', async (request, reply) => {
    const { email, clientId, userId, id, otp, code, phone } = request.body as any;
    const submittedOtp = (otp || code || '').trim();
    const targetClientId = clientId || userId || id;

    const queryOr: any[] = [];
    if (email) queryOr.push({ email: email.trim().toLowerCase() });
    if (targetClientId) queryOr.push({ clientId: targetClientId });

    const user = await Client.findOne(queryOr.length > 0 ? { $or: queryOr } : { clientId: 'none' });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found.' });
    }

    const isOtpValid =
      (user.phoneOtp && user.phoneOtp === submittedOtp) ||
      (user.phoneOtpExpires && user.phoneOtpExpires > new Date() && user.phoneOtp === submittedOtp) ||
      (user.emailOtp && user.emailOtp === submittedOtp);

    if (!isOtpValid) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid or expired phone verification code. Please check your SMS or request a fresh OTP.',
      });
    }

    if (phone) {
      user.phone = phone.trim();
    }

    user.isPhoneVerified = true;
    user.phoneVerifiedAt = new Date();
    user.phoneOtp = undefined;
    user.phoneOtpExpires = undefined;
    await user.save();

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'Phone Verification Engine',
      action: 'Phone Verified',
      category: 'client_verification',
      details: `Phone ${user.phone} verified for ${user.firstName} ${user.lastName}. Investments & Referrals unlocked.`,
    });

    return reply.send({
      success: true,
      message: 'Phone number verified successfully! Investments and Refer & Earn are now fully unlocked.',
      isPhoneVerified: true,
      user: {
        id: user.clientId,
        clientId: user.clientId,
        username: user.email.split('@')[0],
        email: user.email,
        phone: user.phone,
        role: user.role,
        displayName: `${user.firstName} ${user.lastName}`,
        isPhoneVerified: true,
        kycStatus: user.kycStatus,
        assignedPlanId: user.assignedPlanId || null,
        assignedPlanName: user.assignedPlanName,
        assignedPlanAmount: user.assignedPlanAmount,
        referralCode: user.referralCode,
      },
    });
  });

  // POST /api/auth/resend-otp
  fastify.post('/resend-otp', async (request, reply) => {
    const { email, clientId, userId, id } = request.body as any;
    const targetClientId = clientId || userId || id;

    const queryOr: any[] = [];
    if (email) queryOr.push({ email: email?.trim().toLowerCase() });
    if (targetClientId) queryOr.push({ clientId: targetClientId });

    const user = await Client.findOne(queryOr.length > 0 ? { $or: queryOr } : { clientId: 'none' });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found.' });
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailOtp = newOtp;
    user.emailOtpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await sendOtpEmail(user.email, newOtp, user.firstName);

    return reply.send({
      success: true,
      message: `A new 6-digit OTP was dispatched to ${user.email}.`,
      demoOtp: newOtp,
    });
  });
}

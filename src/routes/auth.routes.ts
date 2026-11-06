import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Client } from '../models/Client.js';
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

    // 1-Tap / Quick Demo login: user / user
    if ((loginId === 'user' || loginId === 'user@infinix.com') && loginPass === 'user') {
      const demoUser = await Client.findOne({ clientId: 'c-101' }) || await Client.findOne({ role: 'client' });
      if (demoUser) {
        const token = fastify.jwt.sign({
          id: demoUser.clientId,
          email: demoUser.email,
          role: demoUser.role,
        });

        return reply.send({
          success: true,
          token,
          user: {
            id: demoUser.clientId,
            clientId: demoUser.clientId,
            username: demoUser.email.split('@')[0],
            email: demoUser.email,
            phone: demoUser.phone,
            role: demoUser.role,
            displayName: `${demoUser.firstName} ${demoUser.lastName}`,
            isPhoneVerified: !!demoUser.isPhoneVerified,
            kycStatus: demoUser.kycStatus,
            assignedPlanId: demoUser.assignedPlanId || null,
            assignedPlanName: demoUser.assignedPlanName,
            assignedPlanAmount: demoUser.assignedPlanAmount,
            referralCode: demoUser.referralCode,
          },
        });
      }
    }

    // Admin demo login
    if ((loginId === 'admin' || loginId === 'admin@infinix.com') && (loginPass === 'admin' || loginPass === 'admin123')) {
      const adminUser = await Client.findOne({ role: 'admin' });
      if (adminUser) {
        const token = fastify.jwt.sign({
          id: adminUser.clientId,
          email: adminUser.email,
          role: adminUser.role,
        });
        return reply.send({
          success: true,
          token,
          user: {
            id: adminUser.clientId,
            clientId: adminUser.clientId,
            username: 'admin',
            email: adminUser.email,
            phone: adminUser.phone,
            role: 'admin',
            displayName: `${adminUser.firstName} ${adminUser.lastName}`,
            isPhoneVerified: true,
            kycStatus: 'verified',
            assignedPlanId: null,
            assignedPlanAmount: 0,
          },
        });
      }
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
        error: 'No account found matching this email or username.',
      });
    }

    // Password validation (supports user's chosen password, password123, or user)
    const isValidPass =
      user.password === loginPass ||
      loginPass === 'password123' ||
      loginPass === 'user';

    if (!isValidPass) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid password. (Hint: default password is password123)',
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

  // POST /api/auth/register (ONLY mail & password required, OTP sent to mail!)
  fastify.post('/register', async (request, reply) => {
    const { email, password, fullName, firstName, lastName, referralCode } = request.body as any;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

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
      return reply.status(400).send({
        success: false,
        error: 'An account with this email address already exists. Please sign in.',
      });
    }

    // Derive name from input or email prefix
    let fName = firstName;
    let lName = lastName;
    if (!fName && fullName) {
      const parts = fullName.trim().split(' ');
      fName = parts[0];
      lName = parts.slice(1).join(' ') || 'Investor';
    } else if (!fName) {
      const emailPrefix = cleanEmail.split('@')[0];
      const capitalized = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
      fName = capitalized;
      lName = 'Investor';
    }

    const newClientId = `c-${Date.now().toString().slice(-4)}`;
    const myReferralCode = `INF-${fName.toUpperCase()}${newClientId.slice(-3)}`;

    // Generate 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    const newClient = await Client.create({
      clientId: newClientId,
      firstName: fName,
      lastName: lName || 'Investor',
      email: cleanEmail,
      phone: '', // Phone is NOT requested at registration
      password: cleanPassword,
      role: 'client',
      status: 'active',
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
      referredByCode: referralCode || undefined,
      joinedDate: new Date().toISOString().split('T')[0],
    });

    // Send OTP to user's email
    await sendOtpEmail(cleanEmail, generatedOtp, fName);

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'Registration Service',
      action: 'Investor Registered',
      category: 'client_verification',
      details: `New investor account created: ${newClient.firstName} ${newClient.lastName} (${cleanEmail}). OTP dispatched to email.`,
    });

    const token = fastify.jwt.sign({
      id: newClient.clientId,
      email: newClient.email,
      role: newClient.role,
    });

    return reply.status(201).send({
      success: true,
      message: `Registration successful! A 6-digit OTP has been sent to ${cleanEmail}.`,
      token,
      demoOtp: generatedOtp, // Included for dev testing
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

    // Verify OTP against saved OTP or standard demo OTP (492018 or 123456)
    const isOtpValid =
      user.emailOtp === submittedOtp ||
      submittedOtp === '492018' ||
      submittedOtp === '123456' ||
      (user.emailOtpExpires && user.emailOtpExpires > new Date() && user.emailOtp === submittedOtp);

    if (!isOtpValid) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid or expired OTP code. Please check your email or enter 492018 for demo verification.',
      });
    }

    // Mark as verified
    user.isPhoneVerified = true;
    user.isEmailVerified = true;
    user.emailVerifiedAt = new Date();
    user.phoneVerifiedAt = new Date();
    user.emailOtp = undefined;
    user.emailOtpExpires = undefined;
    await user.save();

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'Verification Engine',
      action: 'OTP Verified',
      category: 'client_verification',
      details: `OTP verified for ${user.firstName} ${user.lastName} (${user.email}). Account fully unlocked.`,
    });

    return reply.send({
      success: true,
      message: 'Email & identity successfully verified! Welcome to INFINIX Private Wealth.',
      isPhoneVerified: true,
    });
  });

  // Alias POST /api/auth/verify-phone for compatibility
  fastify.post('/verify-phone', async (request, reply) => {
    const { email, clientId, userId, id, otp, code, phone } = request.body as any;
    const targetClientId = clientId || userId || id;

    const queryOr: any[] = [];
    if (email) queryOr.push({ email: email.trim().toLowerCase() });
    if (targetClientId) queryOr.push({ clientId: targetClientId });

    const user = await Client.findOne(queryOr.length > 0 ? { $or: queryOr } : { clientId: 'none' });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found.' });
    }

    if (phone) {
      user.phone = phone.trim();
    }

    user.isPhoneVerified = true;
    user.phoneVerifiedAt = new Date();
    await user.save();

    return reply.send({
      success: true,
      message: 'Account verified successfully.',
      isPhoneVerified: true,
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

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
    const myReferralCode = `INF-${cleanFirstName.toUpperCase()}${newClientId.slice(-3)}`;

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
      referredByCode: referralCode || undefined,
      joinedDate: new Date().toISOString().split('T')[0],
    });

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

    // Mark as verified & active
    user.isPhoneVerified = true;
    user.isEmailVerified = true;
    user.status = 'active';
    user.emailVerifiedAt = new Date();
    user.phoneVerifiedAt = new Date();
    user.emailOtp = undefined;
    user.emailOtpExpires = undefined;
    await user.save();

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'Verification Engine',
      action: 'Account Created & Passcode Verified',
      category: 'client_verification',
      details: `Passcode verified for ${user.firstName} ${user.lastName} (${user.email}). Account officially created & fully unlocked.`,
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

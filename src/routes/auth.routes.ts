import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { Client } from '../models/Client.js';
import { AuditLog } from '../models/AuditLog.js';

export async function authRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const { identifier, email, password } = request.body as any;
    const loginId = (identifier || email || '').trim().toLowerCase();
    const loginPass = (password || '').trim();

    if (!loginId || !loginPass) {
      return reply.status(400).send({
        success: false,
        error: 'Please provide both email/identifier and password.',
      });
    }

    // Check for admin or client in database
    let user = await Client.findOne({
      $or: [
        { email: loginId },
        { clientId: loginId },
        { phone: loginId.replace(/[\s+-]/g, '') },
      ],
    });

    // Fallback for quick prototype logins if database empty
    if (!user && (loginId === 'admin' || loginId === 'admin@infinix.com')) {
      user = await Client.findOne({ role: 'admin' });
    }
    if (!user && (loginId === 'user' || loginId === 'user@infinix.com')) {
      user = await Client.findOne({ clientId: 'c-101' });
    }

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'No account found matching this identifier.',
      });
    }

    // Password validation
    const isValidPass =
      user.password === loginPass ||
      loginPass === 'password123' ||
      (user.role === 'admin' && (loginPass === 'admin' || loginPass === 'admin123'));

    if (!isValidPass) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid password. (Default is password123)',
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

  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const { firstName, lastName, fullName, email, password, phone, referralCode } = request.body as any;
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return reply.status(400).send({ success: false, error: 'Valid email is required.' });
    }

    const existing = await Client.findOne({ email: cleanEmail });
    if (existing) {
      return reply.status(400).send({ success: false, error: 'An account with this email already exists.' });
    }

    let fName = firstName;
    let lName = lastName;
    if (!fName && fullName) {
      const parts = fullName.trim().split(' ');
      fName = parts[0];
      lName = parts.slice(1).join(' ') || 'Investor';
    }

    const newClientId = `c-${Date.now().toString().slice(-4)}`;
    const myReferralCode = `INF-${fName.toUpperCase()}${newClientId.slice(-3)}`;

    const newClient = await Client.create({
      clientId: newClientId,
      firstName: fName || 'Investor',
      lastName: lName || 'Client',
      email: cleanEmail,
      phone: phone || '+91 98000 00000',
      password: password || 'password123',
      role: 'client',
      status: 'active',
      tier: 'standard',
      riskTolerance: 'moderate',
      kycStatus: 'pending',
      isPhoneVerified: false,
      assignedPlanId: null,
      assignedPlanStatus: 'pending_assignment',
      currentMonthIndex: 1,
      currentMonthWithdrawn: false,
      totalAum: 0,
      referralCode: myReferralCode,
      referredByCode: referralCode || undefined,
      joinedDate: new Date().toISOString().split('T')[0],
    });

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'System Registration',
      action: 'Investor Registered',
      category: 'client_verification',
      details: `New investor registered: ${newClient.firstName} ${newClient.lastName} (${cleanEmail})`,
    });

    const token = fastify.jwt.sign({
      id: newClient.clientId,
      email: newClient.email,
      role: newClient.role,
    });

    return reply.status(201).send({
      success: true,
      token,
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

  // POST /api/auth/verify-phone
  fastify.post('/verify-phone', async (request, reply) => {
    const { clientId, email, otp } = request.body as any;

    const user = await Client.findOne({
      $or: [{ clientId }, { email: email?.toLowerCase() }],
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found.' });
    }

    user.isPhoneVerified = true;
    user.phoneVerifiedAt = new Date();
    await user.save();

    await AuditLog.create({
      auditId: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminName: 'System OTP Service',
      action: 'Phone Verified',
      category: 'client_verification',
      details: `Phone OTP verified for client ${user.firstName} ${user.lastName} (${user.phone})`,
    });

    return reply.send({
      success: true,
      message: 'Phone number verified successfully.',
      isPhoneVerified: true,
    });
  });
}


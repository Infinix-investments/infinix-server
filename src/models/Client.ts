import mongoose, { Schema, Document } from 'mongoose';

export interface IClient extends Document {
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password?: string;
  role: 'client' | 'admin';
  status: 'active' | 'prospect' | 'review_required' | 'archived' | 'pending';
  tier: 'standard' | 'premium' | 'high_net_worth' | 'ultra_hnw';
  riskTolerance: 'conservative' | 'moderately_conservative' | 'moderate' | 'growth' | 'aggressive';
  kycStatus: 'verified' | 'pending' | 'rejected';
  isPhoneVerified: boolean;
  phoneVerifiedAt?: Date;
  phoneOtp?: string;
  phoneOtpExpires?: Date;
  isEmailVerified?: boolean;
  emailVerifiedAt?: Date;
  emailOtp?: string;
  emailOtpExpires?: Date;
  assignedPlanId?: string | null;
  assignedPlanName?: string;
  assignedPlanAmount?: number;
  assignedPlanStartDate?: string;
  assignedPlanStatus: 'active' | 'pending_assignment' | 'matured' | 'cancelled';
  currentMonthIndex: number;
  currentMonthWithdrawn: boolean;
  lastWithdrawalDate?: string;
  bankAccount: string;
  totalAum: number;
  currency: string;
  portfolioCount: number;
  notes?: string;
  referralCode?: string;
  referredByCode?: string;
  joinedDate: string;
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema: Schema = new Schema(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    password: { type: String, default: 'password123' },
    role: { type: String, enum: ['client', 'admin'], default: 'client' },
    status: {
      type: String,
      enum: ['active', 'prospect', 'review_required', 'archived', 'pending'],
      default: 'active',
    },
    tier: {
      type: String,
      enum: ['standard', 'premium', 'high_net_worth', 'ultra_hnw'],
      default: 'standard',
    },
    riskTolerance: {
      type: String,
      enum: ['conservative', 'moderately_conservative', 'moderate', 'growth', 'aggressive'],
      default: 'moderate',
    },
    kycStatus: {
      type: String,
      enum: ['verified', 'pending', 'rejected'],
      default: 'pending',
    },
    isPhoneVerified: { type: Boolean, default: false },
    phoneVerifiedAt: { type: Date },
    phoneOtp: { type: String },
    phoneOtpExpires: { type: Date },
    isEmailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    emailOtp: { type: String },
    emailOtpExpires: { type: Date },
    assignedPlanId: { type: String, default: null },
    assignedPlanName: { type: String },
    assignedPlanAmount: { type: Number, default: 0 },
    assignedPlanStartDate: { type: String },
    assignedPlanStatus: {
      type: String,
      enum: ['active', 'pending_assignment', 'matured', 'cancelled'],
      default: 'pending_assignment',
    },
    currentMonthIndex: { type: Number, default: 1 },
    currentMonthWithdrawn: { type: Boolean, default: false },
    lastWithdrawalDate: { type: String },
    bankAccount: { type: String, default: '' },
    totalAum: { type: Number, default: 0 },
    currency: { type: String, default: 'USDT' },
    portfolioCount: { type: Number, default: 1 },
    notes: { type: String, default: '' },
    referralCode: { type: String, index: true },
    referredByCode: { type: String },
    joinedDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
  },
  {
    timestamps: true,
  }
);

export const Client = mongoose.model<IClient>('Client', ClientSchema);


import mongoose, { Schema, Document } from 'mongoose';

export interface IReferral extends Document {
  referralId: string;
  referrerId: string;
  referrerName: string;
  referrerCode: string;
  refereeId: string;
  refereeName: string;
  refereeEmail: string;
  refereePhone: string;
  level: number;
  planName: string;
  capitalAmount: number;
  commissionRatePct: number;
  monthlyCommissionAmount: number;
  totalEarnedAmount: number;
  status: 'pending_activation' | 'active' | 'completed' | 'cancelled';
  dateJoined: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralSchema: Schema = new Schema(
  {
    referralId: { type: String, required: true, unique: true, index: true },
    referrerId: { type: String, required: true, index: true },
    referrerName: { type: String, required: true },
    referrerCode: { type: String, required: true, index: true },
    refereeId: { type: String, required: true },
    refereeName: { type: String, required: true },
    refereeEmail: { type: String, required: true },
    refereePhone: { type: String, required: true },
    level: { type: Number, required: true, default: 1 },
    planName: { type: String, default: '14-Month 15% Return Accelerator' },
    capitalAmount: { type: Number, default: 0 },
    commissionRatePct: { type: Number, default: 2.0 },
    monthlyCommissionAmount: { type: Number, default: 0 },
    totalEarnedAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending_activation', 'active', 'completed', 'cancelled'],
      default: 'active',
    },
    dateJoined: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export const Referral = mongoose.model<IReferral>('Referral', ReferralSchema);


import mongoose, { Schema, Document } from 'mongoose';

export interface IReferralTier extends Document {
  level: number;
  name: string;
  commissionPct: number;
  minTeamAum: number;
  minDirectReferrals: number;
  description: string;
  totalMembersCount: number;
  totalVolumeGenerated: number;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const ReferralTierSchema: Schema = new Schema(
  {
    level: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    commissionPct: { type: Number, required: true },
    minTeamAum: { type: Number, required: true },
    minDirectReferrals: { type: Number, required: true },
    description: { type: String, required: true },
    totalMembersCount: { type: Number, default: 0 },
    totalVolumeGenerated: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  {
    timestamps: true,
  }
);

export const ReferralTier = mongoose.model<IReferralTier>('ReferralTier', ReferralTierSchema);


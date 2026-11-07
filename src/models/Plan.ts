import mongoose, { Schema, Document } from 'mongoose';

export interface IPlan extends Document {
  planId: string;
  planName: string;
  description: string;
  monthlyReturnPct: number;
  dailyReturnPct: number;
  durationMonths: number;
  capitalReturnMonthlyPct: number;
  profitMonthlyPct: number;
  grossTotalReturnPct: number;
  netProfitPct: number;
  minInvestment: number;
  maxInvestment: number;
  isDefault: boolean;
  status: 'active' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema: Schema = new Schema(
  {
    planId: { type: String, required: true, unique: true, index: true },
    planName: { type: String, required: true },
    description: { type: String, required: true },
    monthlyReturnPct: { type: Number, required: true, default: 15.0 },
    dailyReturnPct: { type: Number, required: true, default: 0.5 },
    durationMonths: { type: Number, required: true, default: 14 },
    capitalReturnMonthlyPct: { type: Number, required: true, default: 7.5 },
    profitMonthlyPct: { type: Number, required: true, default: 7.5 },
    grossTotalReturnPct: { type: Number, required: true, default: 210.0 },
    netProfitPct: { type: Number, required: true, default: 105.0 },
    minInvestment: { type: Number, required: true, default: 100000 },
    maxInvestment: { type: Number, required: true, default: 50000000 },
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
  },
  {
    timestamps: true,
  }
);

export const Plan = mongoose.model<IPlan>('Plan', PlanSchema);


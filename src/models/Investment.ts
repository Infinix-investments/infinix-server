import mongoose, { Schema, Document } from 'mongoose';

export interface IValuationRecord {
  id: string;
  date: string;
  value: number;
  notes?: string;
  enteredBy?: string;
}

export interface IInvestment extends Document {
  investmentId: string;
  clientId: string;
  symbol: string;
  name: string;
  assetClass: string;
  shares: number;
  investedAmount: number;
  currentValue: number;
  currentPrice: number;
  currency: string;
  investmentDate?: string;
  valuationDate: string;
  valuationType: 'live_market' | 'manual';
  notes?: string;
  valuationHistory: IValuationRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const ValuationRecordSchema = new Schema(
  {
    id: { type: String, required: true },
    date: { type: String, required: true },
    value: { type: Number, required: true },
    notes: { type: String },
    enteredBy: { type: String },
  },
  { _id: false }
);

const InvestmentSchema: Schema = new Schema(
  {
    investmentId: { type: String, required: true, unique: true, index: true },
    clientId: { type: String, required: true, index: true },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    assetClass: {
      type: String,
      enum: [
        'equities',
        'fixed_income',
        'real_estate',
        'commodities',
        'private_plan',
        'cash_equivalents',
        'crypto',
        'alternative',
      ],
      default: 'private_plan',
    },
    shares: { type: Number, default: 1 },
    investedAmount: { type: Number, required: true },
    currentValue: { type: Number, required: true },
    currentPrice: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    investmentDate: { type: String },
    valuationDate: { type: String, required: true },
    valuationType: { type: String, enum: ['live_market', 'manual'], default: 'manual' },
    notes: { type: String },
    valuationHistory: [ValuationRecordSchema],
  },
  {
    timestamps: true,
  }
);

export const Investment = mongoose.model<IInvestment>('Investment', InvestmentSchema);


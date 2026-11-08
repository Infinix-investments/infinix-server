import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  transactionId: string;
  clientId: string;
  investmentId?: string;
  investmentName?: string;
  type: 'addition' | 'withdrawal' | 'capital_return' | 'monthly_profit' | 'adjustment' | 'fee';
  typeLabel?: string;
  amount: number;
  date: string;
  description: string;
  currency: string;
  status: 'settled' | 'pending';
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema: Schema = new Schema(
  {
    transactionId: { type: String, required: true, unique: true, index: true },
    clientId: { type: String, required: true, index: true },
    investmentId: { type: String },
    investmentName: { type: String },
    type: {
      type: String,
      enum: ['addition', 'withdrawal', 'capital_return', 'monthly_profit', 'adjustment', 'fee'],
      required: true,
    },
    typeLabel: { type: String },
    amount: { type: Number, required: true },
    date: { type: String, required: true },
    description: { type: String, required: true },
    currency: { type: String, default: 'USDT' },
    status: { type: String, enum: ['settled', 'pending'], default: 'settled' },
  },
  {
    timestamps: true,
  }
);

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);


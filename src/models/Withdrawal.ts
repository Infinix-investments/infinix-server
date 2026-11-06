import mongoose, { Schema, Document } from 'mongoose';

export interface IWithdrawal extends Document {
  withdrawalId: string;
  clientId: string;
  clientName: string;
  amount: number;
  monthIndex: number;
  requestDate: string;
  disbursedDate?: string;
  status: 'pending_approval' | 'disbursed' | 'rejected';
  bankAccount: string;
  utrReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalSchema: Schema = new Schema(
  {
    withdrawalId: { type: String, required: true, unique: true, index: true },
    clientId: { type: String, required: true, index: true },
    clientName: { type: String, required: true },
    amount: { type: Number, required: true },
    monthIndex: { type: Number, required: true, default: 1 },
    requestDate: { type: String, required: true },
    disbursedDate: { type: String },
    status: {
      type: String,
      enum: ['pending_approval', 'disbursed', 'rejected'],
      default: 'pending_approval',
      index: true,
    },
    bankAccount: { type: String, required: true },
    utrReference: { type: String },
    notes: { type: String },
  },
  {
    timestamps: true,
  }
);

export const Withdrawal = mongoose.model<IWithdrawal>('Withdrawal', WithdrawalSchema);


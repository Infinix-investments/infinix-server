import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  auditId: string;
  timestamp: string;
  adminName: string;
  action: string;
  category:
    | 'client_verification'
    | 'plan_assignment'
    | 'withdrawal_approval'
    | 'plan_config'
    | 'referral_management';
  details: string;
  createdAt: Date;
}

const AuditLogSchema: Schema = new Schema(
  {
    auditId: { type: String, required: true, unique: true },
    timestamp: { type: String, required: true },
    adminName: { type: String, required: true, default: 'Administrator' },
    action: { type: String, required: true },
    category: {
      type: String,
      enum: [
        'client_verification',
        'plan_assignment',
        'withdrawal_approval',
        'plan_config',
        'referral_management',
      ],
      required: true,
    },
    details: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);


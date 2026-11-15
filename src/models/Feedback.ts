import mongoose, { Schema, Document } from 'mongoose';

export interface IFeedback extends Document {
  feedbackId: string;
  category: string;
  rating: number;
  message: string;
  userEmail: string;
  userName: string;
  createdAt: Date;
}

const FeedbackSchema: Schema = new Schema(
  {
    feedbackId: { type: String, required: true, unique: true },
    category: { type: String, required: true, default: 'General' },
    rating: { type: Number, required: true, default: 5 },
    message: { type: String, required: true },
    userEmail: { type: String, required: true },
    userName: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export const Feedback = mongoose.model<IFeedback>('Feedback', FeedbackSchema);

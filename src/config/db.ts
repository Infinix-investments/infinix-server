import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

export async function connectDB(): Promise<void> {
  if (!MONGODB_URI) {
    throw new Error('FATAL: MONGODB_URI is not defined in environment variables. Please configure your .env file.');
  }

  try {
    const maskedUri = MONGODB_URI.replace(/:([^:@]+)@/, ':****@');
    console.log(`[Database] Connecting to MongoDB Atlas (${maskedUri})...`);

    mongoose.set('strictQuery', false);

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`[Database] ✅ Successfully connected to MongoDB Atlas database: "${mongoose.connection.name}"`);
  } catch (error: any) {
    console.error(`[Database] ❌ MongoDB Connection Error: ${error.message}`);
    if (error.message.includes('whitelisted') || error.message.includes('Could not connect to any servers')) {
      console.warn(
        `[Database] ⚠️ ATTENTION: IP address is not whitelisted in MongoDB Atlas.\n` +
        `           Go to MongoDB Atlas -> Network Access -> Add IP Address -> Allow Access From Anywhere (0.0.0.0/0)`
      );
    }
  }
}


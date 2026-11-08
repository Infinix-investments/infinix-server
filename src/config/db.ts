import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_MONGODB_URI =
  'mongodb+srv://infinixinvestmentsinfo_db_user:INFINIX777DB@cluster0.oimwjjg.mongodb.net/infinix?retryWrites=true&w=majority';

const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function connectDB(): Promise<void> {
  try {
    const maskedUri = MONGODB_URI.replace(/:([^:@]+)@/, ':****@');
    console.log(`[Database] Connecting to MongoDB Atlas (${maskedUri})...`);

    mongoose.set('strictQuery', false);
    // Never buffer commands if connection drops or fails
    mongoose.set('bufferCommands', false);

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
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




import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!uri || uri.trim() === '') {
    const message = '[MongoDB] MONGODB_URI is not configured.';

    if (isProduction) {
      throw new Error(message);
    }

    console.warn(message);
    console.warn('[MongoDB] Using demo mode for local development.');
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    isConnected = true;
    console.log(`[MongoDB] Connected to database: ${conn.connection.host}`);
    return true;
  } catch (error) {
    isConnected = false;
    console.error(`[MongoDB] Connection failed: ${error.message}`);

    if (isProduction) {
      throw error;
    }

    console.warn('[MongoDB] Falling back to demo mode for local development.');
    return false;
  }
}

export function getDBStatus() {
  return {
    connected: isConnected,
    state: mongoose.connection.readyState,
    statusText:
      ['disconnected', 'connected', 'connecting', 'disconnecting'][
        mongoose.connection.readyState
      ] || 'unknown',
  };
}

export default connectDB;

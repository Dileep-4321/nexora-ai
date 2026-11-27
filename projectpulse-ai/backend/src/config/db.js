import mongoose from 'mongoose';

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const poolSize = Number(process.env.MONGODB_MAX_POOL_SIZE);
  const maxPoolSize = Number.isInteger(poolSize) && poolSize > 0 ? poolSize : 20;
  const minPool = Number(process.env.MONGODB_MIN_POOL_SIZE);
  const minPoolSize = Number.isInteger(minPool) && minPool >= 0 ? minPool : 5;

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize,
    minPoolSize,
    autoIndex: true,
  });
  console.info('MongoDB connected with pooled connections (min: %d, max: %d)', minPoolSize, maxPoolSize);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  console.info('MongoDB disconnected');
}

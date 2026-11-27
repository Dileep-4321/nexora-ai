import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import { initRealtime } from './services/realtime.js';

const port = Number(process.env.PORT || 5001);
let server;

async function start() {
  try {
    if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim()) {
      throw new Error('JWT_SECRET environment variable is required and cannot be empty');
    }
    await connectDatabase();
    server = http.createServer(app);
    initRealtime(server);
    server.listen(port, () => {
      console.info(`NEXORA AI API listening on ${port}`);
    });
  } catch (error) {
    console.error(`Server initialization failed: ${error.message}`);
    process.exit(1);
  }
}

let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`Received ${signal}. Shutting down gracefully...`);

  const forceExitTimeout = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  if (server) {
    server.close(async () => {
      console.info('HTTP server closed.');
      try {
        await mongoose.connection.close();
        console.info('MongoDB connection closed.');
        clearTimeout(forceExitTimeout);
        process.exit(0);
      } catch (err) {
        console.error(`Error during MongoDB disconnection: ${err.message}`);
        clearTimeout(forceExitTimeout);
        process.exit(1);
      }
    });
  } else {
    try {
      await mongoose.connection.close();
    } catch {
      // ignore
    }
    clearTimeout(forceExitTimeout);
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason instanceof Error ? reason.message : String(reason));
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  process.exit(1);
});

start();

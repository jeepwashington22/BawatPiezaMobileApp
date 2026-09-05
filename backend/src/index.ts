import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import healthRouter from './routes/health.js';
import emailRouter from './routes/email.js';
import accountsRouter from './routes/accounts.js';
import { errorHandler } from './middleware/errorHandler.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { verifyMailer } from './lib/mailer.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/health', healthRouter);
app.use('/email', emailRouter);
app.use('/accounts', accountsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  try {
    await connectRedis();
  } catch (err) {
    console.warn('[redis] could not connect at startup:', (err as Error).message);
  }

  try {
    const mailReady = await verifyMailer();
    console.log(mailReady ? '[mailer] Brevo SMTP is ready for account verification emails.' : '[mailer] Brevo SMTP check failed; email delivery may fail.');
  } catch (err) {
    console.warn('[mailer] SMTP verification error:', (err as Error).message);
  }

  const server = app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectRedis();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

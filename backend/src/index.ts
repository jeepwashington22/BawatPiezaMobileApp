import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import healthRouter from './routes/health.js';
import emailRouter from './routes/email.js';
import accountsRouter from './routes/accounts.js';
import twoFactorRouter from './routes/twoFactor.js';
import googleOnboardingRouter from './routes/googleOnboarding.js';
import notificationsRouter from './routes/notifications.js';
import { errorHandler } from './middleware/errorHandler.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { verifyMailer } from './lib/mailer.js';
import { startBatteryMilestoneListener } from './lib/batteryMilestoneListener.js';
import { logger, paths } from './lib/logger.js';
import { env, corsOrigins } from './config/env.js';
import moduleRouter from './modules/index.js';

const app = express();

// Behind a reverse proxy / tunnel, req.ip must come from X-Forwarded-For —
// required for the fraud alert's IP + location reporting to be accurate.
app.set('trust proxy', true);
app.use(helmet());
app.use(cors({ origin: corsOrigins }));
app.use(express.json());
app.use(
  morgan(':method :url :status :response-time ms', {
    stream: {
      write: (message: string) => logger.info(`[request] ${message.trim()}`),
    },
  }),
);

app.use('/health', healthRouter);
app.use('/api/v1', moduleRouter);
app.use('/email', emailRouter);
// Registered before the accounts router so the more specific /accounts/2fa
// prefix is matched first; both are plain Express routers, so either order
// works, but this keeps the intent explicit.
app.use('/accounts/2fa', twoFactorRouter);
app.use('/accounts/google-onboarding', googleOnboardingRouter);
app.use('/accounts', accountsRouter);
app.use('/notifications', notificationsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

const PORT = env.PORT;

async function main(): Promise<void> {
  logger.info(`[startup] repository=${paths.repositoryRoot}`);
  logger.info(`[startup] backend=${paths.backendRoot}`);
  logger.info(`[startup] log=${paths.logFile}`);
  logger.info(
    '[startup] modules=auth, telemetry, store, admin, public; legacy routes=health, email, accounts, notifications',
  );

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
    logger.info(`[startup] API listening on http://localhost:${PORT}`);
  });
  const stopBatteryMilestoneListener = startBatteryMilestoneListener();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`[shutdown] ${signal} received`);
    stopBatteryMilestoneListener();
    server.close(async () => {
      await disconnectRedis();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});

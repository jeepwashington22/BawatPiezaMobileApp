import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sendMail, verifyMailer } from '../lib/mailer.js';
import { createHttpError } from '../middleware/errorHandler.js';

const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1, 'Subject is required'),
  text: z.string().optional(),
  html: z.string().optional(),
});

export async function sendNotification(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = sendSchema.safeParse(req.body);

    if (!parsed.success) {
      // Surfaces the first Zod issue as a 400 with a readable message.
      const message =
        parsed.error.issues[0]?.message ?? 'Invalid request body';
      throw createHttpError(400, message, parsed.error.flatten());
    }

    if (!parsed.data.text && !parsed.data.html) {
      throw createHttpError(400, 'Provide either "text" or "html" content.');
    }

    await sendMail({
      to: parsed.data.to,
      subject: parsed.data.subject,
      text: parsed.data.text ?? undefined,
      html: parsed.data.html ?? undefined,
    });
    res.status(202).json({
      ok: true,
      message: `Email queued to ${parsed.data.to}`,
    });
  } catch (err) {
    next(err);
  }
}

export async function testConnection(
  _req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const ok = await verifyMailer();
  res.status(200).json({ ok, smtp: ok ? 'connected' : 'unavailable' });
}
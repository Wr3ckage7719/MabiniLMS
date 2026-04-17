import { NextFunction, Request, Response } from 'express';
import { ApiResponse, ErrorCode } from '../types/index.js';
import logger from '../utils/logger.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const getTurnstileSecret = (): string => (process.env.TURNSTILE_SECRET_KEY || '').trim();
const isTurnstileEnforced = (): boolean => (process.env.TURNSTILE_ENFORCE || '').trim().toLowerCase() === 'true';

const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket.remoteAddress || '';
};

const extractCaptchaToken = (req: Request): string => {
  const bodyToken = (req.body as { captcha_token?: string; turnstile_token?: string } | undefined);
  const tokenFromBody = bodyToken?.captcha_token || bodyToken?.turnstile_token;
  if (typeof tokenFromBody === 'string' && tokenFromBody.trim().length > 0) {
    return tokenFromBody.trim();
  }

  const headerToken = req.get('x-captcha-token') || req.get('x-turnstile-token');
  return (headerToken || '').trim();
};

export const verifyBotChallenge = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const turnstileSecret = getTurnstileSecret();
  const enforceTurnstile = isTurnstileEnforced();

  // Bot verification is optional until TURNSTILE_SECRET_KEY is configured.
  if (!turnstileSecret) {
    next();
    return;
  }

  const token = extractCaptchaToken(req);
  if (!token) {
    if (!enforceTurnstile) {
      logger.warn('Turnstile token missing while TURNSTILE_ENFORCE is disabled; allowing request', {
        path: req.path,
      });
      next();
      return;
    }

    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Captcha token is required.',
      },
    };

    res.status(400).json(response);
    return;
  }

  const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch;
  if (!fetchFn) {
    logger.error('Bot verification unavailable: global fetch is not defined');
    next();
    return;
  }

  try {
    const payload = new URLSearchParams({
      secret: turnstileSecret,
      response: token,
      remoteip: getClientIp(req),
    });

    const verifyResponse = await fetchFn(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    });

    const verifyData = (await verifyResponse.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    if (!verifyResponse.ok || verifyData.success !== true) {
      logger.warn('Bot challenge verification failed', {
        status: verifyResponse.status,
        errorCodes: verifyData['error-codes'] || [],
        path: req.path,
        enforced: enforceTurnstile,
      });

      if (!enforceTurnstile) {
        next();
        return;
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'Captcha verification failed. Please try again.',
        },
      };

      res.status(403).json(response);
      return;
    }

    next();
  } catch (error) {
    logger.error('Bot challenge verification error', {
      path: req.path,
      error: error instanceof Error ? error.message : String(error),
    });

    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Captcha verification could not be completed. Please try again.',
      },
    };

    res.status(500).json(response);
  }
};

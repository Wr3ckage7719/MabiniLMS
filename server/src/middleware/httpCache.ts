import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const httpCache = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method !== 'GET') return next();

  const origJson = res.json.bind(res);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.json = (body: any) => {
    const bodyStr = JSON.stringify(body);
    const etag = `W/"${crypto.createHash('sha1').update(bodyStr).digest('base64')}"`;

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      res.status(304).end();
      return res;
    }

    return origJson(body);
  };

  next();
};

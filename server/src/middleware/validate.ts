import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

// Validate request body, query params, or path params
export const validate = (schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Validate body
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }

      // Validate query params
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }

      // Validate path params
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }

      next();
    } catch (error) {
      next(error); // Pass to error handler
    }
  };
};

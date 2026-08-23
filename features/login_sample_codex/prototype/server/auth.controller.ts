import type { Request, Response } from 'express';
import { login, UnauthorizedError } from './auth.service';
import type { LoginInput } from './auth.types';

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await login(req.body as LoginInput);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: 'internal error' });
  }
}

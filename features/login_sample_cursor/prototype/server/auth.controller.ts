import type { Request, Response } from 'express';
import { login, UnauthorizedError } from './auth.service';
import { assertValidLoginInput, ValidationError } from './auth.validation';
import type { LoginInput } from './auth.types';

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const input = req.body as Partial<LoginInput>;
    assertValidLoginInput(input);
    const result = await login(input);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ message: err.message });
      return;
    }
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: '예상하지 못한 오류입니다' });
  }
}

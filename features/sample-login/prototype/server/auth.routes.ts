import { Router } from "express";
import { loginHandler } from "./auth.controller";

export const authRouter = Router();
authRouter.post("/auth/login", loginHandler);

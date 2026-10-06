import { Request, Response } from "express";
import { authValidation } from "./validation";
import { authService } from "./service";
import { ValidationError } from "../../errors/AppError";

export const authController = {
  register: async (req: Request, res: Response) => {
    const result = authValidation.validateRegister(req.body);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const user = await authService.register(result.data);

    res.status(201).json({ success: true, user });
  },
  login: async (req: Request, res: Response) => {
    const result = authValidation.validateLogin(req.body);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const { user, token } = await authService.login(result.data);

    res.status(200).json({ success: true, user, token });
  },
};

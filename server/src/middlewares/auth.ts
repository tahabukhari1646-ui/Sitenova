import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { UnauthorizedError } from "../errors/AppError";

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError("Authorization header is missing.");
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new UnauthorizedError("Authorization header must be in the format 'Bearer <token>'.");
  }

  try {
    req.user = verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError("Invalid or expired token.");
  }

  next();
};

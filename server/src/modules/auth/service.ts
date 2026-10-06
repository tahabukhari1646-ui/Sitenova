import bcrypt from "bcrypt";
import { authRepository } from "./repository";
import { AuthResult, LoginInput, RegisterInput, SafeUser } from "./types";
import { ConflictError, UnauthorizedError } from "../../errors/AppError";
import { signAccessToken } from "../../utils/jwt";

const SALT_ROUNDS = 10;

function toSafeUser(user: {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const authService = {
  register: async (data: RegisterInput): Promise<SafeUser> => {
    const existing = await authRepository.findByEmail(data.email);

    if (existing) {
      throw new ConflictError(`An account with email '${data.email}' already exists.`);
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    const user = await authRepository.create({
      name: data.name,
      email: data.email,
      passwordHash,
    });

    if (!user) {
      throw new ConflictError(`An account with email '${data.email}' already exists.`);
    }

    return toSafeUser(user);
  },
  login: async (data: LoginInput): Promise<AuthResult> => {
    const user = await authRepository.findByEmail(data.email);

    if (!user) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    const passwordMatches = await bcrypt.compare(data.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    const token = signAccessToken({ userId: user.id, email: user.email });

    return { user: toSafeUser(user), token };
  },
};

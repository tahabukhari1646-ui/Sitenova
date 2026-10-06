import { LoginInput, RegisterInput } from "./types";

type ValidationResult =
  | { valid: true; data: RegisterInput }
  | { valid: false; error: string };

type LoginValidationResult =
  | { valid: true; data: LoginInput }
  | { valid: false; error: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export const authValidation = {
  validateRegister: (body: unknown): ValidationResult => {
    if (typeof body !== "object" || body === null) {
      return { valid: false, error: "Request body must be an object." };
    }

    const { name, email, password } = body as Record<string, unknown>;

    if (typeof name !== "string" || name.trim().length === 0) {
      return { valid: false, error: "'name' is required and must be a non-empty string." };
    }

    if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      return { valid: false, error: "'email' is required and must be a valid email address." };
    }

    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return {
        valid: false,
        error: `'password' is required and must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      };
    }

    return {
      valid: true,
      data: { name: name.trim(), email: email.trim().toLowerCase(), password },
    };
  },
  validateLogin: (body: unknown): LoginValidationResult => {
    if (typeof body !== "object" || body === null) {
      return { valid: false, error: "Request body must be an object." };
    }

    const { email, password } = body as Record<string, unknown>;

    if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      return { valid: false, error: "'email' is required and must be a valid email address." };
    }

    if (typeof password !== "string" || password.length === 0) {
      return { valid: false, error: "'password' is required." };
    }

    return {
      valid: true,
      data: { email: email.trim().toLowerCase(), password },
    };
  },
};

import { CreateWebsiteInput, UpdateWebsiteInput } from "./types";

type ValidationResult =
  | { valid: true; data: CreateWebsiteInput }
  | { valid: false; error: string };

type UpdateValidationResult =
  | { valid: true; data: UpdateWebsiteInput }
  | { valid: false; error: string };

export const websiteValidation = {
  validateCreate: (body: unknown): ValidationResult => {
    if (typeof body !== "object" || body === null) {
      return { valid: false, error: "Request body must be an object." };
    }

    const { url, name, platform } = body as Record<string, unknown>;

    if (typeof url !== "string" || url.trim().length === 0) {
      return { valid: false, error: "'url' is required and must be a non-empty string." };
    }

    if (name !== undefined && typeof name !== "string") {
      return { valid: false, error: "'name' must be a string if provided." };
    }

    if (platform !== undefined && typeof platform !== "string") {
      return { valid: false, error: "'platform' must be a string if provided." };
    }

    return { valid: true, data: { url, name, platform } };
  },
  validateUpdate: (body: unknown): UpdateValidationResult => {
    if (typeof body !== "object" || body === null) {
      return { valid: false, error: "Request body must be an object." };
    }

    const { url, name, platform, isActive } = body as Record<string, unknown>;

    if (url !== undefined && (typeof url !== "string" || url.trim().length === 0)) {
      return { valid: false, error: "'url' must be a non-empty string if provided." };
    }

    if (name !== undefined && typeof name !== "string") {
      return { valid: false, error: "'name' must be a string if provided." };
    }

    if (platform !== undefined && typeof platform !== "string") {
      return { valid: false, error: "'platform' must be a string if provided." };
    }

    if (isActive !== undefined && typeof isActive !== "boolean") {
      return { valid: false, error: "'isActive' must be a boolean if provided." };
    }

    if (url === undefined && name === undefined && platform === undefined && isActive === undefined) {
      return { valid: false, error: "At least one field (url, name, platform, isActive) must be provided." };
    }

    return { valid: true, data: { url, name, platform, isActive } };
  },
};

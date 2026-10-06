import { apiFetch } from "@/lib/api-client";
import type {
  AuthResult,
  LoginInput,
  RegisterInput,
  RegisterResult,
} from "./types";

export function registerUser(input: RegisterInput): Promise<RegisterResult> {
  return apiFetch<RegisterResult>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loginUser(input: LoginInput): Promise<AuthResult> {
  return apiFetch<AuthResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

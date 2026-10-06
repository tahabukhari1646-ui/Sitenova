import type { User } from "@/types";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterResult {
  user: User;
}

export interface AuthResult {
  user: User;
  token: string;
}

export interface AccessTokenPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

export function decodeToken(token: string): AccessTokenPayload | null {
  const segment = token.split(".")[1];
  if (!segment) return null;

  try {
    return JSON.parse(atob(segment)) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(payload: AccessTokenPayload): boolean {
  return Date.now() >= payload.exp * 1000;
}

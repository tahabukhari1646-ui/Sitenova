import { apiFetch } from "@/lib/api-client";
import type {
  CreateWebsiteInput,
  UpdateWebsiteInput,
  WebsiteListResult,
  WebsiteResult,
} from "./types";

export function getWebsites(): Promise<WebsiteListResult> {
  return apiFetch<WebsiteListResult>("/websites");
}

export function getWebsite(id: string): Promise<WebsiteResult> {
  return apiFetch<WebsiteResult>(`/websites/${id}`);
}

export function createWebsite(
  input: CreateWebsiteInput
): Promise<WebsiteResult> {
  return apiFetch<WebsiteResult>("/websites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWebsite(
  id: string,
  input: UpdateWebsiteInput
): Promise<WebsiteResult> {
  return apiFetch<WebsiteResult>(`/websites/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteWebsite(id: string): Promise<WebsiteResult> {
  return apiFetch<WebsiteResult>(`/websites/${id}`, {
    method: "DELETE",
  });
}

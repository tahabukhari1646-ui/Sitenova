import type { Website } from "@/types";

export interface CreateWebsiteInput {
  url: string;
  name?: string;
  platform?: string;
}

export interface UpdateWebsiteInput {
  url?: string;
  name?: string;
  platform?: string;
  isActive?: boolean;
}

export interface WebsiteListResult {
  websites: Website[];
}

export interface WebsiteResult {
  website: Website;
}

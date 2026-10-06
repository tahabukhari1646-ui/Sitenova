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

import { websiteRepository } from "./repository";
import { CreateWebsiteInput, UpdateWebsiteInput } from "./types";
import { NotFoundError } from "../../errors/AppError";
import { assertMonitorableUrl } from "../../utils/websiteUrl";

export const websiteService = {
  create: async (data: CreateWebsiteInput, userId: string) => {
    await assertMonitorableUrl(data.url);
    return websiteRepository.create(data, userId);
  },
  getAll: async (userId: string) => {
    return websiteRepository.findAll(userId);
  },
  getById: async (id: string, userId: string) => {
    const website = await websiteRepository.findById(id, userId);

    if (!website) {
      throw new NotFoundError(`Website with id '${id}' not found.`);
    }

    return website;
  },
  update: async (id: string, userId: string, data: UpdateWebsiteInput) => {
    // Stage 20.1: a changed URL passes the same SSRF gate as create --
    // checked only AFTER ownership, so someone else's site is always 404.
    if (data.url !== undefined) {
      if (!(await websiteRepository.findById(id, userId))) {
        throw new NotFoundError(`Website with id '${id}' not found.`);
      }
      await assertMonitorableUrl(data.url);
    }
    const website = await websiteRepository.update(id, userId, data);

    if (!website) {
      throw new NotFoundError(`Website with id '${id}' not found.`);
    }

    return website;
  },
  delete: async (id: string, userId: string) => {
    const website = await websiteRepository.delete(id, userId);

    if (!website) {
      throw new NotFoundError(`Website with id '${id}' not found.`);
    }

    return website;
  },
};

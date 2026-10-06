import { websiteRepository } from "./repository";
import { CreateWebsiteInput, UpdateWebsiteInput } from "./types";
import { NotFoundError } from "../../errors/AppError";

export const websiteService = {
  create: async (data: CreateWebsiteInput, userId: string) => {
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

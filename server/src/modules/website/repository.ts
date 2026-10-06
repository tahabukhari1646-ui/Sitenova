import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import { CreateWebsiteInput, UpdateWebsiteInput } from "./types";

export const websiteRepository = {
  create: (data: CreateWebsiteInput, userId: string) => {
    return prisma.website.create({ data: { ...data, userId } });
  },
  findAll: (userId: string) => {
    return prisma.website.findMany({ where: { userId } });
  },
  findById: (id: string, userId: string) => {
    return prisma.website.findFirst({ where: { id, userId } });
  },
  update: async (id: string, userId: string, data: UpdateWebsiteInput) => {
    const owned = await prisma.website.findFirst({ where: { id, userId } });

    if (!owned) {
      return null;
    }

    try {
      return await prisma.website.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }
      throw error;
    }
  },
  delete: async (id: string, userId: string) => {
    const owned = await prisma.website.findFirst({ where: { id, userId } });

    if (!owned) {
      return null;
    }

    try {
      return await prisma.website.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }
      throw error;
    }
  },
};

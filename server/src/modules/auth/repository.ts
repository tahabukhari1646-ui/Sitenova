import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import { CreateUserData } from "./types";

export const authRepository = {
  findByEmail: (email: string) => {
    return prisma.user.findUnique({ where: { email } });
  },
  create: async (data: CreateUserData) => {
    try {
      return await prisma.user.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }
      throw error;
    }
  },
};

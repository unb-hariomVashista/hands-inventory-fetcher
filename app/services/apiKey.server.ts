import crypto from "node:crypto";
import prisma from "../db.server";

export function generateSecureToken(): string {
  return `hsk_${crypto.randomBytes(24).toString("hex")}`;
}

export async function getOrCreateApiKey(shop: string) {
  let apiKey = await prisma.apiKey.findUnique({
    where: { shop },
  });

  if (!apiKey) {
    apiKey = await prisma.apiKey.create({
      data: {
        shop,
        token: generateSecureToken(),
        isActive: true,
      },
    });
  }

  return apiKey;
}

export async function regenerateApiKey(shop: string) {
  const newToken = generateSecureToken();
  const apiKey = await prisma.apiKey.upsert({
    where: { shop },
    update: {
      token: newToken,
      isActive: true,
      updatedAt: new Date(),
    },
    create: {
      shop,
      token: newToken,
      isActive: true,
    },
  });

  return apiKey;
}

export async function validateApiKey(token: string) {
  if (!token) return null;

  const apiKey = await prisma.apiKey.findUnique({
    where: { token },
  });

  if (!apiKey || !apiKey.isActive) {
    return null;
  }

  // Update lastUsedAt in the background
  prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch((err) => console.error("Error updating lastUsedAt:", err));

  return apiKey;
}

export async function updateAllowedOrigins(shop: string, allowedOrigins: string) {
  return await prisma.apiKey.update({
    where: { shop },
    data: {
      allowedOrigins: allowedOrigins.trim(),
      updatedAt: new Date(),
    },
  });
}


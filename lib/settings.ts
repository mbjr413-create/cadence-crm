import { prisma } from "./prisma";

export async function getAnthropicKey() {
  const setting = await prisma.setting.findUnique({ where: { key: "ANTHROPIC_API_KEY" } });
  return setting?.value || process.env.ANTHROPIC_API_KEY || "";
}
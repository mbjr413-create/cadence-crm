import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const settings = await prisma.setting.findMany();

    const mask = (val: string) => {
      if (!val) return "";
      if (val.length < 8) return "********";
      return `********${val.slice(-4)}`;
    };

    const getVal = (dbKey: string, envKey: string, defaultVal = "") => {
      const dbVal = settings.find(s => s.key === dbKey)?.value;
      return dbVal || process.env[envKey] || defaultVal;
    };

    return NextResponse.json({
      anthropicApiKey: mask(getVal("anthropicApiKey", "ANTHROPIC_API_KEY")),
      msClientId: getVal("msClientId", "MS_CLIENT_ID"),
      msClientSecret: mask(getVal("msClientSecret", "MS_CLIENT_SECRET")),
      msTenantId: getVal("msTenantId", "MS_TENANT_ID"),
      msSenderEmail: getVal("msSenderEmail", "MS_SENDER_EMAIL"),
      defaultTemplateId: getVal("defaultTemplateId", "DEFAULT_TEMPLATE_ID"),

      // UPDATED FIELDS
      followUpLimit: getVal("followUpLimit", "FOLLOW_UP_LIMIT", "1"),
      followUpDelayValue: getVal("followUpDelayValue", "FOLLOW_UP_DELAY_VALUE", "3"),
      followUpDelayUnit: getVal("followUpDelayUnit", "FOLLOW_UP_DELAY_UNIT", "days"),
      followUpPrompt: getVal("followUpPrompt", "FOLLOW_UP_PROMPT", "Write a short, polite 2-sentence follow-up to a cold email sent a few days ago about a guest post. Do not sound desperate. Keep it under 30 words."),
      autoFollowUpEnabled: getVal("autoFollowUpEnabled", "AUTO_FOLLOW_UP_ENABLED", "false"),
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();

    const updates = Object.entries(data).map(([key, value]) => {
      // Ignore masked secrets
      if (typeof value === "string" && value.startsWith("*")) {
        return Promise.resolve();
      }

      return prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    });

    await Promise.all(updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
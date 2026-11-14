import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST() {
  try {
    const websites = await prisma.website.findMany({
      where: { price: null },
      include: { emails: { include: { replies: { where: { isFromUs: false } } } } }
    });

    let updatedCount = 0;

    for (const site of websites) {
      const allReplies = site.emails.flatMap(e => e.replies).map(r => r.body).join("\n\n");
      if (!allReplies) continue;

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        system: "Extract the agreed price or quoted price from these messages. Output ONLY the price (e.g. $400, $50/hr). If no price is mentioned, output exactly 'NONE'.",
        messages: [{ role: "user", content: allReplies }]
      });

      const price = (msg.content[0] as any).text.trim();
      if (price !== 'NONE' && price.toLowerCase() !== 'no price' && price.length < 20) {
        await prisma.website.update({ where: { id: site.id }, data: { price } });
        updatedCount++;
      }
    }

    return NextResponse.json({ success: true, updatedCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
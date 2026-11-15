import { NextResponse } from "next/server";
import { scheduleImmediateScraperRun } from "@/lib/scrape-trigger";
export const maxDuration = 180;

export const runtime = "nodejs";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { websiteIds } = await req.json();
    if (!websiteIds || websiteIds.length === 0) return NextResponse.json({ error: "No sites provided" }, { status: 400 });

    await prisma.website.updateMany({
      where: { id: { in: websiteIds } },
      data: { status: "PROCESSING", progressMessage: "Queued for scraping..." }
    });

    scheduleImmediateScraperRun(websiteIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to start" }, { status: 500 });
  }
}

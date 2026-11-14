import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { scrapeClaimedWebsite } from "@/lib/scrape-runner";

export const runtime = "nodejs";
export const maxDuration = 180;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized worker invocation" }, { status: 401 });
  }

  try {
    // Protect against overlapping cron invocations by atomically claiming one queued record.
    const candidates = await prisma.website.findMany({
      where: {
        status: "PROCESSING",
        progressMessage: { in: ["Queued...", "Queued for scraping...", "Starting..."] },
      },
      select: { id: true, progressMessage: true },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    for (const candidate of candidates) {
      const claim = await prisma.website.updateMany({
        where: {
          id: candidate.id,
          status: "PROCESSING",
          progressMessage: candidate.progressMessage,
        },
        data: { progressMessage: "Starting scrape..." },
      });
      if (claim.count === 0) continue;

      try {
        const result = await scrapeClaimedWebsite(candidate.id);
        return NextResponse.json({ success: true, processed: 1, ...result });
      } catch (error) {
        console.error("Scrape worker failed for", candidate.id, error);
        const message = error instanceof Error ? error.message : "Unknown scraper error";
        // Return to NEW rather than pretending a scrape with no results succeeded.
        // Users can select this site and press scrape again to retry.
        await prisma.website.updateMany({
          where: { id: candidate.id, status: "PROCESSING" },
          data: { status: "NEW", progressMessage: `Scrape failed: ${message.slice(0, 180)}` },
        });
        return NextResponse.json({ success: false, processed: 1, error: message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, processed: 0, message: "Queue empty" });
  } catch (error) {
    console.error("Scrape worker scheduler error", error);
    return NextResponse.json({ error: "Scrape scheduler failed" }, { status: 500 });
  }
}

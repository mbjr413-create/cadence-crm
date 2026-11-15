import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLoggedIn } from "@/lib/scrape-auth";
import { scrapeClaimedWebsite } from "@/lib/scrape-runner";

export const runtime = "nodejs";
// One website per HTTP request; the browser awaits it before issuing the next.
export const maxDuration = 180;

const QUEUED = ["Queued...", "Queued for scraping...", "Starting..."];

export async function POST(request: Request) {
  if (!isLoggedIn(request)) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  let websiteId: string;
  try {
    const body = await request.json();
    websiteId = body?.websiteId;
    if (typeof websiteId !== "string" || websiteId.length < 1 || websiteId.length > 200) {
      return NextResponse.json({ error: "Invalid website ID" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let claimTag: string | null = null;
  try {
    const site = await prisma.website.findUnique({
      where: { id: websiteId },
      select: { id: true, domain: true, status: true, progressMessage: true },
    });
    if (!site) return NextResponse.json({ error: "Website not found" }, { status: 404 });
    if (site.status !== "PROCESSING" || !QUEUED.includes(site.progressMessage ?? "")) {
      return NextResponse.json({
        error: "Website is not queued. Choose Start Scraping or Resume first.",
        currentStatus: site.status,
        currentProgress: site.progressMessage,
      }, { status: 409 });
    }

    claimTag = `TAB:${randomUUID()}`;
    const claim = await prisma.website.updateMany({
      where: { id: websiteId, status: "PROCESSING", progressMessage: site.progressMessage },
      data: { progressMessage: `${claimTag}|Starting scrape...` },
    });
    if (!claim.count) {
      return NextResponse.json({ error: "Site was claimed or paused by another request" }, { status: 409 });
    }

    // The HTTP response is returned ONLY after scraping and persisting the result.
    // No after(), setInterval(), detached promise or cron request is involved.
    const outcome = await scrapeClaimedWebsite(websiteId, claimTag);
    return NextResponse.json({ success: true, processed: 1, ...outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[scrape] Manual website request failed", websiteId, error);
    if (claimTag) {
      await prisma.website.updateMany({
        where: { id: websiteId, status: "PROCESSING", progressMessage: { startsWith: `${claimTag}|` } },
        data: { status: "FAILED", progressMessage: `Scrape failed: ${message.slice(0, 160)}` },
      }).catch(err => console.error("[scrape] Could not mark failed website", err));
    }
    return NextResponse.json({ error: "Scraping failed; check Vercel logs", details: message.slice(0, 180) }, { status: 500 });
  }
}

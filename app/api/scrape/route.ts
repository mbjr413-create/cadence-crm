import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLoggedIn } from "@/lib/scrape-auth";

/** Queues only. The open browser tab invokes /api/scrape/run for each website. */
export async function POST(request: Request) {
  if (!isLoggedIn(request)) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  try {
    const payload = await request.json();
    const ids = payload?.websiteIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 500 ||
        !ids.every((id: unknown) => typeof id === "string" && id.length > 0 && id.length < 201)) {
      return NextResponse.json({ error: "Invalid website IDs" }, { status: 400 });
    }
    const uniqueIds = [...new Set<string>(ids)];
    const existingCount = await prisma.website.count({ where: { id: { in: uniqueIds } } });
    if (existingCount !== uniqueIds.length) {
      return NextResponse.json({ error: "Some selected websites no longer exist" }, { status: 404 });
    }
    // Reset the selected sites for manual execution. Other records aren't changed.
    // Existing saved emails are retained unless a later run finds a better candidate.
    await prisma.website.updateMany({
      where: { id: { in: uniqueIds } },
      data: { status: "PROCESSING", progressMessage: "Queued for scraping..." },
    });
    return NextResponse.json({ success: true, queued: uniqueIds.length, ids: uniqueIds });
  } catch (error) {
    console.error("[scrape] Failed to queue website selection", error);
    return NextResponse.json({ error: "Could not queue website selection" }, { status: 500 });
  }
}

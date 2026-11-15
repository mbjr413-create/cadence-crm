import { after } from "next/server";

/**
 * On a manual click or CSV upload, immediately ask the EXISTING secured
 * cron worker to process one selected website. Cron continues the rest.
 * No CRON_SECRET is exposed to the browser.
 */
export function scheduleImmediateScraperRun(websiteIds: string[]): void {
  if (websiteIds.length === 0) return;

  after(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      console.error("[scrape-trigger] CRON_SECRET is not configured; queued sites remain available for cron.");
      return;
    }

    // VERCEL_URL is supplied by Vercel and identifies THIS deployment.
    // Don't derive a privileged internal URL from the client's Host header.
    const hostname = process.env.VERCEL_URL;
    const url = hostname
      ? `https://${hostname}/api/scrape-worker`
      : `http://127.0.0.1:${process.env.PORT || "3000"}/api/scrape-worker`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ websiteIds }),
        cache: "no-store",
        signal: AbortSignal.timeout(120_000),
      });

      const body = (await response.text()).slice(0, 800);
      if (!response.ok) {
        console.error(`[scrape-trigger] Immediate worker returned HTTP ${response.status}: ${body}`);
      } else {
        console.info(`[scrape-trigger] Immediate worker returned HTTP ${response.status}: ${body}`);
      }
    } catch (error) {
      console.error("[scrape-trigger] Immediate worker request failed; queue remains for the cron worker.", error);
    }
  });
}

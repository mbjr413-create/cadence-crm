import * as cheerio from "cheerio";
import { chromium } from "playwright";

/** Diagnostic data is persisted separately; no Website schema migration is required. */
export type ScrapePageDiagnostic = {
  url: string;
  status: "OK" | "HTTP_ERROR" | "NAVIGATION_ERROR";
  httpStatus?: number;
  durationMs: number;
  newCandidates: number;
  error?: string;
};

export type ScrapeDiagnostic = {
  startedAt: string;
  finishedAt?: string;
  baseUrl: string;
  pages: ScrapePageDiagnostic[];
  candidates: string[];
  rejected: { junk: number; placeholder: number; invalid: number };
  outcome?: "EMAIL_FOUND" | "NO_EMAIL" | "FAILED";
  selectedEmail?: string | null;
  selectionReason?: string;
  error?: string;
};

// The original localhost detection rules are retained. Changes below instrument
// the navigation and prevent HTTP/network errors from becoming false NO_EMAIL results.
function decodeCfEmail(cfemail: string) {
  try {
    let email = "";
    const key = parseInt(cfemail.substring(0, 2), 16);
    for (let j = 2; j < cfemail.length; j += 2) {
      email += String.fromCharCode(parseInt(cfemail.substring(j, j + 2), 16) ^ key);
    }
    return email;
  } catch { return null; }
}

export async function extractEmailsFromSite(
  baseUrl: string,
  onProgress: (message: string) => Promise<void>,
  onDiagnostic?: (diagnostic: ScrapeDiagnostic) => Promise<void> | void,
): Promise<string[]> {
  const emails = new Set<string>();
  const urlsToVisit: string[] = [];
  const report: ScrapeDiagnostic = {
    startedAt: new Date().toISOString(), baseUrl,
    pages: [], candidates: [], rejected: { junk: 0, placeholder: 0, invalid: 0 },
  };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  const extractTextEmails = (text: string) => {
    if (!text) return;
    const matches = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi);
    if (!matches) return;
    matches.forEach(raw => {
      let clean = raw.toLowerCase().trim();
      clean = clean.replace(/^mailto:/i, "");
      clean = clean.replace(/[>,;\])]+$/, "");
      clean = clean.replace(/[.,;:!?\/]+$/, "");
      const isJunk = clean.includes("@2x") || clean.includes("@3x") || /@\d/.test(clean) ||
        clean.includes("sentry") || clean.includes("wixpress") ||
        /\.(png|jpg|jpeg|gif|webp|css|js|svg|json)$/.test(clean);
      const isPlaceholder = clean.includes("example.com") || clean.includes("domain.com") ||
        clean.includes("company.com") || clean.includes("yourname") ||
        clean.includes("yourdomain") || clean.includes("youremail") ||
        ["you@", "user@", "name@", "email@", "test@", "sample@"].some(v => clean.startsWith(v));
      if (isJunk) report.rejected.junk++;
      else if (isPlaceholder) report.rejected.placeholder++;
      else if (clean.length > 5 && clean.includes("@")) emails.add(clean);
      else report.rejected.invalid++;
    });
  };

  const parsePage = (rawHtml: string, visibleText: string, parseLinks: boolean) => {
    extractTextEmails(visibleText);
    extractTextEmails(rawHtml);
    const $ = cheerio.load(rawHtml);
    $('a[href*="mailto:"]').each((_, el) => {
      const href = $(el).attr("href");
      const match = href?.match(/mailto:([^?&"'\s]+)/i);
      if (match?.[1]) extractTextEmails(match[1]);
    });
    $('a[href*="/cdn-cgi/l/email-protection"]').each((_, el) => {
      const hash = $(el).attr("href")?.split("#")[1];
      if (hash) {
        const decoded = decodeCfEmail(hash);
        if (decoded) extractTextEmails(decoded);
      }
    });
    const bodyText = $("body").text().replace(/\s+/g, " ");
    const obfuscatedMatches = bodyText.match(/([a-zA-Z0-9._-]+\s*\[at\]\s*[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi);
    obfuscatedMatches?.forEach(value => extractTextEmails(value.replace(/\s*\[at\]\s*/gi, "@")));
    $('header, footer, nav, [class*="footer"], [class*="header"]').each((_, el) => {
      extractTextEmails($(el).text());
    });
    if (parseLinks) {
      $('a').each((_, el) => {
        const href = $(el).attr("href");
        const linkText = $(el).text().toLowerCase();
        if (!href) return;
        try {
          const absolute = new URL(href, baseUrl);
          const original = new URL(baseUrl);
          if (absolute.protocol !== "http:" && absolute.protocol !== "https:") return;
          // Stay on the original host (unlike substring matching, this cannot include foreign hosts).
          if (absolute.hostname !== original.hostname) return;
          if (linkText.includes("contact") || linkText.includes("about") || linkText.includes("advertis") ||
              linkText.includes("team") || absolute.href.includes("contact") || absolute.href.includes("about")) {
            urlsToVisit.unshift(absolute.href);
          } else urlsToVisit.push(absolute.href);
        } catch { /* Invalid links are ignored. */ }
      });
    }
  };

  try {
    const parsed = new URL(baseUrl);
    if (!["https:", "http:"].includes(parsed.protocol) ||
        !parsed.hostname.includes(".") ||
        /(^localhost$|\.localhost$|\.local$|^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^\[?::1\]?$)/i.test(parsed.hostname)) {
      throw new Error("Website URL must be a public HTTP(S) host");
    }

    browser = process.env.VERCEL
      ? await (async () => {
          const serverlessChromium = (await import("@sparticuz/chromium")).default;
          return chromium.launch({
            executablePath: await serverlessChromium.executablePath(),
            args: serverlessChromium.args,
            headless: true,
          });
        })()
      : await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    async function visit(url: string, timeout: number, links: boolean) {
      const started = Date.now();
      const before = emails.size;
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout });
        const httpStatus = response?.status();
        if (!response || (httpStatus !== undefined && httpStatus >= 400)) {
          const statusText = `HTTP ${httpStatus ?? "no response"}`;
          report.pages.push({url, status:"HTTP_ERROR", httpStatus, durationMs:Date.now()-started, newCandidates:0, error:statusText});
          throw new Error(`${url}: ${statusText}`);
        }
        // Preserve the original JS-rendering allowance; optimize only after a baseline comparison.
        await page.waitForTimeout(1500);
        const html = await page.content();
        const visible = await page.evaluate(() => document.body?.innerText || "");
        parsePage(html, visible, links);
        report.pages.push({url,status:"OK",httpStatus,durationMs:Date.now()-started,newCandidates:emails.size-before});
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (!report.pages.some(p => p.url === url && p.status === "HTTP_ERROR")) {
          report.pages.push({url,status:"NAVIGATION_ERROR",durationMs:Date.now()-started,newCandidates:0,error:reason.slice(0,240)});
        }
        throw error;
      }
    }

    await onProgress("Fetching homepage...");
    await visit(baseUrl, 15000, true);
    if (emails.size === 0) {
      const priorityUrls = Array.from(new Set(urlsToVisit)).filter(url => url !== baseUrl).slice(0, 3);
      for (const contactUrl of priorityUrls) {
        if (emails.size > 0) break;
        await onProgress(`Scanning ${new URL(contactUrl).pathname || "/"}...`);
        try { await visit(contactUrl, 10000, false); }
        catch { /* Log individual failed pages; determine partial failure below. */ }
      }
      const failedContactPages = report.pages.slice(1).filter(p => p.status !== "OK");
      // Incomplete contact-page inspection cannot legitimately be reported as NO_EMAIL.
      if (emails.size === 0 && failedContactPages.length > 0) {
        throw new Error(`Incomplete contact scan: ${failedContactPages.length} candidate page(s) could not be loaded`);
      }
    }
    report.candidates = [...emails];
    report.outcome = emails.size > 0 ? "EMAIL_FOUND" : "NO_EMAIL";
    return [...emails];
  } catch (error) {
    report.error = error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400);
    report.outcome = "FAILED";
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.candidates = [...emails];
    try { if (browser) await browser.close(); }
    catch (error) { console.error("[scrape] browser cleanup error", error); }
    // The final report is written by the runner with the AI decision added.
    try { await onDiagnostic?.(report); }
    catch (error) { console.error("[scrape] diagnostic callback failed", error); }
  }
}

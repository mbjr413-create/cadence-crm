import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isIP } from "node:net";

export type ScrapePageDiagnostic = {
  url: string;
  status: "OK" | "HTTP_ERROR" | "NAVIGATION_ERROR";
  httpStatus?: number;
  durationMs: number;
  newCandidates: number;
  error?: string;
  mode?: "BROWSER" | "HTTP_FALLBACK";
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

function decodeCfEmail(cfemail: string): string | null {
  try {
    const key = parseInt(cfemail.slice(0, 2), 16);
    if (!Number.isFinite(key) || !/^[a-f\d]+$/i.test(cfemail)) return null;
    let email = "";
    for (let i = 2; i + 1 < cfemail.length; i += 2) {
      email += String.fromCharCode(parseInt(cfemail.slice(i, i + 2), 16) ^ key);
    }
    return email;
  } catch { return null; }
}

// A public, non-IP hostname only. Arbitrary internal URLs must not reach the browser.
function validatePublicUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!(["https:", "http:"].includes(url.protocol)) || !host.includes(".") ||
      isIP(host) !== 0 || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
      url.username || url.password) {
    throw new Error("Only public HTTP(S) website domains are supported");
  }
  return url;
}

function relatedHost(host: string, original: string): boolean {
  const trimWww = (s: string) => s.toLowerCase().replace(/^www\./, "");
  return trimWww(host) === trimWww(original);
}

export async function extractEmailsFromSite(
  baseUrl: string,
  onProgress: (msg: string) => Promise<void>,
  onDiagnostic?: (diagnostic: ScrapeDiagnostic) => Promise<void> | void,
): Promise<string[]> {
  const target = validatePublicUrl(baseUrl);
  const emails = new Set<string>();
  const urlsToVisit = new Map<string, number>();
  const report: ScrapeDiagnostic = {
    startedAt: new Date().toISOString(), baseUrl,
    pages: [], candidates: [], rejected: { junk: 0, placeholder: 0, invalid: 0 },
  };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let profilePath: string | undefined;
  let inspectedSuccessfully = 0;

  const extractTextEmails = (text: string) => {
    if (!text) return;
    const matches = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi);
    matches?.forEach(raw => {
      let clean = raw.toLowerCase().trim();
      clean = clean.replace(/^mailto:/i, "").replace(/[>,;\])]+$/, "").replace(/[.,;:!?\/]+$/, "");
      const junk = clean.includes("@2x") || clean.includes("@3x") || /@\d/.test(clean) ||
        clean.includes("sentry") || clean.includes("wixpress") ||
        /\.(png|jpg|jpeg|gif|webp|css|js|svg|json)$/.test(clean);
      const placeholder = ["example.com", "domain.com", "company.com", "yourname", "yourdomain", "youremail"].some(s => clean.includes(s)) ||
        ["you@", "user@", "name@", "email@", "test@", "sample@"].some(s => clean.startsWith(s));
      if (junk) report.rejected.junk++;
      else if (placeholder) report.rejected.placeholder++;
      else if (clean.length > 5 && clean.includes("@")) emails.add(clean);
      else report.rejected.invalid++;
    });
  };

  const parsePage = (html: string, text: string, pageUrl: string, collectLinks: boolean) => {
    extractTextEmails(text);
    extractTextEmails(html);
    const $ = cheerio.load(html);
    $('a[href*="mailto:"]').each((_, el) => {
      const match = $(el).attr("href")?.match(/mailto:([^?&"'\s]+)/i);
      if (match?.[1]) extractTextEmails(match[1]);
    });
    $('a[href*="/cdn-cgi/l/email-protection"], [data-cfemail]').each((_, el) => {
      const encoded = $(el).attr("data-cfemail") || $(el).attr("href")?.split("#")[1];
      if (encoded) {
        const decoded = decodeCfEmail(encoded);
        if (decoded) extractTextEmails(decoded);
      }
    });
    const bodyText = $('body').text().replace(/\s+/g, ' ');
    const obfuscated = bodyText.match(/([a-zA-Z0-9._-]+\s*\[at\]\s*[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi);
    obfuscated?.forEach(s => extractTextEmails(s.replace(/\s*\[at\]\s*/gi, "@")));
    $('header, footer, nav, [class*="footer"], [class*="header"]').each((_, el) => extractTextEmails($(el).text()));

    if (!collectLinks) return;
    $('a[href]').each((_, el) => {
      const href = $(el).attr("href") || "";
      try {
        const abs = validatePublicUrl(new URL(href, pageUrl).href);
        if (!relatedHost(abs.hostname, target.hostname)) return;
        const text = $(el).text().toLowerCase();
        const hint = `${text} ${abs.pathname.toLowerCase()}`;
        const score = /contact|reach-us|get-in-touch/.test(hint) ? 100 :
          /advertis|media-kit/.test(hint) ? 90 :
          /about|team|staff/.test(hint) ? 80 :
          /support|impressum/.test(hint) ? 70 : 0;
        // Preserve the original breadth, but prioritise relevant contacts reliably.
        const key = abs.href.split("#")[0];
        if (key !== baseUrl && !urlsToVisit.has(key)) urlsToVisit.set(key, score);
      } catch { /* Skip mailto:, invalid or non-public links. */ }
    });
  };

  const preferredUrls = () => [...urlsToVisit.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .filter(url => url !== baseUrl)
    .slice(0, 3);

  function record(url: string, mode: "BROWSER" | "HTTP_FALLBACK", started: number,
                  status: ScrapePageDiagnostic["status"], before: number,
                  httpStatus?: number, error?: string) {
    report.pages.push({ url, mode, status, httpStatus, durationMs: Date.now() - started,
      newCandidates: emails.size - before, ...(error ? { error: error.slice(0, 250) } : {}) });
  }

  async function httpFallback() {
    // Best-effort static HTML fallback when Chromium is unavailable or resource constrained.
    // Fetch does not render JavaScript, so it is not a replacement for the original scraper.
    const visit = async (url: string, collectLinks: boolean) => {
      const start = Date.now();
      const before = emails.size;
      let httpStatus: number | undefined;
      try {
        // Follow at most three public redirects; never fetch a non-public redirect URL.
        let next = validatePublicUrl(url).href;
        let response: Response | undefined;
        for (let i = 0; i < 4; i++) {
          response = await fetch(next, {
            redirect: "manual", signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; CadenceCRM/1.0)", Accept: "text/html,application/xhtml+xml" },
          });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          if (i === 3) throw Error("Too many redirects");
          const location = response.headers.get("location");
          if (!location) throw Error("Redirect missing location");
          next = validatePublicUrl(new URL(location, next).href).href;
        }
        if (!response) throw Error("No HTTP response");
        httpStatus = response.status;
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const contentType = response.headers.get("content-type") || "";
        if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) throw Error("Not an HTML page");
        const html = (await response.text()).slice(0, 1_500_000);
        parsePage(html, cheerio.load(html)("body").text(), next, collectLinks);
        inspectedSuccessfully++;
        record(url, "HTTP_FALLBACK", start, "OK", before, httpStatus);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        record(url, "HTTP_FALLBACK", start, httpStatus && httpStatus >= 400 ? "HTTP_ERROR" : "NAVIGATION_ERROR", before, httpStatus, message);
      }
    };
    await onProgress("Trying lightweight HTML recovery...");
    await visit(baseUrl, true);
    if (!emails.size) {
      for (const url of preferredUrls()) {
        await onProgress(`Checking ${new URL(url).pathname} via HTTP...`);
        await visit(url, false);
        if (emails.size) break;
      }
    }
  }

  try {
    try {
      if (process.env.VERCEL) {
        const serverless = (await import("@sparticuz/chromium")).default;
        // A unique profile helps avoid /tmp exhaustion across warm serverless invocations.
        profilePath = join(tmpdir(), `cadence-pw-${randomUUID()}`);
        browser = await chromium.launch({ executablePath: await serverless.executablePath(),
          args: [...serverless.args, `--user-data-dir=${profilePath}`, "--disable-extensions"], headless: true });
      } else {
        browser = await chromium.launch({ headless: true });
      }
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      // Do not load large resources that aren't needed to extract email addresses.
      await context.route("**/*", async route => {
        const type = route.request().resourceType();
        if (type === "image" || type === "font" || type === "media") await route.abort();
        else await route.continue();
      });
      const page = await context.newPage();
      const browserVisit = async (url: string, timeout: number, collectLinks: boolean) => {
        const start = Date.now();
        const before = emails.size;
        let httpStatus: number | undefined;
        try {
          const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout });
          httpStatus = response?.status();
          if (!response || (httpStatus !== undefined && httpStatus >= 400)) throw Error(`HTTP ${httpStatus ?? "no response"}`);
          // Keep the original short rendering allowance for JavaScript-populated footers.
          await page.waitForTimeout(1500);
          const html = await page.content();
          const text = await page.evaluate(() => document.body?.innerText || "");
          parsePage(html, text, page.url(), collectLinks);
          inspectedSuccessfully++;
          record(url, "BROWSER", start, "OK", before, httpStatus);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          record(url, "BROWSER", start, httpStatus && httpStatus >= 400 ? "HTTP_ERROR" : "NAVIGATION_ERROR", before, httpStatus, message);
          throw error;
        }
      };
      await onProgress("Fetching homepage...");
      await browserVisit(baseUrl, 15000, true);
      if (!emails.size) {
        for (const url of preferredUrls()) {
          await onProgress(`Scanning ${new URL(url).pathname || "/"}...`);
          try { await browserVisit(url, 10000, false); }
          catch { /* A single failed contact page does not discard all findings. */ }
          if (emails.size) break;
        }
      }
      await context.close();
    } catch (browserError) {
      const reason = browserError instanceof Error ? browserError.message : String(browserError);
      console.warn("[scrape] Chromium failed, attempting HTML fallback:", reason.slice(0, 250));
      // Free browser resources before attempting the lightweight recovery path.
      if (browser) {
        try { await browser.close(); } catch { /* Best-effort cleanup. */ }
        browser = undefined;
      }
      await httpFallback();
      if (!inspectedSuccessfully) throw new Error(`Browser and HTML fallback could not inspect the website: ${reason.slice(0, 180)}`);
    }
    // If the homepage was inspected but all promising contact pages failed, this is incomplete.
    if (!emails.size) {
      const failedLinks = report.pages.filter(p => p.url !== baseUrl && p.status !== "OK");
      if (failedLinks.length && !report.pages.some(p => p.url !== baseUrl && p.status === "OK")) {
        // If Chromium could reach the homepage but not its contact links, try static HTML.
        await httpFallback();
        if (!emails.size && !report.pages.some(p => p.url !== baseUrl && p.status === "OK")) {
          throw new Error(`Incomplete contact scan: ${failedLinks.length} contact page(s) failed`);
        }
      }
      if (!inspectedSuccessfully) throw new Error("No page was successfully inspected");
    }
    report.outcome = emails.size ? "EMAIL_FOUND" : "NO_EMAIL";
    return [...emails];
  } catch (error) {
    report.error = error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400);
    report.outcome = "FAILED";
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.candidates = [...emails];
    if (browser) {
      try { await browser.close(); }
      catch (error) { console.error("[scrape] Chromium cleanup failed", error); }
    }
    if (profilePath) {
      try { await rm(profilePath, { recursive: true, force: true }); }
      catch (error) { console.warn("[scrape] Could not remove temporary browser profile", error); }
    }
    try { await onDiagnostic?.(report); }
    catch (error) { console.error("[scrape] Could not save diagnostic report", error); }
  }
}

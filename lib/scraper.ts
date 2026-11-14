import * as cheerio from "cheerio";
import { chromium } from "playwright";

// Decodes Cloudflare protected emails
function decodeCfEmail(cfemail: string) {
  try {
    let email = '';
    const r = parseInt(cfemail.substr(0, 2), 16);
    for (let j = 2; j < cfemail.length; j += 2) {
      const c = parseInt(cfemail.substr(j, 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email;
  } catch (e) {
    return null;
  }
}

export async function extractEmailsFromSite(baseUrl: string, onProgress: (msg: string) => Promise<void>) {
  const emails = new Set<string>();
  let urlsToVisit: string[] = [];

  const extractTextEmails = (text: string) => {
    if (!text) return;
    const matches = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi);
    if (matches) {
      matches.forEach(e => {
        let clean = e.toLowerCase().trim();
        clean = clean.replace(/^mailto:/i, "");
        clean = clean.replace(/[>,;\])]+$/, "");
        clean = clean.replace(/[.,;:!?\/]+$/, "");
        
        const isJunk = 
          clean.includes('@2x') || clean.includes('@3x') || /@\d/.test(clean) || 
          clean.includes('sentry') || clean.includes('wixpress') || 
          clean.match(/\.(png|jpg|jpeg|gif|webp|css|js|svg|json)$/);

        const isPlaceholder = 
          clean.includes('example.com') || clean.includes('domain.com') || 
          clean.includes('company.com') || clean.includes('yourname') || 
          clean.includes('yourdomain') || clean.includes('youremail') ||
          clean.startsWith('you@') || clean.startsWith('user@') ||
          clean.startsWith('name@') || clean.startsWith('email@') ||
          clean.startsWith('test@') || clean.startsWith('sample@');

        if (!isJunk && !isPlaceholder && clean.length > 5 && clean.includes('@')) {
          emails.add(clean);
        }
      });
    }
  };

  const parsePage = (rawHtml: string, visibleText: string, parseLinks: boolean) => {
    extractTextEmails(visibleText);
    extractTextEmails(rawHtml);

    const $ = cheerio.load(rawHtml);
    
    // Fixed mailto to catch archive links like web.archive.org/.../mailto:...
    $('a[href*="mailto:"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const match = href.match(/mailto:([^?&"'\s]+)/i);
        if (match && match[1]) extractTextEmails(match[1]);
      }
    });

    $('a[href*="/cdn-cgi/l/email-protection"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const hash = href.split('#')[1];
        if (hash) {
          const decoded = decodeCfEmail(hash);
          if (decoded) extractTextEmails(decoded);
        }
      }
    });

    const bodyText = $('body').text().replace(/\s+/g, ' ');
    const obfuscatedMatches = bodyText.match(/([a-zA-Z0-9._-]+\s*\[at\]\s*[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi);
    if (obfuscatedMatches) {
      obfuscatedMatches.forEach(m => extractTextEmails(m.replace(/\s*\[at\]\s*/gi, '@')));
    }

    // Deep scan footers
    $('header, footer, nav, [class*="footer"], [class*="header"]').each((_, el) => {
      extractTextEmails($(el).text());
    });

    // STRICTER LINK MATCHING (Reverted to exact hostname)
    if (parseLinks) {
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const linkText = $(el).text().toLowerCase();
        if (href) {
          try {
            const absolute = new URL(href, baseUrl).href;
            if (absolute.includes(new URL(baseUrl).hostname)) {
              if (linkText.includes('contact') || linkText.includes('about') || linkText.includes('advertis') || linkText.includes('team') || absolute.includes('contact') || absolute.includes('about')) {
                urlsToVisit.unshift(absolute); 
              } else {
                urlsToVisit.push(absolute);
              }
            }
          } catch (e) {}
        }
      });
    }
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  await onProgress("Fetching homepage...");
  try {
    // REVERTED: domcontentloaded is much more reliable than networkidle
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500); // Give JS a moment to render footers
    
    const html = await page.content();
    const innerText = await page.evaluate(() => document.body.innerText);
    
    parsePage(html, innerText, true);
  } catch (e) {
    await browser.close();
    return []; 
  }

  if (emails.size > 0) {
    await browser.close();
    return Array.from(emails);
  }

  const priorityUrls = Array.from(new Set(urlsToVisit)).slice(0, 3);

  for (const cUrl of priorityUrls) {
    if (emails.size > 0) break;
    const pathName = new URL(cUrl).pathname;
    
    await onProgress(`Scanning ${pathName === '/' ? 'page' : pathName}...`);
    try {
      await page.goto(cUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1500);
      
      const html = await page.content();
      const innerText = await page.evaluate(() => document.body.innerText);
      
      parsePage(html, innerText, false);
    } catch (e) {}
  }

  await browser.close();
  return Array.from(emails);
}
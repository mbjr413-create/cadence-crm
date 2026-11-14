import { NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { extractEmailsFromSite } from "@/lib/scraper";
import { getAnthropicKey } from "@/lib/settings";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const text = await file.text();
    const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
    
    const validRows = (data as any[]).filter(row => {
      const rawUrl = row.url || row.website || row.domain || Object.values(row)[0];
      return rawUrl && typeof rawUrl === 'string';
    });

    if (validRows.length === 0) return NextResponse.json({ error: "No valid URLs found" }, { status: 400 });

    const newIds = [];
    for (const row of validRows) {
      const rawUrl = row.url || row.website || row.domain || Object.values(row)[0];
      let domain = rawUrl.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      let url = `https://${domain}`;

      const existing = await prisma.website.findUnique({ where: { domain } });
      if (existing) continue;

      const newSite = await prisma.website.create({
        data: { domain, url, status: "PROCESSING", progressMessage: "Queued..." }
      });
      newIds.push(newSite.id);
    }

    if (newIds.length === 0) return NextResponse.json({ error: "All domains already exist" }, { status: 400 });

    processCSV(newIds).catch(console.error);
    return NextResponse.json({ success: true, total: newIds.length, ids: newIds });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process" }, { status: 500 });
  }
}

async function processCSV(ids: string[]) {
  const sites = await prisma.website.findMany({ where: { id: { in: ids } } });
  const apiKey = await getAnthropicKey();
  const anthropic = new Anthropic({ apiKey });

  for (const site of sites) {
    const liveSite = await prisma.website.findUnique({ where: { id: site.id } });
    if (liveSite?.status !== "PROCESSING") continue;

    const updateProgress = async (msg: string) => {
      await prisma.website.update({ where: { id: site.id }, data: { progressMessage: msg } });
    };

    const foundEmails = await extractEmailsFromSite(site.url, updateProgress);
    let bestEmail = null;

    if (foundEmails.length > 0) {
      if (foundEmails.length === 1) {
        bestEmail = foundEmails[0];
      } else {
        await updateProgress("AI analyzing contacts...");
        try {
          const msg = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 50,
            system: "You are an expert data cleaner. Analyze this list of emails found on a website. 1. Discard obvious placeholders like 'you@company.com', 'user@domain.com', or anything containing 'example'. 2. Discard random strings or code. 3. If there is a real contact email (e.g., hello@site.com, editor@site.com), reply with that exact email. 4. If ALL emails are placeholders or junk, reply EXACTLY with the word 'NONE'. Do not include any other text.",
            messages: [{ role: "user", content: `Emails: ${foundEmails.join(", ")}` }]
          });
          const aiPick = (msg.content[0] as any).text.trim();
          
          if (aiPick !== "NONE") {
             bestEmail = foundEmails.includes(aiPick) ? aiPick : foundEmails[0];
          }
        } catch (e) {
          bestEmail = foundEmails[0];
        }
      }
    }

    await prisma.website.update({
      where: { id: site.id },
      data: {
        email: bestEmail,
        status: bestEmail ? "EMAIL_FOUND" : "NO_EMAIL",
        progressMessage: bestEmail ? "Done!" : "No email found."
      }
    });
  }
}

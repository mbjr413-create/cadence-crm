import { prisma } from "@/lib/prisma";
import { extractEmailsFromSite, type ScrapeDiagnostic } from "@/lib/scraper";
import { getAnthropicKey } from "@/lib/settings";
import Anthropic from "@anthropic-ai/sdk";

export type ScrapeOutcome = {id:string; status:"EMAIL_FOUND"|"NO_EMAIL"|"FAILED"|"SKIPPED"; found:boolean; error?:string};

/** No schema migration: store the full per-site report in the existing Settings table. */
async function saveDiagnostic(id: string, report: ScrapeDiagnostic) {
  try {
    await prisma.setting.upsert({
      where: { key: `scrapeDiagnostic:${id}` },
      update: { value: JSON.stringify(report) },
      create: { key: `scrapeDiagnostic:${id}`, value: JSON.stringify(report) },
    });
  } catch (error) { console.error("[scrape] Could not persist diagnostic", id, error); }
  console.info("[scrape-report]", JSON.stringify({id, ...report}));
}

/** A run token prevents a stopped/requeued website being overwritten by an older invocation. */
export async function scrapeClaimedWebsite(id: string, claimTag: string): Promise<ScrapeOutcome> {
  const prefix = `${claimTag}|`;
  const site = await prisma.website.findUnique({where:{id}});
  if (!site || site.status !== "PROCESSING" || !site.progressMessage?.startsWith(prefix)) {
    return {id,status:"SKIPPED",found:false};
  }
  let report: ScrapeDiagnostic | undefined;
  const updateProgress = async (message: string) => {
    const updated = await prisma.website.updateMany({
      where: {id,status:"PROCESSING",progressMessage:{startsWith:prefix}},
      data: {progressMessage:`${prefix}${message}`},
    });
    if (!updated.count) throw new Error("Scrape stopped, replaced or requeued");
  };
  try {
    const emails = await extractEmailsFromSite(site.url, updateProgress, value => {report=value;});
    let bestEmail: string | null = null;
    let selectionReason: string;
    if (emails.length === 0) {
      selectionReason = "No candidates found on the pages successfully inspected";
    } else if (emails.length === 1) {
      bestEmail = emails[0];
      selectionReason = "One valid email candidate found";
    } else {
      await updateProgress("AI analysing contacts...");
      try {
        const apiKey = await getAnthropicKey();
        const anthropic = new Anthropic({apiKey});
        const msg = await anthropic.messages.create({
          model:"claude-haiku-4-5-20251001",max_tokens:50,
          system:"You are an expert data cleaner. Analyze this list of emails found on a website. 1. Discard obvious placeholders like 'you@company.com', 'user@domain.com', or anything containing 'example'. 2. Discard random strings or code. 3. If there is a real contact email (e.g., hello@site.com, editor@site.com), reply with that exact email. 4. If ALL emails are placeholders or junk, reply EXACTLY with the word 'NONE'. Do not include any other text.",
          messages:[{role:"user",content:`Emails: ${emails.join(", ")}`}],
        });
        const pick = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "NONE";
        if (pick !== "NONE") {
          bestEmail = emails.includes(pick) ? pick : emails[0];
          selectionReason = emails.includes(pick) ? "Claude selected a discovered candidate" : "Claude output mismatched candidates; used original fallback";
        } else selectionReason = "Claude rejected all candidates";
      } catch (error) {
        console.error("[scrape] Claude selection failed",site.domain,error);
        bestEmail=emails[0];
        selectionReason="AI unavailable; used original first-candidate fallback";
      }
    }
    const effectiveEmail = bestEmail || site.email || null;
    const finalStatus = effectiveEmail ? "EMAIL_FOUND" : "NO_EMAIL";
    const update = await prisma.website.updateMany({
      where:{id,status:"PROCESSING",progressMessage:{startsWith:prefix}},
      data:{
        email:effectiveEmail,
        status:finalStatus,
        progressMessage:bestEmail ? "Done!" : effectiveEmail ? "No new email; retained existing contact" : "No email found on checked pages",
      },
    });
    if (!update.count) return {id,status:"SKIPPED",found:false};
    if (report) await saveDiagnostic(id,{
      ...report,outcome:finalStatus,selectedEmail:effectiveEmail,selectionReason:
        bestEmail ? selectionReason : effectiveEmail ? `${selectionReason}; preserved existing email` : selectionReason,
    });
    return {id,status:finalStatus,found:Boolean(effectiveEmail)};
  } catch (error) {
    const message=error instanceof Error ? error.message : String(error);
    const failUpdate=await prisma.website.updateMany({
      where:{id,status:"PROCESSING",progressMessage:{startsWith:prefix}},
      data:{status:"FAILED",progressMessage:`Scrape failed: ${message.slice(0,170)}`},
    });
    if (!failUpdate.count) return {id,status:"SKIPPED",found:false};
    const diagnostic: ScrapeDiagnostic = report || {
      startedAt:new Date().toISOString(),baseUrl:site.url,pages:[],candidates:[],
      rejected:{junk:0,placeholder:0,invalid:0},
    };
    await saveDiagnostic(id,{...diagnostic,outcome:"FAILED",error:message.slice(0,400),selectionReason:"Scrape or navigation failed; existing email preserved"});
    console.error("[scrape] Failed",site.domain,message);
    return {id,status:"FAILED",found:false,error:message.slice(0,200)};
  }
}

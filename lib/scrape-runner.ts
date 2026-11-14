import { prisma } from "@/lib/prisma";
import { extractEmailsFromSite } from "@/lib/scraper";
import { getAnthropicKey } from "@/lib/settings";
import Anthropic from "@anthropic-ai/sdk";

/** Execute exactly one previously claimed website. Caller must await completion. */
export async function scrapeClaimedWebsite(id: string): Promise<{ id: string; found: boolean }> {
  const site = await prisma.website.findUnique({ where: { id } });
  if (!site || site.status !== "PROCESSING") {
    return { id, found: false };
  }

  const updateProgress = async (message: string) => {
    // Do not overwrite a Stop/Resume action that changed the status.
    await prisma.website.updateMany({
      where: { id, status: "PROCESSING" },
      data: { progressMessage: message },
    });
  };

  const emails = await extractEmailsFromSite(site.url, updateProgress);
  let bestEmail: string | null = null;

  if (emails.length === 1) {
    bestEmail = emails[0];
  } else if (emails.length > 1) {
    await updateProgress("AI analyzing contacts...");
    try {
      const apiKey = await getAnthropicKey();
      const anthropic = new Anthropic({ apiKey });
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        system: "You are an expert data cleaner. Analyze this list of emails found on a website. Discard placeholders such as you@company.com and any fake addresses. If there is a real contact email, reply with that exact email. Otherwise reply NONE. Output only the email or NONE.",
        messages: [{ role: "user", content: `Emails: ${emails.join(", ")}` }],
      });
      const pick = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "NONE";
      if (pick !== "NONE") bestEmail = emails.includes(pick) ? pick : emails[0];
    } catch (error) {
      console.error("AI email selection failed for", site.domain, error);
      bestEmail = emails[0]; // Preserve current fallback behavior.
    }
  }

  await prisma.website.updateMany({
    where: { id, status: "PROCESSING" },
    data: {
      email: bestEmail,
      status: bestEmail ? "EMAIL_FOUND" : "NO_EMAIL",
      progressMessage: bestEmail ? "Done!" : "No email found.",
    },
  });

  return { id, found: Boolean(bestEmail) };
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function cleanEmailBody(html: string) {
  if (!html) return "";
  let text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  const splitPatterns = [/On .+ wrote:/i, /-----Original Message-----/i, /From: .+/i, /Sent: .+/i];
  for (const pattern of splitPatterns) {
    const parts = text.split(pattern);
    if (parts.length > 1) text = parts[0].trim();
  }
  return text;
}

async function extractPriceFromThread(emailId: string, websiteId: string) {
  try {
    const fullEmail = await prisma.email.findUnique({
      where: { id: emailId },
      include: { replies: { orderBy: { receivedAt: 'asc' } }, website: true }
    });

    if (!fullEmail) return;

    let threadText = `Original Email from Me to ${fullEmail.website.domain}:\n${fullEmail.body}\n\n`;
    fullEmail.replies.forEach(r => {
      threadText += `${r.isFromUs ? 'Me' : 'Them'}: ${r.body}\n\n`;
    });

    const priceMsg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      system: "Read the ENTIRE email thread below. What is the final agreed price or the most recent price discussed? Output ONLY the price (e.g. $300, $400). If they are still negotiating, output the latest price mentioned. If no price is mentioned at all, output exactly 'NONE'.",
      messages: [{ role: "user", content: threadText }]
    });

    const extractedPrice = (priceMsg.content[0] as any).text.trim();
    
    if (extractedPrice !== 'NONE' && extractedPrice.toLowerCase() !== 'no price' && extractedPrice.length < 20) {
      const currentSite = await prisma.website.findUnique({ where: { id: websiteId } });
      if (currentSite?.price !== extractedPrice) {
        await prisma.website.update({ where: { id: websiteId }, data: { price: extractedPrice } });
        await prisma.notification.create({ data: { message: `Price settled for ${currentSite?.domain}: ${extractedPrice}`, type: "success" } });
      }
    }
  } catch (e) {
    console.error("Failed to extract price from thread", e);
  }
}

export async function POST() {
  try {
    const settings = await prisma.setting.findMany();
    const getVal = (key: string, envKey: string) => settings.find(s => s.key === key)?.value || process.env[envKey] || "";

    const clientId = getVal("msClientId", "MS_CLIENT_ID");
    const clientSecret = getVal("msClientSecret", "MS_CLIENT_SECRET");
    const tenantId = getVal("msTenantId", "MS_TENANT_ID");
    const senderEmail = getVal("msSenderEmail", "MS_SENDER_EMAIL");

    if (!clientId || !clientSecret || !tenantId || !senderEmail) {
      return NextResponse.json({ error: "Microsoft 365 credentials missing." }, { status: 400 });
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const graphClient = Client.initWithMiddleware({
      authProvider: { getAccessToken: async () => (await credential.getToken("https://graph.microsoft.com/.default")).token }
    });

    const messages = await graphClient.api(`/users/${senderEmail}/mailFolders/inbox/messages?$top=10&$filter=isRead eq false`).get();

    let syncedCount = 0;

    for (const msg of messages.value) {
      const senderAddress = msg.from.emailAddress.address;
      const bodyText = cleanEmailBody(msg.body.content);

      const site = await prisma.website.findFirst({ where: { email: senderAddress } });
      if (!site) continue;

      const latestEmail = await prisma.email.findFirst({
        where: { websiteId: site.id },
        orderBy: { sentAt: "desc" }
      });

      if (latestEmail) {
        const existingReply = await prisma.reply.findFirst({ where: { emailId: latestEmail.id, body: bodyText } });
        if (!existingReply) {
          
          let attachmentsJson = null;
          if (msg.hasAttachments) {
            try {
              const attachmentsResponse = await graphClient.api(`/users/${senderEmail}/messages/${msg.id}/attachments`).get();
              const validAttachments = attachmentsResponse.value
                .filter((a: any) => a['@odata.type'] === '#microsoft.graph.fileAttachment' && !a.isInline)
                .map((a: any) => ({ name: a.name, type: a.contentType, data: a.contentBytes }));
              if (validAttachments.length > 0) attachmentsJson = JSON.stringify(validAttachments);
            } catch (e) {}
          }

          await prisma.reply.create({
            data: { emailId: latestEmail.id, body: bodyText, isFromUs: false, attachments: attachmentsJson }
          });
          
          // Extract price from the ENTIRE thread
          await extractPriceFromThread(latestEmail.id, site.id);

          await prisma.website.update({ where: { id: site.id }, data: { status: "REPLIED" } });

          try {
            await graphClient.api(`/users/${senderEmail}/messages/${msg.id}`).patch({ isRead: true });
          } catch (e) {}

          syncedCount++;
        }
      }
    }

    return NextResponse.json({ success: true, count: syncedCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to sync" }, { status: 500 });
  }
}
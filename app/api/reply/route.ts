import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    console.error("Failed to extract price", e);
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const emailId = formData.get("emailId") as string;
    const body = formData.get("body") as string;
    const file = formData.get("file") as File | null;

    if (!emailId || !body) {
      return NextResponse.json({ error: "Missing emailId or body" }, { status: 400 });
    }

    const settings = await prisma.setting.findMany();
    const getVal = (key: string, envKey: string) => settings.find(s => s.key === key)?.value || process.env[envKey] || "";

    const clientId = getVal("msClientId", "MS_CLIENT_ID");
    const clientSecret = getVal("msClientSecret", "MS_CLIENT_SECRET");
    const tenantId = getVal("msTenantId", "MS_TENANT_ID");
    const senderEmail = getVal("msSenderEmail", "MS_SENDER_EMAIL");

    const email = await prisma.email.findUnique({ where: { id: emailId }, include: { website: true } });
    if (!email) return NextResponse.json({ error: "Email not found" }, { status: 404 });

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const graphClient = Client.initWithMiddleware({
      authProvider: { getAccessToken: async () => (await credential.getToken("https://graph.microsoft.com/.default")).token }
    });

    // Save the reply in our DB first
    await prisma.reply.create({
      data: { emailId, body, isFromUs: true }
    });

    // Extract price based on the new thread
    await extractPriceFromThread(emailId, email.websiteId);

    // Send via Graph API
    const message: any = {
      subject: `Re: ${email.subject}`,
      body: { contentType: "HTML", content: `<div style="font-family: sans-serif; font-size: 14px; color: #333;">${body.replace(/\n/g, '<br/>')}</div>` },
      toRecipients: [{ emailAddress: { address: email.website.email } }]
    };

    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      message.attachments = [{
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: file.name,
        contentType: file.type,
        contentBytes: base64
      }];
    }

    await graphClient.api(`/users/${senderEmail}/sendMail`).post({ message, saveToSentItems: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Failed to send reply" }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST() {
  try {
    const settings = await prisma.setting.findMany();
    const getVal = (key: string, envKey: string) => settings.find(s => s.key === key)?.value || process.env[envKey] || "";

    const clientId = getVal("msClientId", "MS_CLIENT_ID");
    const clientSecret = getVal("msClientSecret", "MS_CLIENT_SECRET");
    const tenantId = getVal("msTenantId", "MS_TENANT_ID");
    const senderEmail = getVal("msSenderEmail", "MS_SENDER_EMAIL");
    
    const followUpLimit = parseInt(getVal("followUpLimit", "FOLLOW_UP_LIMIT") || "1");
    const followUpDelayValue = parseInt(getVal("followUpDelayValue", "FOLLOW_UP_DELAY_VALUE") || "3");
    const followUpDelayUnit = getVal("followUpDelayUnit", "FOLLOW_UP_DELAY_UNIT") || "days";
    const followUpPrompt = getVal("followUpPrompt", "FOLLOW_UP_PROMPT") || "Write a short, polite 2-sentence follow-up to a cold email sent a few days ago about a guest post. Do not sound desperate. Keep it under 30 words.";

    if (!clientId || !clientSecret || !tenantId || !senderEmail) {
      return NextResponse.json({ error: "Microsoft 365 credentials missing." }, { status: 400 });
    }

    const cutoffDate = new Date();
    if (followUpDelayUnit === 'minutes') {
      cutoffDate.setMinutes(cutoffDate.getMinutes() - followUpDelayValue);
    } else if (followUpDelayUnit === 'hours') {
      cutoffDate.setHours(cutoffDate.getHours() - followUpDelayValue);
    } else {
      cutoffDate.setDate(cutoffDate.getDate() - followUpDelayValue);
    }

    const emailsToFollowUp = await prisma.email.findMany({
      where: {
        sentAt: { lt: cutoffDate },
        replies: { none: { isFromUs: false } }, 
        followUpCount: { lt: followUpLimit }
      },
      include: { website: true }
    });

    if (emailsToFollowUp.length === 0) {
      return NextResponse.json({ error: "No emails eligible for follow-up right now." }, { status: 400 });
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const graphClient = Client.initWithMiddleware({
      authProvider: { getAccessToken: async () => (await credential.getToken("https://graph.microsoft.com/.default")).token }
    });

    let sentCount = 0;

    for (const email of emailsToFollowUp) {
      const timeDiffMs = Date.now() - new Date(email.sentAt).getTime();
      const diffMinutes = Math.floor(timeDiffMs / 60000);
      let timeString = "";
      
      if (diffMinutes < 60) timeString = `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}`;
      else if (diffMinutes < 1440) timeString = `${Math.floor(diffMinutes / 60)} hours`;
      else timeString = `${Math.floor(diffMinutes / 1440)} days`;

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: `${followUpPrompt}\n\nCRITICAL RULES:\n1. NEVER use placeholders like [Name] or [Your Name].\n2. You MUST explicitly mention the website domain (${email.website.domain}) in the body of the email.\n3. Carefully read the ORIGINAL EMAIL provided below. \n4. Output ONLY the follow-up body text.\n5. Sign off using the EXACT signature from the original email. Do not invent a name.`,
        messages: [{ 
          role: "user", 
          content: `Here is the exact email I sent to ${email.website.domain} (${timeString} ago):\n\n---\n${email.body}\n---\n\nWrite the follow-up body.` 
        }]
      });
      
      const followUpBody = (msg.content[0] as any).text.trim();

      try {
        await graphClient.api(`/users/${senderEmail}/sendMail`).post({
          message: {
            subject: `Re: ${email.subject}`,
            body: { contentType: "HTML", content: `<div style="font-family: sans-serif; font-size: 14px; color: #333;">${followUpBody.replace(/\n/g, '<br/>')}</div>` },
            toRecipients: [{ emailAddress: { address: email.website.email } }]
          },
          saveToSentItems: true
        });

        await prisma.reply.create({
          data: { emailId: email.id, body: followUpBody, isFromUs: true }
        });

        await prisma.notification.create({
          data: { message: `Follow-up sent to ${email.website.domain}`, type: "success" }
        });

        await prisma.email.update({
          where: { id: email.id },
          data: { followUpCount: email.followUpCount + 1 }
        });

        sentCount++;
      } catch (e) {
        console.error(`Failed to send follow-up to ${email.website.email}`, e);
      }
    }

    return NextResponse.json({ success: true, count: sentCount });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Failed to send follow-ups" }, { status: 500 });
  }
}
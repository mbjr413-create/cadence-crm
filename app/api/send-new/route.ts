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
    const defaultTemplateId = getVal("defaultTemplateId", "DEFAULT_TEMPLATE_ID");

    if (!clientId || !clientSecret || !tenantId || !senderEmail || !defaultTemplateId) {
      return NextResponse.json({ error: "Missing settings or default template." }, { status: 400 });
    }

    const template = await prisma.template.findUnique({ where: { id: defaultTemplateId } });
    if (!template) {
      return NextResponse.json({ error: "Default template not found." }, { status: 400 });
    }

    const sites = await prisma.website.findMany({ where: { status: "EMAIL_FOUND" } });
    if (sites.length === 0) {
      return NextResponse.json({ error: "No eligible websites found for outreach." }, { status: 400 });
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const graphClient = Client.initWithMiddleware({
      authProvider: { getAccessToken: async () => (await credential.getToken("https://graph.microsoft.com/.default")).token }
    });

    let sentCount = 0;

    for (const site of sites) {
      // 1. Fill the placeholder BEFORE anything else
      const finalBody = template.body
        .replace(/\[Website URL\]/gi, site.url || `https://${site.domain}`)
        .replace(/\[Website\]/gi, site.domain)
        .replace(/\[Domain\]/gi, site.domain);

      // 2. Generate dynamic subject using the final body (so AI sees the real URL)
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        system: "You are an expert copywriter. Write a catchy, short subject line for a cold email based on the body text provided. Output ONLY the subject line. Do not include quotes.",
        messages: [{ 
          role: "user", 
          content: `Website domain: ${site.domain}\n\nEmail Body:\n${finalBody}` 
        }]
      });
      
      let subject = (msg.content[0] as any).text.trim().replace(/^["']|["']$/g, '');
      if (!subject) subject = template.subject;

      try {
        // 3. Send the email with the final body
        await graphClient.api(`/users/${senderEmail}/sendMail`).post({
          message: {
            subject: subject,
            body: { contentType: "HTML", content: `<div style="font-family: sans-serif; font-size: 14px; color: #333;">${finalBody.replace(/\n/g, '<br/>')}</div>` },
            toRecipients: [{ emailAddress: { address: site.email } }]
          },
          saveToSentItems: true
        });

        // 4. Save the final body to the database so the follow-up AI reads the real URL
        await prisma.email.create({
          data: {
            subject: subject,
            body: finalBody,
            websiteId: site.id,
            sentAt: new Date()
          }
        });

        await prisma.website.update({
          where: { id: site.id },
          data: { status: "SENT" }
        });

        sentCount++;
      } catch (e) {
        console.error(`Failed to send email to ${site.email}`, e);
      }
    }

    return NextResponse.json({ success: true, count: sentCount });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Failed to send emails" }, { status: 500 });
  }
}
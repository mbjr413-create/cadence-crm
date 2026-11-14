import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

export async function POST(req: Request) {
  try {
    const { draftIds } = await req.json();

    if (!draftIds || draftIds.length === 0) {
      return NextResponse.json({ error: "No drafts provided" }, { status: 400 });
    }

    const settings = await prisma.setting.findMany();
    const getVal = (key: string, envKey: string) => settings.find(s => s.key === key)?.value || process.env[envKey] || "";

    const clientId = getVal("msClientId", "MS_CLIENT_ID");
    const clientSecret = getVal("msClientSecret", "MS_CLIENT_SECRET");
    const tenantId = getVal("msTenantId", "MS_TENANT_ID");
    const senderEmail = getVal("msSenderEmail", "MS_SENDER_EMAIL"); // <-- DYNAMIC SENDER

    if (!clientId || !clientSecret || !tenantId || !senderEmail) {
      return NextResponse.json({ success: false, error: "Microsoft 365 credentials or Sender Email missing. Please add them in Settings." }, { status: 400 });
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken("https://graph.microsoft.com/.default");
          return token.token;
        }
      }
    });

    let successCount = 0;
    let lastError = "";

    for (const id of draftIds) {
      const draft = await prisma.email.findUnique({
        where: { id },
        include: { website: true }
      });

      if (!draft || !draft.website.email) continue;

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const pixelUrl = `${baseUrl}/api/track/${draft.pixelId}`;
      const htmlBody = `
        <div style="font-family: sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
          ${draft.body.replace(/\n/g, '<br/>')}
        </div>
        <img src="${pixelUrl}" width="1" height="1" style="display:none;" />
      `;

      const mail = {
        message: {
          subject: draft.subject,
          body: { contentType: "HTML", content: htmlBody },
          toRecipients: [{ emailAddress: { address: draft.website.email } }]
        },
        saveToSentItems: true
      };

      try {
        await graphClient.api(`/users/${senderEmail}/sendMail`).post(mail);
        
        await prisma.email.update({
          where: { id: draft.id },
          data: { sentAt: new Date() }
        });
        await prisma.website.update({
          where: { id: draft.website.id },
          data: { status: "SENT" }
        });
        
        successCount++;
      } catch (err: any) {
        console.error("Microsoft Graph Error:", err.message);
        lastError = err.message;
      }
    }

    if (successCount === 0) {
      return NextResponse.json({ success: false, error: `Graph API Error: ${lastError}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: successCount });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message || "Failed to send emails" }, { status: 500 });
  }
}
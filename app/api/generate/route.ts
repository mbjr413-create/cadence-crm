import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicKey } from "@/lib/settings";

export async function POST(req: Request) {
  try {
    const { websiteIds, prompt, templateId } = await req.json();

    if (!websiteIds || websiteIds.length === 0) {
      return NextResponse.json({ error: "No websites selected" }, { status: 400 });
    }

    const apiKey = await getAnthropicKey();
    const anthropic = new Anthropic({ apiKey });

    // 1. Fetch the template if one was selected
    let template = null;
    if (templateId) {
      template = await prisma.template.findUnique({ where: { id: templateId } });
    }

    const websites = await prisma.website.findMany({
      where: { id: { in: websiteIds } }
    });

    const generatedEmails = [];

    for (const site of websites) {
      if (!site.email) continue;

      let finalSubject = "";
      let finalBody = "";

      if (template) {
        // --- TEMPLATE MODE: AI only writes the subject ---
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 50,
          system: `Write a short, compelling subject line for a guest post pitch. The target website is ${site.domain}. Keep it urgent and professional. Do not include the word 'Subject:' or quotation marks. Reply ONLY with the subject line text.`,
          messages: [{ role: "user", content: `Write the subject line for ${site.domain}` }]
        });
        
        finalSubject = (msg.content[0] as any).text.trim().replace(/^["']|["']$/g, '');
        
        // Use the exact template body, just replacing the placeholder
        finalBody = template.body
          .replace(/\[Website URL\]/gi, site.url)
          .replace(/\[Website Domain\]/gi, site.domain)
          .replace(/\[Website\]/gi, site.domain);

      } else {
        // --- PROMPT MODE: AI writes both subject and body ---
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: `You are an expert B2B outreach assistant. Write a highly personalized cold email to the website ${site.domain}. 
          The user's instructions are: "${prompt}". 
          Keep the email concise, friendly, and conversational. Do not use generic placeholders like [Name]. 
          You must reply STRICTLY with a valid JSON object containing two keys: "subject" and "body". Do not wrap it in markdown.`,
          messages: [{ role: "user", content: `Write the email for ${site.domain}` }]
        });

        try {
          const aiText = (msg.content[0] as any).text;
          const jsonStr = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(jsonStr);
          finalSubject = parsed.subject;
          finalBody = parsed.body;
        } catch (e) {
          finalSubject = "Guest Post Inquiry";
          finalBody = "Hello, I would like to discuss a guest post opportunity.";
        }
      }

      // Save or update the draft
      const existingEmail = await prisma.email.findFirst({
        where: { websiteId: site.id }
      });

      let newEmail;
      if (existingEmail) {
        newEmail = await prisma.email.update({
          where: { id: existingEmail.id },
          data: { subject: finalSubject, body: finalBody, sentAt: new Date() }
        });
      } else {
        newEmail = await prisma.email.create({
          data: { subject: finalSubject, body: finalBody, websiteId: site.id }
        });
      }

      await prisma.website.update({
        where: { id: site.id },
        data: { status: "DRAFTED" }
      });

      generatedEmails.push(newEmail);
    }

    return NextResponse.json({ success: true, count: generatedEmails.length });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to generate emails" }, { status: 500 });
  }
}
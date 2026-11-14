import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // Fetch all websites with their emails and replies (limit to last 5 emails per site to save tokens)
    const websites = await prisma.website.findMany({
      include: {
        emails: {
          include: { replies: { orderBy: { receivedAt: "asc" } } },
          orderBy: { sentAt: "desc" },
          take: 5 
        }
      }
    });

    // Format the database into a readable string for the AI
    const context = websites.map(site => {
      let text = `Website: ${site.domain} | Status: ${site.status} | Contact Email: ${site.email || 'N/A'}\n`;
      if (site.emails.length === 0) text += "  (No emails sent yet)\n";
      
      site.emails.forEach(email => {
        text += `  [Sent Email] Subject: "${email.subject}" | Sent At: ${email.sentAt.toISOString()} | Follow-ups Sent: ${email.followUpCount}\n`;
        text += `  Body: ${email.body}\n`;
        
        email.replies.forEach(reply => {
          text += `  [Reply from ${reply.isFromUs ? 'Us' : 'Them'}] Date: ${reply.receivedAt.toISOString()}\n`;
          text += `  Content: ${reply.body}\n`;
        });
      });
      return text;
    }).join('\n---\n');

    const systemPrompt = `You are the AI Assistant for Cadence, an outreach CRM. You have access to the complete database of websites, sent emails, and received replies below.
    
    Your job is to answer the user's questions accurately based on this context. 
    If they ask about budgets, pricing, or agreements, look through the emails and replies.
    If they ask for a summary of what's happening, summarize the active conversations.
    Never invent information. If something isn't in the context, say "I don't see that in the current CRM data."

    === CRM DATABASE CONTEXT ===
    ${context}
    ============================
    `;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }))
    });

    const reply = (response.content[0] as any).text;
    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate response" }, { status: 500 });
  }
}
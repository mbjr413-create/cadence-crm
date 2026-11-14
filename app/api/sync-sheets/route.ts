import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!scriptUrl) return NextResponse.json({ error: "GOOGLE_SCRIPT_URL is not set" }, { status: 400 });

    const websites = await prisma.website.findMany({
      include: {
        emails: { orderBy: { sentAt: "desc" }, take: 1, include: { replies: { orderBy: { receivedAt: "desc" }, take: 1 } } }
      },
      orderBy: { createdAt: "desc" }
    });

    const sheetData = websites.map(site => {
      const latestEmail = site.emails[0];
      const latestReply = latestEmail?.replies[0];
      const formatDate = (date: Date | null | undefined) => date ? new Date(date).toISOString().split("T")[0] : "";
      const url = site.url || `https://${site.domain}`;
      return [
        `=HYPERLINK("${url}", "${site.domain}")`,
        site.email || "",
        latestEmail ? "Sent" : "Not Sent",
        latestReply ? "Responded" : "No Response",
        latestEmail ? `${latestEmail.followUpCount} Sent` : "Not sent",
        site.price || "",
        formatDate(site.createdAt),
        latestEmail ? formatDate(latestEmail.sentAt) : ""
      ];
    });

    const dataString = JSON.stringify(sheetData);
    const lastHashSetting = await prisma.setting.findUnique({ where: { key: "lastSheetHash" } });

    // If data is IDENTICAL to the last sync, exit silently
    if (lastHashSetting?.value === dataString) {
      return NextResponse.json({ success: true, count: sheetData.length, message: "No changes" });
    }

    // Push to Google Sheets
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: sheetData })
    });

    const result = await response.json();

    if (result.status === "success") {
      // Save the new hash
      await prisma.setting.upsert({
        where: { key: "lastSheetHash" },
        update: { value: dataString },
        create: { key: "lastSheetHash", value: dataString }
      });

      // Create notification
      await prisma.notification.create({ 
        data: { message: "Google Sheet synced with latest data", type: "success" } 
      });

      return NextResponse.json({ success: true, count: sheetData.length });
    } else {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
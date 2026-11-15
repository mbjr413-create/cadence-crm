import { NextResponse } from "next/server";
export const maxDuration = 180;

export const runtime = "nodejs";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const text = await file.text();
    const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
    
    const validRows = (data as any[]).filter(row => {
      const rawUrl = row.url || row.website || row.domain || Object.values(row)[0];
      return rawUrl && typeof rawUrl === 'string';
    });

    if (validRows.length === 0) return NextResponse.json({ error: "No valid URLs found" }, { status: 400 });

    const newIds = [];
    for (const row of validRows) {
      const rawUrl = row.url || row.website || row.domain || Object.values(row)[0];
      let domain = rawUrl.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      let url = `https://${domain}`;

      const existing = await prisma.website.findUnique({ where: { domain } });
      if (existing) continue;

      const newSite = await prisma.website.create({
        data: { domain, url, status: "PROCESSING", progressMessage: "Queued..." }
      });
      newIds.push(newSite.id);
    }

    if (newIds.length === 0) return NextResponse.json({ error: "All domains already exist" }, { status: 400 });
    return NextResponse.json({ success: true, total: newIds.length, ids: newIds });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process" }, { status: 500 });
  }
}

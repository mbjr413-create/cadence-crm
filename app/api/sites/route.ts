import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const sites = await prisma.website.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(sites);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { domain, email } = await req.json();
    if (!domain) return NextResponse.json({ error: "Domain is required" }, { status: 400 });

    // Clean the domain
    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
    const url = `https://${cleanDomain}`;

    const existing = await prisma.website.findUnique({ where: { domain: cleanDomain } });
    if (existing) return NextResponse.json({ error: "This website already exists in your list." }, { status: 400 });

    const newSite = await prisma.website.create({
      data: {
        domain: cleanDomain,
        url,
        email: email || null,
        status: email ? "EMAIL_FOUND" : "NEW",
        progressMessage: "Manually added"
      }
    });

    return NextResponse.json(newSite);
  } catch (error) {
    return NextResponse.json({ error: "Failed to add website" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    await prisma.website.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { id, domain, email, status } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const updated = await prisma.website.update({
      where: { id },
      data: { domain, email, status },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

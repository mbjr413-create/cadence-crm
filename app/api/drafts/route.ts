import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const drafts = await prisma.email.findMany({
      include: { website: true, replies: true }, // <-- Added replies
      orderBy: { sentAt: "desc" }
    });
    return NextResponse.json(drafts);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch drafts" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    await prisma.email.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
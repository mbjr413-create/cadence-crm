import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const threads = await prisma.email.findMany({
      where: { replies: { some: {} } }, // Only fetch emails that have replies
      include: { website: true, replies: { orderBy: { receivedAt: "asc" } } },
      orderBy: { sentAt: "desc" }
    });
    return NextResponse.json(threads);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch inbox" }, { status: 500 });
  }
}
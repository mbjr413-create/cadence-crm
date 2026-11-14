import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { ids, status } = await req.json();
    if (!ids || ids.length === 0) return NextResponse.json({ error: "No IDs provided" }, { status: 400 });

    await prisma.website.updateMany({
      where: { id: { in: ids } },
      data: { status }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update statuses" }, { status: 500 });
  }
}
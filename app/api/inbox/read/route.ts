import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { emailId } = await req.json();
    if (!emailId) {
      return NextResponse.json({ error: "Missing emailId" }, { status: 400 });
    }

    const result = await prisma.reply.updateMany({
      where: { emailId, isFromUs: false, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error("PRISMA ERROR IN MARK-READ:", error);
    return NextResponse.json(
      { error: "Failed to mark as read" },
      { status: 500 }
    );
  }
}
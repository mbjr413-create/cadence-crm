import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { websiteIds } = await req.json();
    if (!websiteIds || websiteIds.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    // Revert processing sites back to NEW so they can be resumed
    await prisma.website.updateMany({
      where: { 
        id: { in: websiteIds },
        status: "PROCESSING" 
      },
      data: { 
        status: "NEW", 
        progressMessage: "Stopped by user" 
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to stop" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await the params in Next.js 15+
    const resolvedParams = await params;
    const pixelId = resolvedParams.id;

    if (pixelId) {
      await prisma.email.update({
        where: { pixelId: pixelId },
        data: { isOpened: true, openedAt: new Date() }
      });
      console.log(`✅ Pixel triggered for email ID: ${pixelId}`);
    }
  } catch (e) {
    // Silently fail if the ID isn't found or already opened
    console.error("Pixel tracking error:", e);
  }

  // Return a 1x1 transparent GIF
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  return new NextResponse(gif, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
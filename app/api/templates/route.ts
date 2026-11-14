import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const templates = await prisma.template.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    if (data.id) {
      // Update existing template
      const updated = await prisma.template.update({
        where: { id: data.id },
        data: { name: data.name, subject: data.subject, body: data.body }
      });
      return NextResponse.json(updated);
    } else {
      // Create new template
      const created = await prisma.template.create({
        data: { name: data.name, subject: data.subject, body: data.body }
      });
      return NextResponse.json(created);
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    
    await prisma.template.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
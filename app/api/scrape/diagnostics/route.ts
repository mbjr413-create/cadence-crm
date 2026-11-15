import {NextResponse} from "next/server";
import {isLoggedIn} from "@/lib/scrape-auth";
import {prisma} from "@/lib/prisma";
export const runtime="nodejs";

export async function GET(req:Request) {
  if (!isLoggedIn(req)) return NextResponse.json({error:"Not authenticated"},{status:401});
  const id=new URL(req.url).searchParams.get("websiteId");
  if (!id || id.length>200) return NextResponse.json({error:"Invalid website ID"},{status:400});
  const site=await prisma.website.findUnique({where:{id},select:{id:true,domain:true,status:true,progressMessage:true}});
  if (!site) return NextResponse.json({error:"Website not found"},{status:404});
  const setting=await prisma.setting.findUnique({where:{key:`scrapeDiagnostic:${id}`}});
  return NextResponse.json({site,diagnostic:setting?JSON.parse(setting.value):null});
}

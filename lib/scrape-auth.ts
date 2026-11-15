import {timingSafeEqual} from "node:crypto";

function same(a:string,b:string):boolean {
  const x=Buffer.from(a);const y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}

export function isCronAuthorized(request:Request):boolean {
  const secret=process.env.CRON_SECRET;
  return Boolean(secret && same(request.headers.get("authorization")||"",`Bearer ${secret}`));
}

export function isLoggedIn(request:Request):boolean {
  const secret=process.env.AUTH_SECRET;
  if (!secret) return false;
  const cookies=request.headers.get("cookie")||"";
  const token=cookies.split(";").map(s=>s.trim()).find(s=>s.startsWith("auth-token="))?.slice("auth-token=".length);
  if (!token) return false;
  try { return same(decodeURIComponent(token),secret); } catch {return false;}
}

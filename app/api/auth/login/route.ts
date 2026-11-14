import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    const correctPassword = process.env.APP_PASSWORD;

    if (password === correctPassword) {
      const response = NextResponse.json({ success: true });
      // Set a secure, HTTP-only cookie
      response.cookies.set({
        name: "auth-token",
        value: process.env.AUTH_SECRET || "secret",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 7, // 1 week
        path: "/",
      });
      return response;
    }

    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
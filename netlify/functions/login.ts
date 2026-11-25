import type { Config } from "@netlify/functions";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users, history } from "../../db/schema.js";

const hashPin = (username: string, pin: string) =>
  createHash("sha256").update(`kantor-tim:${username}:${pin}`).digest("hex");

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { username?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cleanUser = String(body.username || "").trim().toLowerCase().slice(0, 40);
  if (!cleanUser) {
    return Response.json({ error: "Username wajib diisi" }, { status: 400 });
  }
  const pinHash = hashPin(cleanUser, String(body.pin || "1234"));

  const [existing] = await db.select().from(users).where(eq(users.username, cleanUser));

  if (!existing) {
    await db.insert(users).values({ username: cleanUser, pinHash }).onConflictDoNothing();
    await db.insert(history).values({
      username: cleanUser,
      type: "login",
      agent: "orchestrator",
      text: "Akun baru dibuat dan terdaftar.",
    });
  } else if (existing.pinHash !== pinHash) {
    return Response.json({ error: "PIN salah untuk akun ini" }, { status: 401 });
  }

  return Response.json({ success: true, username: cleanUser });
};

export const config: Config = { path: "/api/login" };

import type { Config } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { history } from "../../db/schema.js";

export default async (req: Request) => {
  const user = new URL(req.url).searchParams.get("user")?.trim().toLowerCase();
  if (!user) return Response.json({ history: [] });

  const rows = await db
    .select()
    .from(history)
    .where(eq(history.username, user))
    .orderBy(desc(history.createdAt))
    .limit(50);

  return Response.json({
    history: rows.map((r) => ({
      ts: r.createdAt.getTime(),
      type: r.type,
      agent: r.agent,
      text: r.text,
      username: r.username,
    })),
  });
};

export const config: Config = { path: "/api/history" };

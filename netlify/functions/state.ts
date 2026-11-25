import type { Config } from "@netlify/functions";

// On Netlify there is no local OpenCode service, so the office runs in standby mode.
const state = { connected: false, opencodeUrl: "", activeAgents: {}, sessions: [], recentEvents: [] };

export default async (req: Request) => {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/events") {
    // Send a single state event; ask the browser to retry slowly instead of hammering.
    const body = `retry: 60000\nevent: state\ndata: ${JSON.stringify(state)}\n\n`;
    return new Response(body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
};

export const config: Config = { path: ["/api/state", "/api/events"] };

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = Number(process.env.PORT || 3456);
const HTML_PATH = path.join(__dirname, 'kantor-tim-3d.html');
const SERVICE_JSON = path.join(process.env.USERPROFILE || '', '.config', 'opencode', 'service.json');
const USERS_DB_PATH = path.join(__dirname, 'users-db.json');

const AGENT_MAP = {
  orchestrator: 'orchestrator',
  researcher: 'researcher',
  quick: 'researcher',
  explore: 'researcher',
  designer: 'designer',
  builder: 'builder',
  build: 'builder',
  general: 'builder',
  deep: 'builder',
  reviewer: 'reviewer'
};

let opencodeUrl = process.env.OPENCODE_URL || '';
let authHeader = '';
let state = {
  connected: false,
  opencodeUrl: '',
  activeAgents: {},
  sessions: [],
  recentEvents: []
};
const clients = new Set();

// Simple JSON Users Database for persistence & history
function loadUsersDb() {
  try {
    if (fs.existsSync(USERS_DB_PATH)) {
      return JSON.parse(fs.readFileSync(USERS_DB_PATH, 'utf8'));
    }
  } catch {}
  return { users: {}, history: {} };
}

function saveUsersDb(db) {
  try {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch {}
}

function loadAuth() {
  try {
    const raw = JSON.parse(fs.readFileSync(SERVICE_JSON, 'utf8'));
    if (raw.password) {
      authHeader = 'Basic ' + Buffer.from('opencode:' + raw.password).toString('base64');
    }
  } catch {}
}

function discoverUrl() {
  if (process.env.OPENCODE_URL) {
    opencodeUrl = process.env.OPENCODE_URL.replace(/\/+$/, '');
    return;
  }
  try {
    const out = execSync('opencode.cmd service status', { encoding: 'utf8', timeout: 5000 }).trim();
    const m = out.match(/https?:\/\/[^\s]+/);
    if (m) opencodeUrl = m[0].replace(/\/+$/, '');
  } catch {}
}

function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch { clients.delete(res); }
  }
}

function pushLog(type, text, agentId, username) {
  const ev = {
    ts: Date.now(),
    type,
    agent: agentId || null,
    text: String(text || '').slice(0, 140),
    username: username || 'System'
  };
  state.recentEvents.unshift(ev);
  if (state.recentEvents.length > 25) state.recentEvents.length = 25;

  // Save history to db
  if (username && username !== 'System') {
    const db = loadUsersDb();
    if (!db.history[username]) db.history[username] = [];
    db.history[username].unshift(ev);
    if (db.history[username].length > 50) db.history[username].length = 50;
    saveUsersDb(db);
  }
}

async function apiGet(p) {
  if (!opencodeUrl) return null;
  const res = await fetch(opencodeUrl + p, {
    headers: authHeader ? { Authorization: authHeader } : {}
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function syncActive() {
  try {
    if (!opencodeUrl) discoverUrl();
    if (!authHeader) loadAuth();
    const activeRes = await apiGet('/api/session/active');
    const activeMap = (activeRes && activeRes.data) || {};
    const ids = Object.keys(activeMap);

    const details = await Promise.all(ids.map(async (id) => {
      try {
        const s = await apiGet(`/api/session/${id}`);
        return s && s.data ? s.data : null;
      } catch {
        return null;
      }
    }));

    const nextActive = {};
    const sessions = [];
    for (const d of details) {
      if (!d) continue;
      const rawAgent = d.agent || 'build';
      const mapped = AGENT_MAP[rawAgent] || 'orchestrator';
      const info = {
        sessionID: d.id,
        rawAgent,
        mappedAgent: mapped,
        title: d.title || d.id,
        model: d.model ? `${d.model.providerID}/${d.model.id}` : '',
        status: activeMap[d.id]?.type || 'running'
      };
      sessions.push(info);
      nextActive[mapped] = {
        rawAgent,
        title: info.title,
        model: info.model,
        status: info.status,
        updatedAt: Date.now()
      };
    }

    state.connected = true;
    state.opencodeUrl = opencodeUrl;
    state.activeAgents = nextActive;
    state.sessions = sessions;
    broadcast('state', state);
  } catch {
    state.connected = false;
    discoverUrl();
    broadcast('state', state);
  }
}

async function connectSSE() {
  while (true) {
    try {
      if (!opencodeUrl) discoverUrl();
      if (!authHeader) loadAuth();
      if (!opencodeUrl) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      const res = await fetch(opencodeUrl + '/api/event', {
        headers: authHeader ? { Authorization: authHeader, Accept: 'text/event-stream' } : { Accept: 'text/event-stream' }
      });
      if (!res.ok || !res.body) throw new Error('SSE failed');
      state.connected = true;
      pushLog('system', `Terhubung ke ${opencodeUrl}`, null, 'System');
      broadcast('state', state);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split(/\r?\n\r?\n/);
        buf = parts.pop() || '';
        for (const chunk of parts) {
          const dataLines = chunk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
          if (!dataLines.length) continue;
          try {
            const ev = JSON.parse(dataLines.join('\n'));
            const evType = ev.type || ev.event || 'event';
            const props = ev.properties || ev.data || ev;
            const rawAgent = props.agent || props.info?.agent || '';
            const mapped = AGENT_MAP[rawAgent] || null;
            if (/session|message|part|tool|subagent|permission/i.test(evType)) {
              const tool = props.part?.tool || props.tool || '';
              const label = tool ? `${evType} (${tool})` : evType;
              pushLog(evType, label, mapped, 'System');
              broadcast('activity', { type: evType, agent: mapped, rawAgent, tool, ts: Date.now() });
              if (/session\.status|session\.created|session\.updated|session\.idle/i.test(evType)) {
                syncActive();
              }
            }
          } catch {}
        }
      }
    } catch {
      state.connected = false;
      broadcast('state', state);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(HTML_PATH).pipe(res);
    return;
  }

  if (pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(state));
    return;
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { username, pin } = JSON.parse(body);
        if (!username || !username.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Username wajib diisi' }));
          return;
        }
        const cleanUser = username.trim().toLowerCase();
        const db = loadUsersDb();
        
        if (!db.users[cleanUser]) {
          db.users[cleanUser] = { pin: pin || '1234', createdAt: Date.now() };
          db.history[cleanUser] = [{ ts: Date.now(), type: 'login', text: 'Akun baru dibuat dan terdaftar.', agent: 'orchestrator', username: cleanUser }];
          saveUsersDb(db);
        } else if (db.users[cleanUser].pin !== (pin || '1234')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'PIN salah untuk akun ini' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          username: cleanUser,
          history: db.history[cleanUser] || []
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (pathname === '/api/history') {
    const user = urlObj.searchParams.get('user');
    const db = loadUsersDb();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ history: (user && db.history[user.toLowerCase()]) || [] }));
    return;
  }

  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kantor Modern 3D Auth Server running at http://localhost:${PORT}`);
  loadAuth();
  discoverUrl();
  syncActive();
  setInterval(syncActive, 2500);
  connectSSE();
});

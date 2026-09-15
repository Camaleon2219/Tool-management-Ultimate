import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TOOLS_FILE = path.join(DATA_DIR, 'tools.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const JSONBIN_CONFIG_FILE = path.join(DATA_DIR, 'jsonbin.json');

// Ensure data & uploads folders exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// JSONBin helpers
function extractBinId(input) {
  if (!input) return '';
  const str = String(input).trim();
  const m = str.match(/([a-f0-9]{24})/i);
  if (m) return m[1].toLowerCase();
  return str.replace(/[^a-zA-Z0-9_-]/g, '');
}

function parseJsonBinErrorMessage(status, rawText) {
  if (!rawText) {
    if (status === 401) return 'Ungültiger Master-Key (401 Unauthorized). Bitte prüfen Sie Ihren JSONBin X-Master-Key.';
    if (status === 403) return 'Zugriff verweigert (403 Forbidden). Master-Key besitzt nicht die erforderlichen Rechte.';
    if (status === 404) return 'Bin nicht gefunden (404 Not Found). Bitte prüfen Sie die Bin-ID.';
    return `JSONBin HTTP-Fehler ${status}`;
  }
  try {
    const parsed = JSON.parse(rawText);
    if (parsed.message) return parsed.message;
    if (parsed.error) return typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
  } catch (e) {
    // rawText is not JSON (e.g. plain text or HTML error page)
  }
  const clean = rawText.replace(/<[^>]*>?/gm, '').trim();
  if (status === 401) return 'Ungültiger Master-Key (401): ' + (clean.slice(0, 100) || 'Zugriff abgelehnt');
  if (status === 404) return 'Bin-ID nicht gefunden (404): ' + (clean.slice(0, 100) || 'Nicht existent');
  return clean.slice(0, 120) || `JSONBin HTTP-Fehler ${status}`;
}

function readJsonBinConfig() {
  try {
    if (fs.existsSync(JSONBIN_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(JSONBIN_CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading jsonbin config:', e);
  }
  return { enabled: false, binId: '', apiKey: '', lastSync: null };
}

function writeJsonBinConfig(cfg) {
  try {
    fs.writeFileSync(JSONBIN_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing jsonbin config:', e);
  }
}

async function pushToJsonBin() {
  const cfg = readJsonBinConfig();
  const cleanId = extractBinId(cfg.binId);
  if (!cfg.enabled || !cleanId) return { skipped: true };
  try {
    const payload = {
      tools: readTools(),
      history: readHistory(),
      updatedAt: new Date().toISOString()
    };
    const headers = {
      'Content-Type': 'application/json'
    };
    if (cfg.apiKey && cfg.apiKey.trim()) {
      headers['X-Master-Key'] = cfg.apiKey.trim();
    }
    const res = await fetch(`https://api.jsonbin.io/v3/b/${cleanId}`, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      cfg.lastSync = new Date().toISOString();
      writeJsonBinConfig(cfg);
      return { success: true, lastSync: cfg.lastSync };
    }
    const errText = await res.text();
    const errMsg = parseJsonBinErrorMessage(res.status, errText);
    console.error('JSONBin push error:', res.status, errMsg);
    return { success: false, error: errMsg, status: res.status };
  } catch (err) {
    console.error('JSONBin push exception:', err);
    return { success: false, error: err.message };
  }
}

async function pullFromJsonBin() {
  const cfg = readJsonBinConfig();
  const cleanId = extractBinId(cfg.binId);
  if (!cfg.enabled || !cleanId) return { skipped: true };
  try {
    const headers = {};
    if (cfg.apiKey && cfg.apiKey.trim()) {
      headers['X-Master-Key'] = cfg.apiKey.trim();
    }
    const res = await fetch(`https://api.jsonbin.io/v3/b/${cleanId}/latest`, {
      method: 'GET',
      headers: headers
    });
    if (res.ok) {
      const data = await res.json();
      const record = data.record || {};
      if (Array.isArray(record.tools) && record.tools.length > 0) {
        writeTools(record.tools);
      }
      if (Array.isArray(record.history)) {
        writeHistory(record.history);
      }
      cfg.lastSync = new Date().toISOString();
      writeJsonBinConfig(cfg);
      return { success: true, count: (record.tools || []).length, lastSync: cfg.lastSync };
    }
    const errText = await res.text();
    const errMsg = parseJsonBinErrorMessage(res.status, errText);
    return { success: false, error: errMsg, status: res.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Check and pull from JSONBin on startup if configured
setTimeout(() => {
  pullFromJsonBin().then(r => {
    if (r && r.success) console.log(`Startup: Synced ${r.count} tools from JSONBin.io`);
  }).catch(() => {});
}, 1000);

app.use('/uploads', express.static(UPLOADS_DIR));

// Initial demo tools
const initialTools = [
  {
    id: '1',
    name: 'VHM-Bohrer Ø6,0 mm lang88',
    category: 'VHM-Bohrer',
    status: 'verfügbar',
    quantity: '3',
    icon: '🔩',
    image: '',
    imageUrl: '',
    link: '',
    diameter: '6.00',
    shank: '6.0',
    length: '57.0',
    flutes: '2',
    coating: 'TiAlN',
    material: 'VHM',
    manufacturer: 'Guhring',
    sku: '5511-6.000',
    magazine: 'T12',
    holder: 'HSK-A63',
    zLength: '142.50',
    coolant: 'Innenkühlung',
    machine: '',
    location: 'Schublade A1',
    notes: 'vc=120 m/min, fz=0.08 mm, für Stahl 1.4301',
    updatedAt: new Date().toISOString(),
    updatedBy: 'System',
    lastChangeSummary: 'Initialer Werkzeugbestand'
  }
];

function readTools() {
  try {
    if (fs.existsSync(TOOLS_FILE)) {
      const content = fs.readFileSync(TOOLS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Error reading tools:', e);
  }
  return initialTools;
}

function writeTools(tools) {
  try {
    fs.writeFileSync(TOOLS_FILE, JSON.stringify(tools, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing tools:', e);
  }
}

function readHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const content = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Error reading history:', e);
  }
  return [];
}

function writeHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing history:', e);
  }
}

// APIs
app.get('/api/tools', (req, res) => {
  res.json({ tools: readTools() });
});

app.post('/api/tools', (req, res) => {
  const tools = req.body.tools;
  if (Array.isArray(tools)) {
    writeTools(tools);
    // Background auto-backup to JSONBin if configured
    pushToJsonBin().catch(() => {});
    return res.json({ success: true, count: tools.length });
  }
  res.status(400).json({ error: 'tools must be an array' });
});

app.get('/api/history', (req, res) => {
  res.json({ history: readHistory() });
});

app.post('/api/history', (req, res) => {
  const entry = req.body;
  if (!entry || !entry.action) {
    return res.status(400).json({ error: 'invalid history entry' });
  }
  const history = readHistory();
  const newEntry = {
    id: entry.id || (Date.now().toString(36) + Math.random().toString(36).substr(2)),
    timestamp: entry.timestamp || new Date().toISOString(),
    userName: entry.userName || 'Unbekannt',
    action: entry.action,
    toolId: entry.toolId || '',
    toolName: entry.toolName || '',
    details: entry.details || '',
    changes: entry.changes || []
  };
  history.unshift(newEntry);
  if (history.length > 500) history.length = 500;
  writeHistory(history);
  // Background auto-backup to JSONBin if configured
  pushToJsonBin().catch(() => {});
  res.json({ success: true, entry: newEntry });
});

app.delete('/api/history', (req, res) => {
  writeHistory([]);
  pushToJsonBin().catch(() => {});
  res.json({ success: true });
});

// JSONBin Management APIs
app.get('/api/jsonbin', (req, res) => {
  const cfg = readJsonBinConfig();
  res.json({
    enabled: !!cfg.enabled,
    binId: cfg.binId || '',
    hasKey: !!cfg.apiKey,
    isPrivate: cfg.isPrivate !== undefined ? cfg.isPrivate : false,
    lastSync: cfg.lastSync || null
  });
});

app.post('/api/jsonbin/config', async (req, res) => {
  try {
    const { binId, apiKey, enabled = true } = req.body;
    const cleanBinId = extractBinId(binId);
    if (!cleanBinId) {
      return res.status(400).json({ error: 'Bitte geben Sie eine gültige 24-stellige Bin-ID oder URL ein.' });
    }
    const existingCfg = readJsonBinConfig();
    const effectiveApiKey = (apiKey && apiKey.trim()) || (existingCfg.binId === cleanBinId ? (existingCfg.apiKey || '') : '');
    const headers = {};
    if (effectiveApiKey) {
      headers['X-Master-Key'] = effectiveApiKey;
    }
    // Test access to JSONBin
    const testRes = await fetch(`https://api.jsonbin.io/v3/b/${cleanBinId}/latest`, {
      headers: headers
    });
    if (!testRes.ok) {
      const errTxt = await testRes.text();
      const message = parseJsonBinErrorMessage(testRes.status, errTxt);
      return res.status(400).json({
        error: `JSONBin Fehler (${testRes.status}): ${message}`,
        details: message
      });
    }
    const data = await testRes.json();
    const isPrivate = Boolean(data.metadata && data.metadata.private);
    const cfg = {
      enabled: Boolean(enabled),
      binId: cleanBinId,
      apiKey: effectiveApiKey,
      isPrivate: isPrivate,
      lastSync: new Date().toISOString()
    };
    writeJsonBinConfig(cfg);

    // If the remote bin has tools, merge or load them; if remote is empty, push local tools
    const record = data.record || {};
    let count = 0;
    if (Array.isArray(record.tools) && record.tools.length > 0) {
      writeTools(record.tools);
      if (Array.isArray(record.history)) writeHistory(record.history);
      count = record.tools.length;
    } else {
      await pushToJsonBin();
      count = readTools().length;
    }

    res.json({ success: true, binId: cleanBinId, isPrivate, count, lastSync: cfg.lastSync });
  } catch (err) {
    res.status(500).json({ error: 'Verbindungsfehler zu JSONBin: ' + err.message });
  }
});

app.post('/api/jsonbin/create-bin', async (req, res) => {
  try {
    const { apiKey, binName } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: 'Master-Key ist erforderlich.' });
    }
    const payload = {
      tools: readTools(),
      history: readHistory(),
      createdFrom: 'FJK CNC Werkzeugverwaltung',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const createRes = await fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey.trim(),
        'X-Bin-Name': binName || 'FJK_CNC_Werkzeuge',
        'X-Bin-Private': 'false'
      },
      body: JSON.stringify(payload)
    });
    if (!createRes.ok) {
      const errTxt = await createRes.text();
      const message = parseJsonBinErrorMessage(createRes.status, errTxt);
      return res.status(400).json({
        error: `Fehler beim Erstellen des Bins (${createRes.status}): ${message}`,
        details: message
      });
    }
    const createData = await createRes.json();
    const binId = createData.metadata && createData.metadata.id;
    if (!binId) {
      return res.status(500).json({ error: 'Keine Bin-ID vom Server zurückgegeben.' });
    }
    const cfg = {
      enabled: true,
      binId: binId,
      apiKey: apiKey.trim(),
      isPrivate: false,
      lastSync: new Date().toISOString()
    };
    writeJsonBinConfig(cfg);
    res.json({ success: true, binId: binId, count: payload.tools.length, lastSync: cfg.lastSync, isPublic: true });
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Erstellen des Bins: ' + err.message });
  }
});

app.post('/api/jsonbin/set-public', async (req, res) => {
  try {
    const cfg = readJsonBinConfig();
    const binId = extractBinId(req.body.binId || cfg.binId);
    const apiKey = (req.body.apiKey && req.body.apiKey.trim()) || cfg.apiKey;
    if (!binId || !apiKey) {
      return res.status(400).json({ error: 'Gültige Bin-ID und Master-Key sind erforderlich.' });
    }
    const updateRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}/meta/privacy`, {
      method: 'PUT',
      headers: {
        'X-Master-Key': apiKey.trim(),
        'X-Bin-Private': 'false'
      }
    });
    if (!updateRes.ok) {
      const errTxt = await updateRes.text();
      const message = parseJsonBinErrorMessage(updateRes.status, errTxt);
      return res.status(400).json({ error: `Konnte Bin nicht auf öffentlich umstellen: ${message}` });
    }
    cfg.isPrivate = false;
    writeJsonBinConfig(cfg);
    res.json({ success: true, isPrivate: false, message: 'Cloud-Bin wurde erfolgreich auf öffentlich (Public) gesetzt!' });
  } catch (err) {
    res.status(500).json({ error: 'Fehler: ' + err.message });
  }
});

app.post('/api/jsonbin/sync', async (req, res) => {
  const { direction = 'pull' } = req.body;
  if (direction === 'push') {
    const result = await pushToJsonBin();
    return res.json(result);
  } else {
    const result = await pullFromJsonBin();
    return res.json(result);
  }
});

// Image Upload API (saves images directly as files on server disk)
app.post('/api/upload', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'Keine Bilddaten übermittelt' });
    const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Ungültiges Base64-Bildformat' });
    }
    let ext = matches[1].split('/')[1] || 'png';
    if (ext === 'jpeg') ext = 'jpg';
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'png';
    const filename = 'werkzeug_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + safeExt;
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
    const url = '/uploads/' + filename;
    res.json({ success: true, url });
  } catch (err) {
    console.error('Fehler beim Bildspeichern:', err);
    res.status(500).json({ error: 'Fehler beim Speichern des Bildes auf dem Server' });
  }
});

// Windows Starter Batch Download (launches app in native Windows App window)
app.get('/api/download-windows-starter', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const appUrl = `${protocol}://${host}`;

  const batContent = `@echo off
chcp 65001 >nul
title FJK CNC-Werkzeugverwaltung
echo =================================================================
echo   FJK CNC-Werkzeugverwaltung wird gestartet...
echo =================================================================

:: Startet die Web-App in einem sauberen, eigenstaendigen Windows-App-Fenster
start "" msedge --app="${appUrl}"
if %errorlevel% equ 0 exit

:: Falls Edge nicht da ist, Google Chrome versuchen
start "" chrome --app="${appUrl}"
if %errorlevel% equ 0 exit

:: Standardbrowser als Fallback
start "" "${appUrl}"
exit
`;

  res.setHeader('Content-Type', 'application/x-bat');
  res.setHeader('Content-Disposition', 'attachment; filename="FJK_CNC_Starten.bat"');
  res.send(batContent);
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

import express from 'express';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure nginx configuration allows direct /api/ access to prevent 302/405 auth redirects
try {
  const nginxConfPath = '/etc/nginx/nginx.conf';
  if (fs.existsSync(nginxConfPath)) {
    let conf = fs.readFileSync(nginxConfPath, 'utf8');
    if (!conf.includes('location /api/ {')) {
      const marker = '# Serve the app for all other paths.';
      if (conf.includes(marker)) {
        const patch = `        # API routes: direct pass to Node.js backend
        location /api/ {
            proxy_pass http://localhost:3000;
            proxy_set_header Host localhost:3000;
            proxy_set_header X-Forwarded-Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_http_version 1.1;
        }

        # Serve the app for all other paths.`;
        conf = conf.replace(marker, patch);
        fs.writeFileSync(nginxConfPath, conf, 'utf8');
        try {
          execSync('nginx -t && nginx -s reload', { stdio: 'ignore' });
          console.log('[Nginx] Successfully configured /api/ direct proxy pass.');
        } catch (e) {
          // ignore
        }
      }
    }
  }
} catch (err) {
  // Graceful fallback
}

const app = express();
const PORT = 3000;

// CORS Support & Preflight Handling for Desktop Apps, PWA, and cross-origin access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Master-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
      let toolsArray = [];
      if (Array.isArray(record.tools)) toolsArray = record.tools;
      else if (Array.isArray(record)) toolsArray = record;

      if (toolsArray.length > 0) {
        writeTools(toolsArray);
      }
      if (Array.isArray(record.history)) {
        writeHistory(record.history);
      }
      cfg.lastSync = new Date().toISOString();
      writeJsonBinConfig(cfg);
      return { success: true, count: toolsArray.length, lastSync: cfg.lastSync };
    }
    const errText = await res.text();
    const errMsg = parseJsonBinErrorMessage(res.status, errText);
    return { success: false, error: errMsg, status: res.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

let lastCloudSyncTime = 0;
let isCloudSyncing = false;

async function checkAndSyncWithCloud(force = false) {
  const cfg = readJsonBinConfig();
  const cleanId = extractBinId(cfg.binId);
  if (!cfg.enabled || !cleanId) return null;
  const now = Date.now();
  if (!force && (now - lastCloudSyncTime < 3000)) {
    return null;
  }
  if (isCloudSyncing) return null;
  isCloudSyncing = true;
  try {
    const result = await pullFromJsonBin();
    lastCloudSyncTime = Date.now();
    return result;
  } finally {
    isCloudSyncing = false;
  }
}

// Check and pull from JSONBin on startup if configured
setTimeout(() => {
  checkAndSyncWithCloud(true).then(r => {
    if (r && r.success) console.log(`Startup: Synced ${r.count} tools from JSONBin.io`);
  }).catch(() => {});
}, 500);

// Periodic background pull from JSONBin so changes from other devices propagate automatically
setInterval(() => {
  checkAndSyncWithCloud(false).catch(() => {});
}, 5000);

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
app.get('/api/tools', async (req, res) => {
  const now = Date.now();
  if (req.query.fresh === '1' || now - lastCloudSyncTime > 3000) {
    await checkAndSyncWithCloud(true).catch(() => {});
  }
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

app.post('/api/jsonbin/test', async (req, res) => {
  try {
    const { binId, apiKey } = req.body;
    const cleanBinId = extractBinId(binId);
    if (!cleanBinId) {
      return res.status(400).json({ success: false, error: 'Bitte geben Sie eine gültige 24-stellige Bin-ID ein.' });
    }
    const headers = {};
    const existingCfg = readJsonBinConfig();
    const effectiveApiKey = (apiKey && apiKey.trim()) || (existingCfg.binId === cleanBinId ? (existingCfg.apiKey || '') : '');
    if (effectiveApiKey) {
      headers['X-Master-Key'] = effectiveApiKey;
    }
    const testRes = await fetch(`https://api.jsonbin.io/v3/b/${cleanBinId}/latest`, {
      headers: headers
    });
    if (!testRes.ok) {
      const errTxt = await testRes.text();
      const message = parseJsonBinErrorMessage(testRes.status, errTxt);
      return res.status(testRes.status).json({
        success: false,
        error: message,
        status: testRes.status
      });
    }
    const data = await testRes.json();
    const isPrivate = Boolean(data.metadata && data.metadata.private);
    const rec = data.record || {};
    const count = Array.isArray(rec.tools) ? rec.tools.length : (Array.isArray(rec) ? rec.length : 0);
    return res.json({
      success: true,
      binId: cleanBinId,
      isPrivate: isPrivate,
      count: count,
      name: (data.metadata && data.metadata.name) || 'FJK_CNC_Werkzeuge'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Serververbindung zu JSONBin fehlgeschlagen: ' + err.message });
  }
});

app.post('/api/jsonbin/config', async (req, res) => {
  try {
    const { binId, apiKey, enabled = true } = req.body;
    if (!enabled || enabled === 'false') {
      const cfg = {
        enabled: false,
        binId: '',
        apiKey: '',
        isPrivate: false,
        lastSync: null
      };
      writeJsonBinConfig(cfg);
      return res.json({ success: true, enabled: false, message: 'JSONBin-Verbindung getrennt' });
    }

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
    let remoteTools = [];
    if (Array.isArray(record.tools)) remoteTools = record.tools;
    else if (Array.isArray(record)) remoteTools = record;

    let count = 0;
    if (remoteTools.length > 0) {
      writeTools(remoteTools);
      if (Array.isArray(record.history)) writeHistory(record.history);
      count = remoteTools.length;
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

// ==========================================
// GEMINI AI INTEGRATION (ZEICHNUNGSANALYSE & RÜSTHELFER)
// ==========================================
let geminiClient = null;
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY ist auf dem Server nicht hinterlegt. Bitte hinterlege den API-Schlüssel in den Settings.');
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return geminiClient;
}

app.get('/api/ai/status', (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.json({
    available: hasKey,
    model: 'gemini-3.8-flash'
  });
});

app.post('/api/ai/analyze-drawing', async (req, res) => {
  try {
    const { image, notes, tools: clientTools } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Kein Zeichnungsbild übermittelt.' });
    }

    const ai = getGeminiClient();

    // Extrahiere Base64 Daten und MimeType
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Ungültiges Base64-Bild- oder PDF-Format.' });
    }
    const mimeType = matches[1];
    const base64Data = matches[2];

    const toolsList = Array.isArray(clientTools) && clientTools.length > 0 ? clientTools : readTools();

    const formattedTools = toolsList.map(t => {
      const parts = [
        `[ID: ${t.id}] "${t.name}"`,
        `Kategorie: ${t.category || '-'}`,
        `Ø: ${t.diameter ? t.diameter + ' mm' : '-'}`,
        `Schaft: ${t.shank ? t.shank + ' mm' : '-'}`,
        `Nutzlänge: ${t.length ? t.length + ' mm' : '-'}`,
        `Zähne: ${t.flutes || '-'}`,
        `Beschichtung: ${t.coating || '-'}`,
        `Material: ${t.material || '-'}`,
        `Magazin/Platz: ${t.magazine || '-'}`,
        `Lagerort: ${t.location || '-'}`,
        `Status: ${t.status || 'verfügbar'}`,
        `Bestand: ${t.quantity || 1}`,
        `Notizen: ${t.notes || '-'}`
      ];
      return parts.join(' | ');
    }).join('\n');

    const promptText = `Du bist ein erfahrener Zerspanungsmechaniker und CNC-Fertigungsspezialist (Fräsen & Drehen).
Analysiere die beigefügte technische Zeichnung / Konstruktionsskizze detailgenau und erstelle eine praxisnahe Werkzeug-Rüstliste basierend auf unserem realen Werkzeugbestand.

AKTUELLER WERKZEUGBESTAND IM LAGER:
${formattedTools.length > 0 ? formattedTools : '(Keine Werkzeuge im Lager hinterlegt)'}

${notes ? `ZUSÄTZLICHE HINWEISE / MASCHINENANGABEN VOM BEDIENER:\n"${notes}"\n` : ''}

AUFGABEN:
1. Zeichnungsdaten erfassen:
   - Bauteilname / Benennung (falls erkennbar)
   - Zeichnungsnummer / Sachnummer
   - Werkstoff / Material (z. B. 1.4301 Edelstahl, AlMgSi1 Aluminium, C45, POM, etc.)
   - Rohteilmaße / Hauptabmessungen (L x B x H bzw. Ø x L)
   - Kurze verständliche Zusammenfassung des Teils

2. Bearbeitungsmerkmale (Features) ermitteln:
   - Alle Bohrungen (z.B. Ø5.0, Ø6.8, Durchgang/Sackloch, Flachsenkung 90°)
   - Gewinde (z.B. M6, M8, Feingewinde)
   - Nuten, Taschen, Konturen mit Innenradien R (z.B. R3 Innenradius erfordert Fräser maximal Ø6)
   - Planflächen, Fasen (z.B. 45° Kantenbrechen)
   - Passungen & Toleranzen (z.B. H7, g6)

3. Werkzeugabgleich & Rüstliste (Tool Matching):
   - Wähle für JEDES Merkmal das am besten passende Werkzeug aus unserem oben gelisteten Werkzeugbestand aus!
   - Gib exakt die "matchedToolId" und "matchedToolName" aus dem Bestand an.
   - Gib an, wo das Werkzeug liegt (location und magazine).
   - Kennzeichne, ob es sofort verfügbar ist.
   - WICHTIG: Falls ein Werkzeug (z.B. Reibahle, spezieller Kernlochbohrer oder Gewindebohrer) NICHT im Bestand existiert:
     * Setze "isAvailable": false, "matchedToolId": null, "matchedToolName": null
     * Gib bei "recommendedAlternative" die genaue Werkzeugempfehlung an (z.B. "VHM-Bohrer Ø6.8 mm für M8").

4. Fehlende Werkzeuge:
   - Fasse alle Werkzeuge zusammen, die für dieses Teil im Betrieb fehlen, mit Dringlichkeit.

5. Fertigungsfolge (Arbeitsplan Schritt 1 bis N):
   - Logische Reihenfolge (z.B. 1. Planfräsen -> 2. Kontur schruppen -> 3. NC-Anbohren -> 4. Bohren -> 5. Gewinde -> 6. Schlichten -> 7. Fasen).

6. Praxistipps & Schnittwerte:
   - Empfohlenes Kühlmittel
   - Schnittgeschwindigkeiten (vc) und Drehzahlen / Vorschübe für den ermittelten Werkstoff
   - Spannhinweise & Gratvermeidung

Antworte AUSSCHLIESSLICH mit gültigem JSON nach folgendem Format:
{
  "partInfo": {
    "name": "string",
    "drawingNumber": "string",
    "material": "string",
    "dimensions": "string",
    "summary": "string"
  },
  "features": [
    {
      "type": "Bohrung | Gewinde | Tasche | Kontur | Planfläche | Fase | Passung",
      "description": "string",
      "dimensions": "string"
    }
  ],
  "toolMatches": [
    {
      "operation": "string",
      "matchedToolId": "string oder null",
      "matchedToolName": "string oder null",
      "isAvailable": true,
      "location": "string",
      "status": "string",
      "recommendedAlternative": "string",
      "notes": "string"
    }
  ],
  "missingTools": [
    {
      "neededFor": "string",
      "toolRecommendation": "string",
      "urgency": "hoch | mittel | niedrig"
    }
  ],
  "machiningSteps": [
    {
      "stepNumber": 1,
      "operation": "string",
      "tool": "string",
      "parameters": "string",
      "comment": "string"
    }
  ],
  "cuttingTips": {
    "coolant": "string",
    "clamping": "string",
    "generalAdvice": "string"
  }
}`;

    // Modell-Kaskade bei hoher Serverlast / Spikes (geprüfte stabile Modelle)
    const candidateModels = [
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.1-flash-lite'
    ];

    let response = null;
    let lastApiError = null;

    for (const modelName of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`Starte Zeichnungsanalyse mit ${modelName} (Versuch ${attempt})...`);
          response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                },
                {
                  text: promptText
                }
              ]
            },
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2
            }
          });

          if (response && response.text) {
            console.log(`Erfolgreich geantwortet von Modell: ${modelName}`);
            break;
          }
        } catch (apiErr) {
          lastApiError = apiErr;
          const errStr = (apiErr.message || '') + ' ' + JSON.stringify(apiErr);
          const isHighDemand = errStr.includes('503') ||
                               errStr.includes('UNAVAILABLE') ||
                               errStr.includes('high demand') ||
                               errStr.includes('429') ||
                               errStr.includes('RESOURCE_EXHAUSTED');

          console.warn(`Modell ${modelName} Versuch ${attempt} nicht verfügbar:`, apiErr.message || apiErr);

          if (isHighDemand && attempt === 1) {
            // 750ms Wartezeit vor Retry
            await new Promise(r => setTimeout(r, 750));
            continue;
          }
          // Wechsel zum nächsten Modell in der Kaskade
          break;
        }
      }
      if (response && response.text) {
        break;
      }
    }

    if (!response || !response.text) {
      throw lastApiError || new Error('Die KI-Modelle sind im Moment vorübergehend ausgelastet.');
    }

    let resultText = (response.text || '').trim();
    if (resultText.startsWith('```json')) {
      resultText = resultText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(resultText);
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON output:', parseErr, resultText);
      return res.status(500).json({
        error: 'Die KI hat kein valides JSON-Ergebnis geliefert. Bitte erneut versuchen.',
        raw: resultText
      });
    }

    res.json({
      success: true,
      analysis: parsedResult
    });

  } catch (err) {
    console.error('Fehler bei der KI-Zeichnungsanalyse:', err);
    let userMsg = err.message || 'Fehler bei der KI-Verarbeitung';

    // Falls die Fehlermeldung ein rohes JSON-Objekt ist, extrahiere die eigentliche Nachricht
    try {
      if (typeof userMsg === 'string' && userMsg.trim().startsWith('{')) {
        const parsed = JSON.parse(userMsg.trim());
        if (parsed.error && parsed.error.message) {
          userMsg = parsed.error.message;
        }
      }
    } catch (e) {}

    if (userMsg.includes('high demand') || userMsg.includes('UNAVAILABLE') || userMsg.includes('503')) {
      userMsg = 'Die Google Gemini-Server erleben gerade eine kurze Lastspitze (High Demand). Bitte warte wenige Sekunden und klicke erneut auf „Zeichnung analysieren“.';
    } else if (userMsg.includes('API key') || userMsg.includes('GEMINI_API_KEY')) {
      userMsg = 'Der Gemini API-Key ist nicht konfiguriert. Bitte hinterlege den GEMINI_API_KEY in den App-Einstellungen (Settings > Secrets).';
    } else if (userMsg.includes('429') || userMsg.includes('RESOURCE_EXHAUSTED')) {
      userMsg = 'Das Abfrage-Limit wurde kurzzeitig erreicht. Bitte kurz warten und erneut versuchen.';
    }

    res.status(500).json({ error: userMsg });
  }
});

app.get('/api/ai/analyze-drawing', (req, res) => {
  res.json({
    status: 'ok',
    message: 'KI-Zeichnungsanalyse API ist betriebsbereit. Senden Sie eine POST-Anfrage mit Bilddaten zur Analyse.',
    endpoint: '/api/ai/analyze-drawing',
    method: 'POST'
  });
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Global JSON error handler
app.use((err, req, res, next) => {
  console.error('Express Error Handler caught:', err);
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      error: 'Die Datei ist zu groß für die Übertragung. Das Bild wird automatisch vor dem Senden optimiert.'
    });
  }
  res.status(err.status || 500).json({
    error: err.message || 'Interner Serverfehler bei der Verarbeitung'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

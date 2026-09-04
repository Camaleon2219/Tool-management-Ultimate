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

// Ensure data & uploads folders exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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
  res.json({ success: true, entry: newEntry });
});

app.delete('/api/history', (req, res) => {
  writeHistory([]);
  res.json({ success: true });
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

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

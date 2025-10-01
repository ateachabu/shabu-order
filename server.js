// server.js - Final version with CORS, socket.io path, QR fix, and admin serving
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';

// MongoDB imports
import database from './config/database.js';
import { Category, MenuItem, Order } from './models/schemas.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Allow origin ทั้ง localhost และ production
const allowedOrigins = [
  "http://localhost:4000",
  "https://www.chabuhida.com"
];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO
const io = new SocketIOServer(server, {
  path: "/socket",
  cors: { origin: allowedOrigins, credentials: true }
});
app.set("trust proxy", 1);

// Upload storage
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = (file.originalname || '').split('.').pop();
    const safe = Date.now() + '-' + Math.random().toString(36).slice(2,8) + (ext?'.'+ext.toLowerCase():'');
    cb(null, safe);
  }
});
const upload = multer({ storage });

// ---------------- API ----------------
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await database.healthCheck();
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: dbHealth });
  } catch (error) {
    res.status(500).json({ status: 'error', database: { healthy: false, message: error.message }});
  }
});

// Example: menu API
app.get('/api/menu', async (req, res) => {
  try {
    const categories = await Category.find({ active: true }).sort({ name: 1 });
    const items = await MenuItem.find({ active: true }).sort({ category: 1, name: 1 });
    res.json({
      categories: categories.map(c => ({ name: c.name, printer: c.printer })),
      items: items.map(i => ({
        name: i.name,
        category: i.category,
        image: i.image,
        price: i.price,
        description: i.description
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Print test → emit ให้ print-service พิมพ์
app.post('/api/print-test', (req, res) => {
  const payload = {
    orderId: `TEST-${Date.now().toString().slice(-6)}`,
    table: 'TEST',
    note: 'ทดสอบจาก /api/print-test',
    items: [ { name: 'เนื้อออสเตรเลีย', qty: 2, category: 'หมู' }, { name: 'กุ้ง', qty: 1, category: 'ทะเล' } ]
  };
  io.emit('new-order', payload);
  res.json({ ok: true, sent: true });
});

app.post('/api/print-test-xprinter', (req, res) => {
  const payload = {
    orderId: `TESTX-${Date.now().toString().slice(-6)}`,
    table: 'TEST-X',
    note: 'ทดสอบจาก /api/print-test-xprinter',
    items: [ { name: 'หมูสไลซ์', qty: 2, category: 'หมู' }, { name: 'ปลาหมึก', qty: 1, category: 'ทะเล' } ]
  };
  io.emit('new-order', payload);
  res.json({ ok: true, sent: true });
});

// QR generator (fix proto behind proxy)
app.get('/api/qr', async (req, res) => {
  try {
    const { table = '1' } = req.query;
    const proto = (req.headers["x-forwarded-proto"] || req.protocol);
    const host  = req.get("host");
    const url   = `${proto}://${host}/?table=${encodeURIComponent(table)}`;
    const png = await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', width: 600 });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ---------------- Pages ----------------
app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ---------------- Start Server ----------------
async function startServer() {
  try {
    await database.connect();
    if (database.initializeDefaultData && typeof database.initializeDefaultData === 'function') {
      await database.initializeDefaultData();
    }

    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => {
      console.log(`🍲 Shabu System running on http://localhost:${PORT}`);
      console.log(`📱 Customer: http://localhost:${PORT}`);
      console.log(`⚙️  Admin: http://localhost:${PORT}/admin/`);
      console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
    });

    io.on('connection', (socket) => {
      console.log('👤 Client connected:', socket.id);
      socket.on('disconnect', () => console.log('👤 Client disconnected:', socket.id));
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
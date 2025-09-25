// server.js - Updated with MongoDB integration
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import multer from 'multer';

// MongoDB imports
import database from './config/database.js';
import { Category, MenuItem, Order } from './models/schemas.js';

// Printer service
import { printEpson, printXprinterThaiCP874 } from './services/escposPrinter.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 4000;
const EPSON_IP = process.env.EPSON_IP || '192.168.1.33';
const EPSON_PORT = Number(process.env.EPSON_PORT || 9100);
const XPRINTER_IP = process.env.XPRINTER_IP || '192.168.1.23';
const XPRINTER_PORT = Number(process.env.XPRINTER_PORT || 9100);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Storage for uploads
const uploadsDir = path.join(__dirname, 'public/uploads');
import fs from 'fs';
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

// --- DATABASE HEALTH CHECK ---
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await database.healthCheck();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbHealth
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: { healthy: false, message: error.message }
    });
  }
});

// --- MENU API ---
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
    console.error('Menu fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Categories CRUD
app.post('/api/categories', async (req, res) => {
  try {
    const { name, printer = 'EPSON' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'ต้องใส่ชื่อหมวด' });
    
    const existingCategory = await Category.findOne({ name: name.trim() });
    if (existingCategory) return res.status(400).json({ error: 'มีชื่อหมวดนี้อยู่แล้ว' });
    
    const category = new Category({
      name: name.trim(),
      printer: (printer === 'XPRINTER' ? 'XPRINTER' : 'EPSON')
    });
    
    await category.save();
    
    const categories = await Category.find({ active: true }).sort({ name: 1 });
    res.json({
      ok: true,
      categories: categories.map(c => ({ name: c.name, printer: c.printer }))
    });
  } catch (error) {
    console.error('Category create error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/categories', async (req, res) => {
  try {
    const { oldName, name, printer } = req.body;
    if (!oldName) return res.status(400).json({ error: 'ต้องระบุ oldName' });
    
    const category = await Category.findOne({ name: oldName });
    if (!category) return res.status(404).json({ error: 'ไม่พบหมวด' });
    
    if (name) category.name = name.trim();
    if (printer) category.printer = (printer === 'XPRINTER' ? 'XPRINTER' : 'EPSON');
    
    await category.save();
    
    const categories = await Category.find({ active: true }).sort({ name: 1 });
    res.json({
      ok: true,
      categories: categories.map(c => ({ name: c.name, printer: c.printer }))
    });
  } catch (error) {
    console.error('Category update error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'ต้องระบุชื่อหมวดที่จะลบ' });
    
    await Category.deleteOne({ name });
    // Update items to remove this category
    await MenuItem.updateMany({ category: name }, { $set: { category: '' } });
    
    const categories = await Category.find({ active: true }).sort({ name: 1 });
    res.json({
      ok: true,
      categories: categories.map(c => ({ name: c.name, printer: c.printer }))
    });
  } catch (error) {
    console.error('Category delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Items CRUD
app.get('/api/items', async (req, res) => {
  try {
    const items = await MenuItem.find({ active: true }).sort({ category: 1, name: 1 });
    res.json(items.map(i => ({
      name: i.name,
      category: i.category,
      image: i.image,
      price: i.price,
      description: i.description
    })));
  } catch (error) {
    console.error('Items fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/items', upload.single('image'), async (req, res) => {
  try {
    const { name, category, price, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'ต้องใส่ชื่อเมนู' });
    
    const existingItem = await MenuItem.findOne({ name: name.trim() });
    if (existingItem) return res.status(400).json({ error: 'มีเมนูนี้อยู่แล้ว' });
    
    const image = req.file ? '/uploads/' + req.file.filename : '';
    
    const item = new MenuItem({
      name: name.trim(),
      category: category || '',
      image,
      price: parseFloat(price) || 0,
      description: description || ''
    });
    
    await item.save();
    
    const items = await MenuItem.find({ active: true }).sort({ category: 1, name: 1 });
    res.json({
      ok: true,
      items: items.map(i => ({
        name: i.name,
        category: i.category,
        image: i.image,
        price: i.price,
        description: i.description
      }))
    });
  } catch (error) {
    console.error('Item create error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/items', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'ต้องระบุชื่อเมนูที่จะลบ' });
    
    await MenuItem.deleteOne({ name });
    
    const items = await MenuItem.find({ active: true }).sort({ category: 1, name: 1 });
    res.json({
      ok: true,
      items: items.map(i => ({
        name: i.name,
        category: i.category,
        image: i.image,
        price: i.price,
        description: i.description
      }))
    });
  } catch (error) {
    console.error('Item delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Orders + print routing by category.printer
const orderHandler = async (req, res) => {
  try {
    const { table, items, note } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'ต้องมีรายการอาหารอย่างน้อย 1 รายการ' });
    }
    
    const orderId = Date.now().toString().slice(-6);
    
    // Create order in database
    const order = new Order({
      orderId,
      table: table || '',
      items: items.map(item => ({
        name: item.name,
        qty: item.qty || 1,
        category: item.category || '',
        price: item.price || 0
      })),
      note: note || '',
      status: 'NEW'
    });
    
    await order.save();
    
    // Emit real-time update
    io.emit('new-order', order);

    // Print logic
    const categories = await Category.find({ active: true });
    const byPrinter = { EPSON: [], XPRINTER: [] };
    
    for (const item of items) {
      const cat = categories.find(c => c.name === item.category) || { printer: 'EPSON' };
      const target = (cat.printer === 'XPRINTER') ? 'XPRINTER' : 'EPSON';
      byPrinter[target].push(item);
    }

    const makeLines = (subset) => [
      `โต๊ะ ${table || '-'}`,
      ...subset.map(x => `x${x.qty || 1}  ${x.name}`),
      ...(note ? [`หมายเหตุ: ${note}`] : [])
    ];

    // Print to each printer if it has items
    if (byPrinter.EPSON.length) {
      try { 
        await printEpson({ 
          host: EPSON_IP, 
          port: EPSON_PORT, 
          title: `ORDER #${orderId}`, 
          lines: makeLines(byPrinter.EPSON) 
        });
        
        // Update print timestamp
        await Order.findOneAndUpdate(
          { orderId }, 
          { $set: { printedAt: new Date() } }
        );
      }
      catch (e) { console.error('Print EPSON error:', e.message); }
    }
    
    if (byPrinter.XPRINTER.length) {
      try { 
        await printXprinterThaiCP874({ 
          host: XPRINTER_IP, 
          port: XPRINTER_PORT, 
          title: `ORDER #${orderId}`, 
          lines: makeLines(byPrinter.XPRINTER) 
        });
        
        // Update print timestamp
        await Order.findOneAndUpdate(
          { orderId }, 
          { $set: { printedAt: new Date() } }
        );
      }
      catch (e) { console.error('Print XPRINTER error:', e.message); }
    }

    res.json({ ok: true, orderId });
  } catch (error) { 
    console.error('Order creation error:', error);
    res.status(500).json({ error: error.message }); 
  }
};

app.post('/api/order', orderHandler);
app.post('/api/orders', orderHandler);

app.get('/api/orders', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(limit);
      
    res.json(orders.map(o => ({
      orderId: o.orderId,
      table: o.table,
      items: o.items,
      note: o.note,
      status: o.status,
      totalItems: o.totalItems,
      totalAmount: o.totalAmount,
      ts: o.createdAt
    })));
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Print tests
app.post('/api/print-test', async (req, res) => {
  try {
    const lines = ['โต๊ะ TEST', 'ทดสอบพิมพ์ไทย (ESC/POS)', 'เนื้อออสเตรเลีย x2', 'กุ้ง x1'];
    await printEpson({ host: EPSON_IP, port: EPSON_PORT, title: 'TEST PRINT (EPSON)', lines });
    res.json({ ok: true });
  } catch (error) { 
    console.error('Epson test print error:', error);
    res.status(500).json({ error: error.message }); 
  }
});

app.post('/api/print-test-xprinter', async (req, res) => {
  try {
    const lines = ['โต๊ะ TEST-X', 'ทดสอบพิมพ์ไทย (XPrinter)', 'หมูสไลซ์ x2', 'ปลาหมึก x1'];
    await printXprinterThaiCP874({ host: XPRINTER_IP, port: XPRINTER_PORT, title: 'TEST PRINT (XPRINTER)', lines });
    res.json({ ok: true });
  } catch (error) {
    console.error('XPrinter test print error:', error);
    res.status(500).json({ error: error.message });
  }
});

// QR for a table
app.get('/api/qr', async (req, res) => {
  try {
    const { table = '1' } = req.query;
    const url = `${req.protocol}://${req.get('host')}/?table=${encodeURIComponent(table)}`;
    const png = await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', width: 600 });
    res.setHeader('Content-Type', 'image/png'); 
    res.send(png);
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

// Update order status
app.patch('/api/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['NEW', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const order = await Order.findOneAndUpdate(
      { orderId }, 
      { $set: { status, updatedAt: new Date() } },
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Emit real-time update
    io.emit('order-updated', { orderId, status });
    
    res.json({ ok: true, order });
  } catch (error) {
    console.error('Order update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve admin page
app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// Serve customer page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Initialize database and start server
async function startServer() {
  try {
    // Connect to MongoDB
    await database.connect();
    
    // Initialize default data if needed
    if (database.initializeDefaultData && typeof database.initializeDefaultData === 'function') {
      await database.initializeDefaultData();
    } else {
      console.log('📋 No default data initialization needed');
    }
    
    // Start the server
    server.listen(PORT, () => {
      console.log(`🍲 Shabu System running on http://localhost:${PORT}`);
      console.log(`📱 Customer: http://localhost:${PORT}`);
      console.log(`⚙️  Admin: http://localhost:${PORT}/admin/`);
      console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
    });
    
    // Socket.IO connection handling
    io.on('connection', (socket) => {
      console.log('👤 Client connected:', socket.id);
      
      socket.on('disconnect', () => {
        console.log('👤 Client disconnected:', socket.id);
      });
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  await database.disconnect();
  server.close(() => {
    console.log('👋 Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  await database.disconnect();
  server.close(() => {
    console.log('👋 Server closed');
    process.exit(0);
  });
});

// Start the server
startServer();
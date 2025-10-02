import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// In-memory storage (ในการใช้งานจริงควรใช้ database)
let menuItems = [
  {
    id: 1,
    name: "เนื้อวัวสไลด์",
    category: "เนื้อ",
    image: null,
    available: true
  },
  {
    id: 2,
    name: "หมูสไลด์",
    category: "หมู",
    image: null,
    available: true
  },
  {
    id: 3,
    name: "กุ้งสด",
    category: "ทะเล",
    image: null,
    available: true
  },
  {
    id: 4,
    name: "ปลาหมึก",
    category: "ทะเล",
    image: null,
    available: true
  },
  {
    id: 5,
    name: "ผักรวม",
    category: "ผัก",
    image: null,
    available: true
  },
  {
    id: 6,
    name: "เห็ดรวม",
    category: "ผัก",
    image: null,
    available: true
  },
  {
    id: 7,
    name: "เส้นอุด้ง",
    category: "เส้น",
    image: null,
    available: true
  },
  {
    id: 8,
    name: "เส้นบะหมี่",
    category: "เส้น",
    image: null,
    available: true
  }
];

let orders = [];
let orderIdCounter = 1;

// Routes

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'uploads', 'index.html'));
});

// Get menu items
app.get('/api/menu', (req, res) => {
  try {
    res.json({
      ok: true,
      items: menuItems.filter(item => item.available)
    });
  } catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).json({
      ok: false,
      error: 'ไม่สามารถโหลดเมนูได้'
    });
  }
});

// Submit order
app.post('/api/orders', (req, res) => {
  try {
    const { table, items, note } = req.body;

    // Validation
    if (!table) {
      return res.status(400).json({
        ok: false,
        error: 'กรุณาระบุหมายเลขโต๊ะ'
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'กรุณาเลือกเมนูอย่างน้อย 1 รายการ'
      });
    }

    // Create order
    const order = {
      id: orderIdCounter++,
      table: table,
      items: items,
      note: note || '',
      status: 'pending',
      timestamp: new Date().toISOString(),
      totalItems: items.reduce((sum, item) => sum + item.qty, 0)
    };

    orders.push(order);

    // Emit to all connected clients (for admin dashboard)
    io.emit('new-order', order);

    console.log(`📋 ออเดอร์ใหม่ - โต๊ะ ${table}:`, items.map(i => `${i.name} x${i.qty}`).join(', '));

    res.json({
      ok: true,
      orderId: order.id,
      message: 'ส่งออเดอร์เรียบร้อยแล้ว'
    });

  } catch (error) {
    console.error('Error submitting order:', error);
    res.status(500).json({
      ok: false,
      error: 'เกิดข้อผิดพลาดในการส่งออเดอร์'
    });
  }
});

// Get all orders (for admin)
app.get('/api/orders', (req, res) => {
  try {
    res.json({
      ok: true,
      orders: orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      ok: false,
      error: 'ไม่สามารถโหลดออเดอร์ได้'
    });
  }
});

// Update order status
app.patch('/api/orders/:id', (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;
    
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      return res.status(404).json({
        ok: false,
        error: 'ไม่พบออเดอร์'
      });
    }

    order.status = status;
    order.updatedAt = new Date().toISOString();

    // Emit status update
    io.emit('order-status-updated', { orderId, status });

    res.json({
      ok: true,
      message: 'อัปเดตสถานะเรียบร้อยแล้ว'
    });

  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({
      ok: false,
      error: 'ไม่สามารถอัปเดตสถานะได้'
    });
  }
});

// Add menu item (for admin)
app.post('/api/menu', (req, res) => {
  try {
    const { name, category, image } = req.body;
    
    if (!name) {
      return res.status(400).json({
        ok: false,
        error: 'กรุณาระบุชื่อเมนู'
      });
    }

    const newItem = {
      id: Math.max(...menuItems.map(i => i.id), 0) + 1,
      name,
      category: category || '',
      image: image || null,
      available: true
    };

    menuItems.push(newItem);

    // Emit menu update
    io.emit('menu-updated');

    res.json({
      ok: true,
      item: newItem,
      message: 'เพิ่มเมนูเรียบร้อยแล้ว'
    });

  } catch (error) {
    console.error('Error adding menu item:', error);
    res.status(500).json({
      ok: false,
      error: 'ไม่สามารถเพิ่มเมนูได้'
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('👤 Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('👋 Client disconnected:', socket.id);
  });

  // Join admin room
  socket.on('join-admin', () => {
    socket.join('admin');
    console.log('🔧 Admin joined:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    ok: false,
    error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'ไม่พบหน้าที่ต้องการ'
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🍲 Shabu Order System running on port ${PORT}`);
  console.log(`📱 Frontend: http://localhost:${PORT}`);
  console.log(`🔧 API: http://localhost:${PORT}/api`);
});

export default app;
// models/schemas.js (ESM)
import mongoose from "mongoose";

/**
 * หมายเหตุสำคัญ:
 * - server.js ใช้ Category.find({active:true}) => ต้องมี field active
 * - server.js ใช้ MenuItem.find(...).map({ name, category, image, price, description }) => ต้องมี field พวกนี้
 * - server.js เก็บ Order เป็นโครงสร้างเบา ๆ: orderId, table, items[{ name, qty, category, price }], note/status/printedAt
 *   และใช้ createdAt ในการ sort => เปิด timestamps
 */

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    printer: { type: String, enum: ["EPSON", "XPRINTER"], default: "EPSON" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// เก็บ category เป็นชื่อ (string) ให้ตรงกับที่ server.js อัปเดตด้วยชื่อ (ไม่ผูก ObjectId)
const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    category: { type: String, default: "" }, // ชื่อหมวด เช่น "หมู"
    image: { type: String, default: "" },    // path '/uploads/xxx.png'
    price: { type: Number, default: 0 },
    description: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const orderItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    qty: { type: Number, default: 1 },
    category: { type: String, default: "" }, // ชื่อหมวด
    price: { type: Number, default: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, index: true }, // ใช้ Date.now().slice(-6) ใน server.js
    table: { type: String, default: "" },
    items: { type: [orderItemSchema], default: [] },
    note: { type: String, default: "" },
    status: {
      type: String,
      enum: ["NEW", "PREPARING", "READY", "SERVED", "CANCELLED"],
      default: "NEW",
      index: true,
    },
    printedAt: { type: Date },
    totalItems: { type: Number },  // server.js แค่อ่าน map; ไม่คำนวณก็ไม่เป็นไร
    totalAmount: { type: Number }, // idem
  },
  { timestamps: true }
);

// กัน overwrite เวลา hot-reload
export const Category  = mongoose.models.Category  || mongoose.model("Category", categorySchema);
export const MenuItem  = mongoose.models.MenuItem  || mongoose.model("MenuItem", menuItemSchema);
export const Item      = MenuItem; // เผื่อโค้ดเดิมบางจุดใช้ Item
export const Order     = mongoose.models.Order     || mongoose.model("Order", orderSchema);

export default { Category, MenuItem, Item, Order };

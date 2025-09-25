// config/database.js
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";

// 1) อ่าน URI จาก .env เท่านั้น
const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
  console.error("❌ MONGODB_URI is not defined (set it in .env or Render env vars)");
  process.exit(1);
}

// 2) ตัวเลือกการเชื่อมต่อ
const mongoOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferCommands: false,
  ...(NODE_ENV === "production" && {
    retryWrites: true,
    w: "majority",
    readPreference: "primary",
  }),
};

// 3) ตัวช่วย mask credentials เวลา log
function maskUri(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
}

class Database {
  constructor() {
    this.isConnected = false;
    this.connectionPromise = null;
  }

  async connect() {
    if (this.connectionPromise) return this.connectionPromise;
    if (this.isConnected && mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    console.log("🔄 Connecting to MongoDB...");
    console.log("Environment MONGODB_URI:", mongoURI ? "SET" : "NOT SET");
    console.log(`📍 Using URI: ${maskUri(mongoURI)}`);

    this.connectionPromise = this._performConnection();
    try {
      await this.connectionPromise;
      return mongoose.connection;
    } catch (err) {
      this.connectionPromise = null;
      throw err;
    }
  }

  async _performConnection() {
    try {
      await mongoose.connect(mongoURI, mongoOptions);
      this.isConnected = true;
      console.log("✅ MongoDB connected successfully");
      console.log(`📊 Database: ${mongoose.connection.name}`);
      this._setupEventListeners();
      return mongoose.connection;
    } catch (error) {
      this.isConnected = false;
      console.error("❌ MongoDB connection failed:", error.message);
      throw error;
    }
  }

  _setupEventListeners() {
    const conn = mongoose.connection;
    conn.on("connected", () => {
      console.log("🟢 Mongoose connected to MongoDB");
      this.isConnected = true;
    });
    conn.on("error", (err) => {
      console.error("🔴 Mongoose connection error:", err);
      this.isConnected = false;
    });
    conn.on("disconnected", () => {
      console.log("🟡 Mongoose disconnected from MongoDB");
      this.isConnected = false;
      this.connectionPromise = null;
    });
    process.on("SIGINT", async () => {
      try {
        await this.disconnect();
        console.log("👋 MongoDB connection closed through app termination");
        process.exit(0);
      } catch (e) {
        console.error("Error during graceful shutdown:", e);
        process.exit(1);
      }
    });
  }

  async disconnect() {
    if (this.isConnected) {
      await mongoose.connection.close();
      this.isConnected = false;
      this.connectionPromise = null;
      console.log("🔌 MongoDB connection closed");
    }
  }

  getConnectionState() {
    const states = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
    return {
      state: states[mongoose.connection.readyState] || "unknown",
      isConnected: this.isConnected,
      dbName: mongoose.connection.name || null,
      host: mongoose.connection.host || null,
      port: mongoose.connection.port || null,
    };
  }

  async healthCheck() {
    try {
      if (!this.isConnected) return { healthy: false, message: "Not connected to database" };
      await mongoose.connection.db.admin().ping();
      return { healthy: true, message: "Database connection is healthy", ...this.getConnectionState() };
    } catch (error) {
      return { healthy: false, message: `Database health check failed: ${error.message}`, error: error.message };
    }
  }

  // เรียกครั้งเดียวตอนบูต (จะข้ามถ้า schema ไม่พร้อม)
  async initializeDefaultData() {
    try {
      console.log("📋 Checking for default data initialization...");
      let Category, MenuItem, Settings;
      try {
        const schemas = await import("../models/schemas.js");
        ({ Category, MenuItem, Settings } = schemas);
        if (!Category || !MenuItem) {
          console.log("⚠️ Schema models not available, skipping default data initialization");
          return;
        }
      } catch (e) {
        console.log("⚠️ Could not import schemas, skipping default data initialization:", e.message);
        return;
      }

      const [categoryCount, itemCount] = await Promise.all([
        Category.countDocuments(),
        MenuItem.countDocuments(),
      ]);

      if (categoryCount === 0 && itemCount === 0) {
        console.log("📋 Initializing default data...");
        const defaultCategories = [
          { name: "เนื้อสัตว์", printer: "EPSON" },
          { name: "อาหารทะเล", printer: "EPSON" },
          { name: "ผัก", printer: "XPRINTER" },
          { name: "เครื่องดื่ม", printer: "XPRINTER" },
        ];
        await Category.insertMany(defaultCategories);

        const defaultItems = [
          { name: "เนื้อออสเตรเลีย", category: "เนื้อสัตว์", price: 120 },
          { name: "หมูสไลซ์", category: "เนื้อสัตว์", price: 80 },
          { name: "กุ้งสด", category: "อาหารทะเล", price: 150 },
          { name: "ปลาหมึก", category: "อาหารทะเล", price: 100 },
          { name: "ผักบุ้งจีน", category: "ผัก", price: 30 },
          { name: "กะหล่ำปลี", category: "ผัก", price: 25 },
          { name: "น้ำเปล่า", category: "เครื่องดื่ม", price: 10 },
          { name: "โค้ก", category: "เครื่องดื่ม", price: 25 },
        ];
        await MenuItem.insertMany(defaultItems);

        if (Settings) {
          await Settings.insertMany([
            { key: "restaurant_name", value: "Shabu Restaurant", description: "ชื่อร้าน" },
            { key: "tax_rate", value: 7, description: "อัตราภาษี (%)" },
            { key: "service_charge", value: 0, description: "ค่าบริการ (%)" },
          ]);
        }
        console.log("✅ Default data initialized successfully");
      } else {
        console.log("📋 Database already contains data, skipping initialization");
      }
    } catch (error) {
      console.error("❌ Failed to initialize default data:", error.message);
      console.log("📋 Continuing server startup without default data...");
    }
  }
}

const database = new Database();
export default database;
export { Database };

// config/database.js - MongoDB Connection Setup
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shabu_order';
const NODE_ENV = process.env.NODE_ENV || 'development';

// MongoDB connection options
const mongoOptions = {
  // Connection management
  maxPoolSize: 10,          // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000,  // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000,   // Close sockets after 45 seconds of inactivity
  bufferCommands: false,    // Disable mongoose buffering
  
  // For production
  ...(NODE_ENV === 'production' && {
    retryWrites: true,
    w: 'majority',
    readPreference: 'primary'
  })
};

class Database {
  constructor() {
    this.isConnected = false;
    this.connectionPromise = null;
  }

  async connect() {
    // Return existing connection promise if already connecting
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Return immediately if already connected
    if (this.isConnected && mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    console.log('🔄 Connecting to MongoDB...');
    console.log('Environment MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
    console.log(`📍 Using URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);

    this.connectionPromise = this._performConnection();
    
    try {
      await this.connectionPromise;
      return mongoose.connection;
    } catch (error) {
      this.connectionPromise = null;
      throw error;
    }
  }

  async _performConnection() {
    try {
      await mongoose.connect(MONGODB_URI, mongoOptions);
      
      this.isConnected = true;
      console.log('✅ MongoDB connected successfully');
      console.log(`📊 Database: ${mongoose.connection.name}`);
      
      // Set up connection event listeners
      this._setupEventListeners();
      
      return mongoose.connection;
    } catch (error) {
      this.isConnected = false;
      console.error('❌ MongoDB connection failed:', error.message);
      throw error;
    }
  }

  _setupEventListeners() {
    const connection = mongoose.connection;

    // Connection events
    connection.on('connected', () => {
      console.log('🟢 Mongoose connected to MongoDB');
      this.isConnected = true;
    });

    connection.on('error', (error) => {
      console.error('🔴 Mongoose connection error:', error);
      this.isConnected = false;
    });

    connection.on('disconnected', () => {
      console.log('🟡 Mongoose disconnected from MongoDB');
      this.isConnected = false;
      this.connectionPromise = null;
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await this.disconnect();
        console.log('👋 MongoDB connection closed through app termination');
        process.exit(0);
      } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    });
  }

  async disconnect() {
    if (this.isConnected) {
      await mongoose.connection.close();
      this.isConnected = false;
      this.connectionPromise = null;
      console.log('🔌 MongoDB connection closed');
    }
  }

  getConnectionState() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    return {
      state: states[mongoose.connection.readyState] || 'unknown',
      isConnected: this.isConnected,
      dbName: mongoose.connection.name || null,
      host: mongoose.connection.host || null,
      port: mongoose.connection.port || null
    };
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { healthy: false, message: 'Not connected to database' };
      }

      // Try to execute a simple operation
      await mongoose.connection.db.admin().ping();
      
      return {
        healthy: true,
        message: 'Database connection is healthy',
        ...this.getConnectionState()
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Database health check failed: ${error.message}`,
        error: error.message
      };
    }
  }

  // Initialize default data (called once on first startup)
  async initializeDefaultData() {
    try {
      const { Category, MenuItem, Settings } = await import('../models/schemas.js');
      
      // Check if data already exists
      const categoryCount = await Category.countDocuments();
      const itemCount = await MenuItem.countDocuments();
      
      if (categoryCount === 0 && itemCount === 0) {
        console.log('📋 Initializing default data...');
        
        // Create default categories
        const defaultCategories = [
          { name: 'เนื้อสัตว์', printer: 'EPSON' },
          { name: 'อาหารทะเล', printer: 'EPSON' },
          { name: 'ผัก', printer: 'XPRINTER' },
          { name: 'เครื่องดื่ม', printer: 'XPRINTER' }
        ];

        await Category.insertMany(defaultCategories);
        
        // Create default menu items
        const defaultItems = [
          { name: 'เนื้อออสเตรเลีย', category: 'เนื้อสัตว์', price: 120 },
          { name: 'หมูสไลซ์', category: 'เนื้อสัตว์', price: 80 },
          { name: 'กุ้งสด', category: 'อาหารทะเล', price: 150 },
          { name: 'ปลาหมึก', category: 'อาหารทะเล', price: 100 },
          { name: 'ผักบุ้งจีน', category: 'ผัก', price: 30 },
          { name: 'กะหล่ำปลี', category: 'ผัก', price: 25 },
          { name: 'น้ำเปล่า', category: 'เครื่องดื่ม', price: 10 },
          { name: 'โค้ก', category: 'เครื่องดื่ม', price: 25 }
        ];

        await MenuItem.insertMany(defaultItems);
        
        // Create default settings
        const defaultSettings = [
          { key: 'restaurant_name', value: 'Shabu Restaurant', description: 'ชื่อร้าน' },
          { key: 'tax_rate', value: 7, description: 'อัตราภาษี (%)' },
          { key: 'service_charge', value: 0, description: 'ค่าบริการ (%)' }
        ];

        await Settings.insertMany(defaultSettings);
        
        console.log('✅ Default data initialized successfully');
      } else {
        console.log('📋 Database already contains data, skipping initialization');
      }
    } catch (error) {
      console.error('❌ Failed to initialize default data:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const database = new Database();

export default database;
export { Database };
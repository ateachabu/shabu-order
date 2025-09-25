// scripts/setup-mongodb.js - MongoDB setup helper
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Prefer environment variable; fallback to local MongoDB to avoid DNS SRV issues
mongoose.connect('mongodb://localhost:27017/shabu-order');
async function setupDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully');

    const db = mongoose.connection.db;
    
    // Create indexes for better performance
    console.log('📊 Creating database indexes...');
    
    const collections = {
      categories: [
        { name: 1, unique: true },
        { active: 1 }
      ],
      menuitems: [
        { name: 1, unique: true },
        { category: 1 },
        { active: 1 }
      ],
      orders: [
        { orderId: 1, unique: true },
        { status: 1 },
        { createdAt: -1 },
        { table: 1 },
        { 'items.category': 1 }
      ]
    };

    for (const [collectionName, indexes] of Object.entries(collections)) {
      const collection = db.collection(collectionName);
      
      for (const index of indexes) {
        const isUnique = index.unique;
        delete index.unique;
        
        try {
          await collection.createIndex(index, { 
            unique: isUnique || false,
            background: true 
          });
          
          console.log(`  ✓ Index created for ${collectionName}: ${JSON.stringify(index)}`);
        } catch (error) {
          if (error.code === 11000) {
            console.log(`  ⚠ Index already exists for ${collectionName}: ${JSON.stringify(index)}`);
          } else {
            console.log(`  ⚠ Failed to create index for ${collectionName}: ${error.message}`);
          }
        }
      }
    }

    // Check if we need to seed initial data
    const categoryCount = await db.collection('categories').countDocuments();
    const itemCount = await db.collection('menuitems').countDocuments();

    if (categoryCount === 0 && itemCount === 0) {
      console.log('🌱 Seeding initial data...');
      
      // Insert categories
      const categories = [
        { name: 'เนื้อสัตว์', printer: 'EPSON', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'อาหารทะเล', printer: 'EPSON', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'ผัก', printer: 'XPRINTER', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'เครื่องดื่ม', printer: 'XPRINTER', active: true, createdAt: new Date(), updatedAt: new Date() }
      ];
      
      await db.collection('categories').insertMany(categories);
      console.log(`  ✓ Inserted ${categories.length} categories`);

      // Insert menu items
      const menuItems = [
        { name: 'เนื้อออสเตรเลีย', category: 'เนื้อสัตว์', price: 120, description: 'เนื้อออสเตรเลียสด คุณภาพพรีเมียม', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'หมูสไลซ์', category: 'เนื้อสัตว์', price: 80, description: 'หมูสไลซ์สด หั่นบาง', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'เนื้อวากิว', category: 'เนื้อสัตว์', price: 250, description: 'เนื้อวากิวพรีเมียม นำเข้าจากญี่ปุ่น', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'กุ้งสด', category: 'อาหารทะเล', price: 150, description: 'กุ้งแม่น้ำสด ขนาดใหญ่', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'ปลาหมึก', category: 'อาหารทะเล', price: 100, description: 'ปลาหมึกสด หั่นวง', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'หอยเชลล์', category: 'อาหารทะเล', price: 120, description: 'หอยเชลล์นิวซีแลนด์', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'ผักบุ้งจีน', category: 'ผัก', price: 30, description: 'ผักบุ้งจีนสด', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'กะหล่ำปลี', category: 'ผัก', price: 25, description: 'กะหล่ำปลีสด', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'เห็ดเข็มทิพย์', category: 'ผัก', price: 40, description: 'เห็ดเข็มทิพย์สด', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'น้ำเปล่า', category: 'เครื่องดื่ม', price: 10, description: 'น้ำดื่มบริสุทธิ์', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'โค้ก', category: 'เครื่องดื่ม', price: 25, description: 'โคคา-โคลา', image: '', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'น้ำส้ม', category: 'เครื่องดื่ม', price: 30, description: 'น้ำส้มสด 100%', image: '', active: true, createdAt: new Date(), updatedAt: new Date() }
      ];
      
      await db.collection('menuitems').insertMany(menuItems);
      console.log(`  ✓ Inserted ${menuItems.length} menu items`);

      // Insert settings
      const settings = [
        { key: 'restaurant_name', value: 'Shabu Restaurant', description: 'ชื่อร้าน', updatedAt: new Date() },
        { key: 'tax_rate', value: 7, description: 'อัตราภาษี (%)', updatedAt: new Date() },
        { key: 'service_charge', value: 0, description: 'ค่าบริการ (%)', updatedAt: new Date() },
        { key: 'currency', value: 'THB', description: 'สกุลเงิน', updatedAt: new Date() },
        { key: 'receipt_footer', value: 'ขอบคุณที่ใช้บริการ', description: 'ข้อความท้ายใบเสร็จ', updatedAt: new Date() }
      ];
      
      await db.collection('settings').insertMany(settings);
      console.log(`  ✓ Inserted ${settings.length} settings`);
    } else {
      console.log('📋 Database already contains data, skipping seed');
    }

    console.log('🎉 Database setup completed successfully!');
    
    // Show database stats
    const stats = await db.stats();
    console.log(`📊 Database stats:`);
    console.log(`   Collections: ${stats.collections}`);
    console.log(`   Data Size: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Storage Size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Indexes: ${stats.indexes}`);

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Helper function to test connection
async function testConnection() {
  try {
    console.log('🔄 Testing MongoDB connection...');
    console.log(`📍 URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connection successful!');
    
    const db = mongoose.connection.db;
    await db.admin().ping();
    console.log('✅ MongoDB ping successful!');
    
    const collections = await db.listCollections().toArray();
    console.log(`📊 Found ${collections.length} collections:`);
    collections.forEach(col => console.log(`   - ${col.name}`));
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.error('💡 Make sure MongoDB is running and connection string is correct');
    
    // Additional troubleshooting info
    if (error.message.includes('ENOTFOUND')) {
      console.error('🔍 DNS resolution failed. Check your internet connection and cluster name.');
    } else if (error.message.includes('authentication failed')) {
      console.error('🔍 Authentication failed. Check username and password.');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('🔍 Connection refused. Check if MongoDB is running.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

// Main execution
const command = process.argv[2];

switch (command) {
  case 'test':
    testConnection();
    break;
  case 'setup':
  default:
    setupDatabase();
    break;
}

export { setupDatabase, testConnection };
const fs = require('fs');
const path = require('path');

class ConfigLoader {
  constructor() {
    this.users = [];
    this.adminPhones = [];
    this.eventCreatorNumber = '';
    this.watchers = new Map();
    this.loadConfig();
    this.setupWatchers();
  }

  // Load configuration from JSON files
  loadConfig() {
    try {
      // Load users
      const usersPath = path.join(__dirname, 'users.json');
      if (fs.existsSync(usersPath)) {
        const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
        this.users = usersData.users || [];
        console.log(`✅ Loaded ${this.users.length} users from config`);
      } else {
        console.warn('⚠️ users.json not found, using empty array');
        this.users = [];
      }

      // Load admins
      const adminsPath = path.join(__dirname, 'admins.json');
      if (fs.existsSync(adminsPath)) {
        const adminsData = JSON.parse(fs.readFileSync(adminsPath, 'utf8'));
        // Remove duplicates from admin phones
        this.adminPhones = [...new Set(adminsData.adminPhones || [])];
        this.eventCreatorNumber = adminsData.eventCreatorNumber || '';
        console.log(`✅ Loaded ${this.adminPhones.length} unique admin numbers from config`);
      } else {
        console.warn('⚠️ admins.json not found, using empty arrays');
        this.adminPhones = [];
        this.eventCreatorNumber = '';
      }
    } catch (error) {
      console.error('❌ Error loading configuration:', error.message);
      // Fallback to empty arrays
      this.users = [];
      this.adminPhones = [];
      this.eventCreatorNumber = '';
    }
  }

  // Setup file watchers for hot reload
  setupWatchers() {
    const files = ['users.json', 'admins.json'];
    
    files.forEach(file => {
      const filePath = path.join(__dirname, file);
      
      if (fs.existsSync(filePath)) {
        const watcher = fs.watch(filePath, (eventType) => {
          if (eventType === 'change') {
            console.log(`🔄 Configuration file ${file} changed, reloading...`);
            setTimeout(() => {
              this.loadConfig();
            }, 100); // Small delay to ensure file is fully written
          }
        });
        
        this.watchers.set(file, watcher);
        console.log(`👀 Watching ${file} for changes`);
      }
    });
  }

  // Get users array
  getUsers() {
    return this.users;
  }

  // Get admin phones array
  getAdminPhones() {
    return this.adminPhones;
  }

  // Get event creator number
  getEventCreatorNumber() {
    return this.eventCreatorNumber;
  }

  // Validate user data
  validateUser(user) {
    const required = ['name', 'clockifyId', 'phone'];
    const missing = required.filter(field => !user[field]);
    
    if (missing.length > 0) {
      throw new Error(`User validation failed: missing fields ${missing.join(', ')}`);
    }
    
    // Validate phone number format (basic check)
    if (!/^\d{10,15}$/.test(user.phone)) {
      throw new Error(`Invalid phone number format: ${user.phone}`);
    }
    
    return true;
  }

  // Validate admin data
  validateAdmin(adminPhone) {
    if (!/^\d{10,15}$/.test(adminPhone)) {
      throw new Error(`Invalid admin phone number format: ${adminPhone}`);
    }
    return true;
  }

  // Add a new user (for future use)
  addUser(userData) {
    this.validateUser(userData);
    this.users.push(userData);
    this.saveUsers();
  }

  // Add a new admin (for future use)
  addAdmin(phoneNumber) {
    this.validateAdmin(phoneNumber);
    if (!this.adminPhones.includes(phoneNumber)) {
      this.adminPhones.push(phoneNumber);
      this.saveAdmins();
    }
  }

  // Save users to file
  saveUsers() {
    try {
      const usersPath = path.join(__dirname, 'users.json');
      fs.writeFileSync(usersPath, JSON.stringify({ users: this.users }, null, 2));
      console.log('✅ Users configuration saved');
    } catch (error) {
      console.error('❌ Error saving users config:', error.message);
    }
  }

  // Save admins to file
  saveAdmins() {
    try {
      const adminsPath = path.join(__dirname, 'admins.json');
      fs.writeFileSync(adminsPath, JSON.stringify({
        adminPhones: this.adminPhones,
        eventCreatorNumber: this.eventCreatorNumber
      }, null, 2));
      console.log('✅ Admins configuration saved');
    } catch (error) {
      console.error('❌ Error saving admins config:', error.message);
    }
  }

  // Cleanup watchers
  destroy() {
    this.watchers.forEach((watcher, file) => {
      watcher.close();
      console.log(`🛑 Stopped watching ${file}`);
    });
    this.watchers.clear();
  }
}

// Create singleton instance
const configLoader = new ConfigLoader();

module.exports = configLoader;

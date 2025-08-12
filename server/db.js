// db.js - Simple local database using JSON files
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Database directory
const dbDir = path.join(__dirname, 'db');
const usersFile = path.join(dbDir, 'users.json');
const onboardingFile = path.join(dbDir, 'onboarding.json');
const socialMediaAccountsFile = path.join(dbDir, 'socialMediaAccounts.json');

// Initialize database directory and files
function initDB() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // Create users file if it doesn't exist
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([]));
  }
  
  // Create onboarding file if it doesn't exist
  if (!fs.existsSync(onboardingFile)) {
    fs.writeFileSync(onboardingFile, JSON.stringify([]));
  }
  
  // Create social media accounts file if it doesn't exist
  if (!fs.existsSync(socialMediaAccountsFile)) {
    fs.writeFileSync(socialMediaAccountsFile, JSON.stringify([]));
  }
}

// Read data from a file
function readData(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

// Write data to a file
function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
    return false;
  }
}

// User operations
const users = {
  // Find all users matching a query
  find: (query = {}) => {
    const allUsers = readData(usersFile);
    return allUsers.filter(user => {
      for (let key in query) {
        if (user[key] !== query[key]) {
          return false;
        }
      }
      return true;
    });
  },
  
  // Find one user matching a query
  findOne: (query) => {
    const allUsers = readData(usersFile);
    const users = allUsers.filter(user => {
      for (let key in query) {
        if (user[key] !== query[key]) {
          return false;
        }
      }
      return true;
    });
    return users.length > 0 ? users[0] : null;
  },
  
  // Find user by ID
  findById: (id) => {
    const allUsers = readData(usersFile);
    return allUsers.find(user => user.id === id) || null;
  },
  
  // Create a new user
  create: (userData) => {
    const allUsers = readData(usersFile);
    
    // Check if user already exists
    const existingUser = allUsers.find(user => user.email === userData.email);
    if (existingUser) {
      throw new Error('User already exists');
    }
    
    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(userData.password, salt);
    
    // Create new user object
    const newUser = {
      id: Date.now().toString(),
      email: userData.email,
      password: hashedPassword,
      role: userData.role || 'user',
      name: userData.name || '',
      onboardingCompleted: userData.onboardingCompleted || false,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      isActive: userData.isActive !== undefined ? userData.isActive : true
    };
    
    allUsers.push(newUser);
    writeData(usersFile, allUsers);
    return newUser;
  },
  
  // Update a user
  updateById: (id, updateData) => {
    const allUsers = readData(usersFile);
    const userIndex = allUsers.findIndex(user => user.id === id);
    
    if (userIndex === -1) {
      return null;
    }
    
    // Update password if provided
    if (updateData.password) {
      const salt = bcrypt.genSaltSync(10);
      updateData.password = bcrypt.hashSync(updateData.password, salt);
    }
    
    // Update user data
    allUsers[userIndex] = { ...allUsers[userIndex], ...updateData };
    writeData(usersFile, allUsers);
    return allUsers[userIndex];
  },
  
  // Delete a user
  deleteById: (id) => {
    const allUsers = readData(usersFile);
    const userIndex = allUsers.findIndex(user => user.id === id);
    
    if (userIndex === -1) {
      return false;
    }
    
    allUsers.splice(userIndex, 1);
    writeData(usersFile, allUsers);
    return true;
  },
  
  // Count documents matching a query
  countDocuments: (query = {}) => {
    return users.find(query).length;
  }
};

// Onboarding operations
const onboarding = {
  // Find all onboarding records matching a query
  find: (query = {}) => {
    const allOnboarding = readData(onboardingFile);
    return allOnboarding.filter(record => {
      for (let key in query) {
        if (record[key] !== query[key]) {
          return false;
        }
      }
      return true;
    });
  },
  
  // Find one onboarding record matching a query
  findOne: (query) => {
    const allOnboarding = readData(onboardingFile);
    const records = allOnboarding.filter(record => {
      for (let key in query) {
        if (record[key] !== query[key]) {
          return false;
        }
      }
      return true;
    });
    return records.length > 0 ? records[0] : null;
  },
  
  // Create a new onboarding record
  create: (onboardingData) => {
    const allOnboarding = readData(onboardingFile);
    
    // Check if onboarding already exists for this user
    const existing = allOnboarding.find(record => record.userId === onboardingData.userId);
    if (existing) {
      throw new Error('Onboarding already exists for this user');
    }
    
    // Create new onboarding object
    const newOnboarding = {
      id: Date.now().toString(),
      userId: onboardingData.userId,
      businessName: onboardingData.businessName,
      userName: onboardingData.userName,
      businessDescription: onboardingData.businessDescription,
      idealCustomer: onboardingData.idealCustomer,
      leadSources: onboardingData.leadSources,
      leadSourcesOther: onboardingData.leadSourcesOther || '',
      dealSize: onboardingData.dealSize,
      communicationPlatforms: onboardingData.communicationPlatforms,
      communicationOther: onboardingData.communicationOther || '',
      leadHandling: onboardingData.leadHandling,
      salesGoal: onboardingData.salesGoal,
      customerQuestions: onboardingData.customerQuestions || [],
      websiteLinks: onboardingData.websiteLinks || '',
      urgency: onboardingData.urgency,
      completedAt: new Date().toISOString()
    };
    
    allOnboarding.push(newOnboarding);
    writeData(onboardingFile, allOnboarding);
    return newOnboarding;
  },
  
  // Update an onboarding record
  updateById: (id, updateData) => {
    const allOnboarding = readData(onboardingFile);
    const recordIndex = allOnboarding.findIndex(record => record.id === id);
    
    if (recordIndex === -1) {
      return null;
    }
    
    allOnboarding[recordIndex] = { ...allOnboarding[recordIndex], ...updateData };
    writeData(onboardingFile, allOnboarding);
    return allOnboarding[recordIndex];
  },
  
  // Delete an onboarding record
  deleteById: (id) => {
    const allOnboarding = readData(onboardingFile);
    const recordIndex = allOnboarding.findIndex(record => record.id === id);
    
    if (recordIndex === -1) {
      return false;
    }
    
    allOnboarding.splice(recordIndex, 1);
    writeData(onboardingFile, allOnboarding);
    return true;
  },
  
  // Count documents matching a query
  countDocuments: (query = {}) => {
    return onboarding.find(query).length;
  }
};

// Social Media Account operations
const socialMediaAccounts = {
  // Find all accounts matching a query
  find: (query = {}) => {
    const allAccounts = readData(socialMediaAccountsFile);
    return allAccounts.filter(account => {
      for (let key in query) {
        if (account[key] !== query[key]) {
          return false;
        }
      }
      return true;
    });
  },
  
  // Find one account matching a query
  findOne: (query) => {
    const allAccounts = readData(socialMediaAccountsFile);
    const accounts = allAccounts.filter(account => {
      for (let key in query) {
        if (account[key] !== query[key]) {
          return false;
        }
      }
      return true;
    });
    return accounts.length > 0 ? accounts[0] : null;
  },
  
  // Create a new account
  create: (accountData) => {
    const allAccounts = readData(socialMediaAccountsFile);
    
    // Create new account object
    const newAccount = {
      id: Date.now().toString(),
      userId: accountData.userId,
      platform: accountData.platform,
      accountId: accountData.accountId,
      accountName: accountData.accountName,
      accessToken: accountData.accessToken,
      pageId: accountData.pageId,
      connectedAt: new Date().toISOString(),
      isActive: accountData.isActive !== undefined ? accountData.isActive : true
    };
    
    allAccounts.push(newAccount);
    writeData(socialMediaAccountsFile, allAccounts);
    return newAccount;
  },
  
  // Update an account
  updateById: (id, updateData) => {
    const allAccounts = readData(socialMediaAccountsFile);
    const accountIndex = allAccounts.findIndex(account => account.id === id);
    
    if (accountIndex === -1) {
      return null;
    }
    
    allAccounts[accountIndex] = { ...allAccounts[accountIndex], ...updateData };
    writeData(socialMediaAccountsFile, allAccounts);
    return allAccounts[accountIndex];
  },
  
  // Delete an account
  deleteById: (id) => {
    const allAccounts = readData(socialMediaAccountsFile);
    const accountIndex = allAccounts.findIndex(account => account.id === id);
    
    if (accountIndex === -1) {
      return false;
    }
    
    allAccounts.splice(accountIndex, 1);
    writeData(socialMediaAccountsFile, allAccounts);
    return true;
  }
};

// Initialize database directory and files
function initDB() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // Create users file if it doesn't exist
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([]));
  }
  
  // Create onboarding file if it doesn't exist
  if (!fs.existsSync(onboardingFile)) {
    fs.writeFileSync(onboardingFile, JSON.stringify([]));
  }
  
  // Create social media accounts file if it doesn't exist
  if (!fs.existsSync(socialMediaAccountsFile)) {
    fs.writeFileSync(socialMediaAccountsFile, JSON.stringify([]));
  }
  
  // Create message tracking file if it doesn't exist
  const messageTrackingFile = path.join(dbDir, 'messageTracking.json');
  if (!fs.existsSync(messageTrackingFile)) {
    fs.writeFileSync(messageTrackingFile, JSON.stringify([]));
  }
}

// Read data from a file
function readData(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

// Write data to a file
function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
    return false;
  }
}

// Message tracking for analytics
const messageTracking = {
  // Find all messages matching a query
  find: (query = {}) => {
    const file = path.join(dbDir, 'messageTracking.json');
    const allMessages = readData(file);
    return allMessages.filter(message => {
      for (let key in query) {
        if (message[key] !== query[key]) {
          return false;
        }
      }
      return true;
    });
  },
  
  // Create a new message record
  create: (messageData) => {
    const file = path.join(dbDir, 'messageTracking.json');
    const allMessages = readData(file);
    
    // Create new message object
    const newMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      userId: messageData.userId,
      platform: messageData.platform,
      type: messageData.type, // incoming, outgoing, ai_response
      timestamp: new Date().toISOString(),
      conversationId: messageData.conversationId,
      messageId: messageData.messageId,
      ...messageData
    };
    
    allMessages.push(newMessage);
    writeData(file, allMessages);
    return newMessage;
  },
  
  // Get message statistics
  getStats: (userId, days = 30) => {
    const file = path.join(dbDir, 'messageTracking.json');
    const allMessages = readData(file);
    
    // Filter messages for the user and time period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const userMessages = allMessages.filter(msg =>
      msg.userId === userId && new Date(msg.timestamp) >= cutoffDate
    );
    
    // Group by date for daily counts
    const dailyCounts = {};
    const platformCounts = { instagram: 0, whatsapp: 0, messenger: 0 };
    const typeCounts = { incoming: 0, outgoing: 0, ai_response: 0 };
    
    userMessages.forEach(msg => {
      // Daily counts
      const date = new Date(msg.timestamp).toISOString().split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
      
      // Platform counts
      if (platformCounts.hasOwnProperty(msg.platform)) {
        platformCounts[msg.platform]++;
      }
      
      // Type counts
      if (typeCounts.hasOwnProperty(msg.type)) {
        typeCounts[msg.type]++;
      }
    });
    
    return {
      total: userMessages.length,
      dailyCounts,
      platformCounts,
      typeCounts
    };
  }
};

module.exports = {
  initDB,
  users,
  onboarding,
  socialMediaAccounts,
  messageTracking
};
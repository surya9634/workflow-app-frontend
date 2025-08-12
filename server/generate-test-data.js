const fs = require('fs');
const path = require('path');

// Database directory and file
const dbDir = path.join(__dirname, 'db');
const messageTrackingFile = path.join(dbDir, 'messageTracking.json');

// Read existing data
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

// Generate test messages
function generateTestMessages(userId) {
  const platforms = ['instagram', 'whatsapp', 'messenger'];
  const types = ['incoming', 'outgoing', 'ai_response'];
  const messages = [];
  
  // Generate 100 test messages over the last 30 days
  for (let i = 0; i < 100; i++) {
    // Random date within last 30 days
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 30));
    
    // Random time
    date.setHours(Math.floor(Math.random() * 24));
    date.setMinutes(Math.floor(Math.random() * 60));
    date.setSeconds(Math.floor(Math.random() * 60));
    
    const message = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5) + i,
      userId: userId,
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      type: types[Math.floor(Math.random() * types.length)],
      timestamp: date.toISOString(),
      conversationId: `conv-${Math.floor(Math.random() * 100)}`,
      messageId: `msg-${Math.floor(Math.random() * 1000)}`,
      content: `Test message ${i} for ${platforms[Math.floor(Math.random() * platforms.length)]}`
    };
    
    messages.push(message);
  }
  
  return messages;
}

// Main function
function main() {
  // Get a user ID from users.json
  const usersFile = path.join(dbDir, 'users.json');
  const users = readData(usersFile);
  
  if (users.length === 0) {
    console.log('No users found in database');
    return;
  }
  
  const userId = users[0].id;
  console.log(`Generating test data for user ID: ${userId}`);
  
  // Generate test messages
  const testMessages = generateTestMessages(userId);
  
  // Read existing messages
  const existingMessages = readData(messageTrackingFile);
  
  // Combine existing and new messages
  const allMessages = [...existingMessages, ...testMessages];
  
  // Write to file
  if (writeData(messageTrackingFile, allMessages)) {
    console.log(`Successfully generated ${testMessages.length} test messages`);
    console.log(`Total messages in database: ${allMessages.length}`);
  } else {
    console.log('Failed to write test data');
  }
}

main();
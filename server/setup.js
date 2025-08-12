// This script is used to set up the server for production
const fs = require('fs');
const path = require('path');

// Create .env file if it doesn't exist
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, `
NODE_ENV=production
PORT=3000
JWT_SECRET=your_jwt_secret_here
SESSION_SECRET=your_session_secret_here
  `.trim());
  console.log('✅ Created .env file with default values');
}

console.log('✅ Server setup complete');

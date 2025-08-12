require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Set NODE_ENV if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

// Import the local database functions
const { users: localUsers, onboarding: localOnboarding, socialMediaAccounts, messageTracking } = require('./db');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

// Verify token middleware
const authMiddleware = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      throw new Error();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = localUsers.findById(decoded.userId);
    
    if (!user) {
      throw new Error();
    }

    // Remove password from user object
    const { password, ...userWithoutPassword } = user;
    req.user = userWithoutPassword;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Please authenticate' });
  }
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 5000;

// Data storage for enhanced features
const users_social = new Map();
const configurations = new Map();
const usedAuthorizationCodes = new Set();
const whatsappMemory = {};
let assignedAI = { key: '', systemPrompt: '', waToken: '' };
let frontendSocket = null;

// Token expiration tracking
const tokenExpirations = new Map();

// Enhanced Configuration
const config = {
  instagram: {
    appId: process.env.INSTAGRAM_APP_ID || '1477959410285896',
    appSecret: process.env.INSTAGRAM_APP_SECRET || 'fc7fbca3fbecd5bc6b06331bc4da17c9',
    redirectUri: process.env.REDIRECT_URI || `http://localhost:${PORT || 5000}/auth/instagram/callback`
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID || '1256408305896903',
    appSecret: process.env.FACEBOOK_APP_SECRET || 'fc7fbca3fbecd5bc6b06331bc4da17c9',
    callbackUrl: process.env.FACEBOOK_CALLBACK || `http://localhost:${PORT || 5000}/auth/facebook/callback`
  },
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '657991800734493',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'verify-me'
  },
  webhook: {
    verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'WORKFLOW_VERIFY_TOKEN'
  }
};

// Webhook endpoints for Facebook and WhatsApp
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === config.webhook.verifyToken) {
      console.log('✅ Webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Handle WhatsApp webhook
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages' && change.value.messages) {
            for (const message of change.value.messages) {
              // Track incoming WhatsApp message
              messageTracking.create({
                userId: 'system', // WhatsApp messages don't have a specific user ID
                platform: 'whatsapp',
                type: 'incoming',
                conversationId: message.from,
                messageId: message.id,
                content: message.text?.body || message.type
              });
              
              console.log(`📥 Incoming WhatsApp message from ${message.from}: ${message.text?.body || message.type}`);
            }
          }
        }
      }
    }
    
    // Handle Facebook Messenger webhook
    else if (body.object === 'page') {
      for (const entry of body.entry) {
        for (const messagingEvent of entry.messaging) {
          if (messagingEvent.message) {
            // Track incoming Facebook Messenger message
            messageTracking.create({
              userId: 'system', // Messenger messages don't have a specific user ID
              platform: 'messenger',
              type: 'incoming',
              conversationId: messagingEvent.sender.id,
              messageId: messagingEvent.message.mid,
              content: messagingEvent.message.text
            });
            
            console.log(`📥 Incoming Messenger message from ${messagingEvent.sender.id}: ${messagingEvent.message.text}`);
          }
        }
      }
    }

    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

console.log('🚀 Starting Work Automation Platform');
console.log('=====================================');
console.log(`PORT: ${PORT}`);
console.log(`Instagram App ID: ${config.instagram.appId ? 'Set' : '❌ MISSING'}`);
console.log(`Facebook App ID: ${config.facebook.appId ? 'Set' : '❌ MISSING'}`);
console.log(`WhatsApp Phone ID: ${config.whatsapp.phoneNumberId ? 'Set' : '❌ MISSING'}`);
console.log('=====================================');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'work_automation_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport setup
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Updated Facebook Strategy with Instagram permissions
passport.use(new FacebookStrategy({
  clientID: config.facebook.appId,
  clientSecret: config.facebook.appSecret,
  callbackURL: config.facebook.callbackUrl,
  profileFields: ['id', 'displayName', 'emails'],
  enableProof: true,
  graphAPIVersion: 'v23.0',
  scope: ['instagram_basic', 'instagram_manage_messages', 'pages_show_list'],
  authType: 'reauthenticate',
  authNonce: 'secure_nonce_value' // Add a strong nonce in production
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  return done(null, profile);
}));

// WebSocket connection
io.on('connection', (socket) => {
  console.log('🌐 Frontend connected');
  frontendSocket = socket;
  socket.on('disconnect', () => {
    console.log('❌ Frontend disconnected');
    frontendSocket = null;
  });
});

// Utility functions
function serializeError(err) {
  if (!err) return 'Unknown error';
  if (err instanceof Error) {
    const errorObj = {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
    if (err.response) {
      errorObj.response = {
        status: err.response.status,
        data: err.response.data,
        headers: err.response.headers
      };
    }
    return JSON.stringify(errorObj, null, 2);
  }
  return JSON.stringify(err, null, 2);
}

async function getPageAccessToken(userToken) {
  try {
    const resp = await axios.get(`https://graph.facebook.com/v23.0/me/accounts?access_token=${userToken}`);
    if (resp.data?.data?.length) return resp.data.data[0];
    return null;
  } catch (err) {
    console.error("Page token error:", err);
    return null;
  }
}

async function getLastMessageTime(conversationId, accessToken) {
  try {
    const response = await axios.get(`https://graph.facebook.com/v23.0/${conversationId}/messages`, {
      params: {
        fields: 'created_time',
        limit: 1,
        access_token: accessToken
      }
    });
    
    return response.data.data[0]?.created_time || new Date(0);
  } catch (err) {
    console.error("Failed to get last message time:", err);
    return new Date(0);
  }
}

// Token validation and refresh functions
function isTokenValid(userId) {
  const expiration = tokenExpirations.get(userId);
  return expiration && Date.now() < expiration;
}

async function refreshInstagramToken(userId) {
  try {
    const user = users.get(userId);
    if (!user) {
      console.error(`❌ User ${userId} not found for token refresh`);
      return null;
    }

    console.log(`🔄 Attempting to refresh token for user ${userId}`);
    
    const response = await axios.get(`https://graph.instagram.com/refresh_access_token`, {
      params: {
        grant_type: 'ig_refresh_token',
        access_token: user.access_token
      },
      headers: {
        'X-IG-App-ID': config.instagram.appId
      }
    });

    if (response.data && response.data.access_token) {
      // Update user token and set new expiration (60 days)
      const newToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 5184000; // 60 days in seconds
      const expirationTime = Date.now() + expiresIn * 1000;
      
      console.log(`✅ Token refreshed for user ${userId}. New expiration: ${new Date(expirationTime).toISOString()}`);
      
      // Update user data
      user.access_token = newToken;
      users.set(userId, user);
      tokenExpirations.set(userId, expirationTime);
      
      return newToken;
    } else {
      console.error('⚠️ Token refresh failed: Invalid response', response.data);
      return null;
    }
  } catch (err) {
    console.error('🔥 Token refresh error:', serializeError(err));
    return null;
  }
}

// Routes

// Authentication endpoints
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
        errors: {
          email: !email ? 'Email is required' : undefined,
          password: !password ? 'Password is required' : undefined
        }
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
        errors: { email: 'Please enter a valid email address' }
      });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
        errors: { password: 'Password must be at least 6 characters long' }
      });
    }

    // Check if user already exists
    const existingUser = localUsers.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists',
        errors: { email: 'An account with this email already exists' }
      });
    }

    // Create new user
    const userData = {
      email,
      password, // The db.js create method will hash this automatically
      role: 'user',
      createdAt: new Date().toISOString(),
      onboardingCompleted: false
    };

    const newUser = localUsers.create(userData);
    
    // Generate JWT token
    const token = generateToken(newUser.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
      errors: { general: error.message || 'Something went wrong during signup' }
    });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
        errors: {
          email: !email ? 'Email is required' : undefined,
          password: !password ? 'Password is required' : undefined
        }
      });
    }

    // Find user by email
    const user = localUsers.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        errors: { general: 'Invalid email or password' }
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        errors: { general: 'Invalid email or password' }
      });
    }

    // Generate JWT token
    const token = generateToken(user.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      errors: { general: 'Something went wrong during signin' }
    });
  }
});

// Get current user (for authentication verification)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Dashboard
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Work Dashboard</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        .stat-number { font-size: 2rem; font-weight: bold; color: #667eea; }
        .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .action-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .btn { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
        .btn:hover { background: #5a67d8; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Work Dashboard</h1>
        <p>Manage your social media automation</p>
      </div>
      
      <div class="stats">
        <div class="stat-card">
          <div class="stat-number" id="instagram-users">0</div>
          <div>Instagram Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" id="configurations">0</div>
          <div>Active Automations</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" id="messages-sent">0</div>
          <div>Messages Sent</div>
        </div>
      </div>
      
      <div class="actions">
        <div class="action-card">
          <h3>📸 Instagram Automation</h3>
          <p>Set up keyword-based comment responses</p>
          <a href="/instagram-dashboard" class="btn">Manage Instagram</a>
        </div>
        
        <div class="action-card">
          <h3>💬 Messenger Management</h3>
          <p>View and respond to Facebook messages</p>
          <a href="/messenger-dashboard" class="btn">Manage Messenger</a>
        </div>
        
        <div class="action-card">
          <h3>📱 WhatsApp AI</h3>
          <p>Configure AI responses for WhatsApp</p>
          <a href="/whatsapp-dashboard" class="btn">Manage WhatsApp</a>
        </div>
      </div>
      
      <script>
        // Update stats
        fetch('/api/stats')
          .then(r => r.json())
          .then(data => {
            document.getElementById('instagram-users').textContent = data.instagramUsers || 0;
            document.getElementById('configurations').textContent = data.configurations || 0;
            document.getElementById('messages-sent').textContent = data.messagesSent || 0;
          });
      </script>
    </body>
    </html>
  `);
});

// API: Get stats
app.get('/api/stats', (req, res) => {
  res.json({
    instagramUsers: users.size,
    configurations: configurations.size,
    messagesSent: 0 // You can track this separately
  });
});

// INSTAGRAM ROUTES

// Instagram auth
app.get('/auth/instagram', (req, res) => {
  try {
    const authUrl = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${config.instagram.appId}&redirect_uri=${encodeURIComponent(config.instagram.redirectUri)}&response_type=code&scope=instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments%2Cinstagram_business_content_publish%2Cinstagram_business_manage_insights`;
    
    console.log('🔗 Redirecting to Instagram Auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (err) {
    console.error('🔥 Instagram login redirect error:', serializeError(err));
    res.status(500).send('Server error during Instagram login');
  }
});

// Instagram callback
app.get('/auth/instagram/callback', async (req, res) => {
  try {
    console.log('📬 Received Instagram callback:', req.query);
    const { code, error, error_reason } = req.query;
    
    if (error) {
      throw new Error(`OAuth error: ${error_reason || 'unknown'} - ${error}`);
    }

    if (!code) {
      throw new Error('Authorization code is missing');
    }

    if (usedAuthorizationCodes.has(code)) {
      console.warn('⚠️ Authorization code reuse detected:', code);
      for (const [userId, userData] of users.entries()) {
        if (userData.code === code) {
          console.log(`↩️ Redirecting reused code to existing user: ${userId}`);
          return res.redirect(`/instagram-dashboard?user_id=${userId}`);
        }
      }
      throw new Error('Authorization code has already been used');
    }
    
    usedAuthorizationCodes.add(code);

    // Exchange code for token
    const tokenResponse = await axios.post('https://api.instagram.com/oauth/access_token', {
      client_id: config.instagram.appId,
      client_secret: config.instagram.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: config.instagram.redirectUri,
      code: code
    }, {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-IG-App-ID': config.instagram.appId
      }
    });

    if (!tokenResponse.data || !tokenResponse.data.access_token) {
      throw new Error('Invalid token response: ' + JSON.stringify(tokenResponse.data));
    }

    console.log('✅ Token exchange successful');
    const access_token = tokenResponse.data.access_token;
    const user_id = String(tokenResponse.data.user_id);
    
    // Calculate token expiration (60 days from now)
    const expirationTime = Date.now() + 60 * 24 * 60 * 60 * 1000; // 60 days
    tokenExpirations.set(user_id, expirationTime);
    console.log(`⏱️ Token expiration set for user ${user_id}: ${new Date(expirationTime).toISOString()}`);

    // Get user profile
    const profileResponse = await axios.get(`https://graph.instagram.com/me`, {
      params: { 
        fields: 'id,username,profile_picture_url',
        access_token: access_token
      },
      headers: { 'X-IG-App-ID': config.instagram.appId }
    });

    console.log(`👋 User authenticated: ${profileResponse.data.username} (ID: ${user_id})`);
    
    const userData = {
      access_token,
      username: profileResponse.data.username,
      profile_pic: profileResponse.data.profile_picture_url,
      instagram_id: user_id,
      last_login: new Date(),
      code,
      platform: 'instagram'
    };
    users.set(user_id, userData);

    res.redirect(`/instagram-dashboard?user_id=${user_id}`);
  } catch (err) {
    console.error('🔥 Instagram authentication error:', serializeError(err));
    res.redirect(`/?error=instagram_auth_failed&message=${encodeURIComponent('Instagram login failed. Please try again.')}`);
  }
});

// Instagram dashboard
app.get('/instagram-dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Instagram Dashboard - Work</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; position: relative; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .btn { padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; }
        .btn:hover { background: #5a67d8; }
        .post-item { border: 1px solid #eee; padding: 15px; margin: 10px 0; border-radius: 8px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: 600; }
        .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        .token-status { background: #f8f9fa; padding: 8px 12px; border-radius: 5px; margin-top: 10px; border: 1px solid #e9ecef; }
        .valid-token { color: #28a745; font-weight: bold; }
        .expired-token { color: #dc3545; font-weight: bold; }
        .btn-warning { background: #ffc107; color: #333; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📸 Instagram Automation Dashboard</h1>
          <p>Manage your Instagram comment and DM automation</p>
          <a href="/dashboard" class="btn">← Back to Dashboard</a>
          <div id="token-status-container"></div>
        </div>
        
        <div class="grid">
          <div class="card">
            <h3>Your Posts</h3>
            <button onclick="loadPosts()" class="btn">Load Posts</button>
            <div id="posts-container"></div>
          </div>
          
          <div class="card">
            <h3>Setup Automation</h3>
            <div class="form-group">
              <label>Select Post:</label>
              <select id="post-select">
                <option value="">Select a post first</option>
              </select>
            </div>
            <div class="form-group">
              <label>Keyword Trigger:</label>
              <input type="text" id="keyword" placeholder="e.g., 'price', 'info', 'dm me'">
            </div>
            <div class="form-group">
              <label>Auto Response:</label>
              <textarea id="response" placeholder="Use {username} to mention the user" rows="4"></textarea>
            </div>
            <button onclick="saveConfiguration()" class="btn">Save Automation</button>
          </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
          <h3>Send Manual DM</h3>
          <div class="grid">
            <div class="form-group">
              <label>Username:</label>
              <input type="text" id="dm-username" placeholder="@username">
            </div>
            <div class="form-group">
              <label>Message:</label>
              <textarea id="dm-message" rows="3"></textarea>
            </div>
          </div>
          <button onclick="sendManualDM()" class="btn">Send DM</button>
        </div>
      </div>
      
      <script>
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('user_id');
        
        if (!userId) {
          alert('Please connect your Instagram account first');
          window.location.href = '/';
        }
        
        // Load token status
        async function loadTokenStatus() {
          try {
            const response = await fetch('/api/user-info?userId=' + userId);
            const userInfo = await response.json();
            
            const container = document.getElementById('token-status-container');
            container.innerHTML =
              '<div class="token-status">' +
                '<strong>Token Status:</strong> ' +
                '<span class="' + (userInfo.token_status === 'valid' ? 'valid-token' : 'expired-token') + '">' +
                  userInfo.token_status.toUpperCase() +
                '</span>' +
                '<br>' +
                '<small>Expires: ' + new Date(userInfo.token_expiration).toLocaleDateString() + '</small>' +
                '<button onclick="reconnectAccount()" class="btn btn-warning" style="margin-top: 8px; padding: 5px 10px;">' +
                  '<i class="fas fa-sync-alt"></i> Reconnect' +
                '</button>' +
              '</div>';
          } catch (error) {
            console.error('Error loading token status:', error);
          }
        }
        
        function reconnectAccount() {
          if (confirm('Your Instagram token has expired. Would you like to reconnect?')) {
            window.location.href = '/auth/instagram';
          }
        }
        
        async function loadPosts() {
          try {
            const response = await fetch(\`/api/instagram/posts?userId=\${userId}\`);
            const posts = await response.json();
            
            const container = document.getElementById('posts-container');
            const select = document.getElementById('post-select');
            
            container.innerHTML = '';
            select.innerHTML = '<option value="">Select a post</option>';
            
            posts.forEach(post => {
              const postDiv = document.createElement('div');
              postDiv.className = 'post-item';
              postDiv.innerHTML = \`
                <p><strong>Caption:</strong> \${post.caption.substring(0, 100)}...</p>
                <p><strong>Type:</strong> \${post.media_type}</p>
                <button onclick="viewComments('\${post.id}')" class="btn">View Comments</button>
              \`;
              container.appendChild(postDiv);
              
              const option = document.createElement('option');
              option.value = post.id;
              option.textContent = post.caption.substring(0, 50) + '...';
              select.appendChild(option);
            });
          } catch (error) {
            alert('Error loading posts: ' + error.message);
          }
        }
        
        async function viewComments(postId) {
          try {
            const response = await fetch(\`/api/instagram/comments?userId=\${userId}&postId=\${postId}\`);
            const comments = await response.json();
            
            let commentsText = 'Comments:\\n\\n';
            comments.forEach(comment => {
              commentsText += \`@\${comment.username}: \${comment.text}\\n\\n\`;
            });
            
            alert(commentsText || 'No comments found');
          } catch (error) {
            alert('Error loading comments: ' + error.message);
          }
        }
        
        async function saveConfiguration() {
          const postId = document.getElementById('post-select').value;
          const keyword = document.getElementById('keyword').value;
          const response = document.getElementById('response').value;
          
          if (!postId || !keyword || !response) {
            alert('Please fill all fields');
            return;
          }
          
          try {
            const result = await fetch('/api/instagram/configure', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, postId, keyword, response })
            });
            
            if (result.ok) {
              alert('Automation configured successfully!');
              document.getElementById('keyword').value = '';
              document.getElementById('response').value = '';
            } else {
              throw new Error('Configuration failed');
            }
          } catch (error) {
            alert('Error saving configuration: ' + error.message);
          }
        }
        
        async function sendManualDM() {
          const username = document.getElementById('dm-username').value.replace('@', '');
          const message = document.getElementById('dm-message').value;
          
          if (!username || !message) {
            alert('Please fill username and message');
            return;
          }
          
          try {
            const result = await fetch('/api/instagram/send-dm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, username, message })
            });
            
            if (result.ok) {
              alert('DM sent successfully!');
              document.getElementById('dm-username').value = '';
              document.getElementById('dm-message').value = '';
            } else {
              const errorData = await result.json();
              alert('Error: ' + errorData.error);
            }
          } catch (error) {
            alert('Error sending DM: ' + error.message);
          }
        }
        
        // Load token status on page load
        loadTokenStatus();
      </script>
      <script src="https://kit.fontawesome.com/a076d05399.js" crossorigin="anonymous"></script>
    </body>
    </html>
  `);
});

// Instagram API endpoints
app.get('/api/instagram/posts', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const response = await axios.get('https://graph.instagram.com/v23.0/me/media', {
      params: {
        fields: 'id,caption,media_url,media_type,thumbnail_url',
        access_token: user.access_token
      },
      headers: { 'X-IG-App-ID': config.instagram.appId }
    });

    const processedPosts = response.data.data.map(post => ({
      id: post.id,
      caption: post.caption || '',
      media_url: post.media_type === 'VIDEO' ? (post.thumbnail_url || '') : post.media_url,
      media_type: post.media_type
    }));

    res.json(processedPosts);
  } catch (err) {
    console.error('🔥 Instagram posts error:', serializeError(err));
    res.status(500).json({ error: 'Error fetching posts' });
  }
});

app.get('/api/instagram/comments', async (req, res) => {
  try {
    const { userId, postId } = req.query;
    if (!userId || !postId) {
      return res.status(400).json({ error: 'User ID and Post ID required' });
    }

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const response = await axios.get('https://graph.instagram.com/v23.0/' + postId + '/comments', {
      params: {
        fields: 'id,text,username,timestamp',
        access_token: user.access_token
      },
      headers: { 'X-IG-App-ID': config.instagram.appId }
    });

    res.json(response.data.data || []);
  } catch (err) {
    console.error('🔥 Instagram comments error:', serializeError(err));
    res.status(500).json({ error: 'Error fetching comments' });
  }
});

app.post('/api/instagram/configure', async (req, res) => {
  try {
    const { userId, postId, keyword, response } = req.body;
    if (!userId || !postId || !keyword || !response) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    configurations.set(userId, { postId, keyword, response });
    console.log('⚙️ Instagram configuration saved for user ' + userId + ' on post ' + postId);
    res.json({ success: true });
  } catch (err) {
    console.error('🔥 Instagram configuration error:', serializeError(err));
    res.status(500).json({ error: 'Configuration failed' });
  }
});

// Instagram DM sending with token validation and refresh
app.post('/api/instagram/send-dm', async (req, res) => {
  try {
    const { userId, username, message } = req.body;
    if (!userId || !username || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check if token is valid or needs refresh
    if (!isTokenValid(userId)) {
      console.warn('⚠️ Token for user ' + userId + ' is expired or invalid. Attempting refresh...');
      const newToken = await refreshInstagramToken(userId);
      
      if (!newToken) {
        return res.status(401).json({ 
          error: 'Token expired and refresh failed. Please reconnect your Instagram account.',
          code: 'TOKEN_REFRESH_FAILED'
        });
      }
    }

    console.log('✉️ Sending Instagram DM to ' + username + ': ' + message.substring(0, 50) + '...');
    
    // Attempt to send DM
    const response = await axios.post('https://graph.facebook.com/v23.0/' + user.instagram_id + '/messages', {
      recipient: { username: username },
      message: { text: message }
    }, {
      headers: {
        'Authorization': 'Bearer ' + user.access_token,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log('✅ Instagram DM sent to ' + username);
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('🔥 Instagram DM error:', serializeError(err));
    
    // Enhanced error handling
    let errorMessage = 'Failed to send DM';
    let errorCode = 'UNKNOWN_ERROR';
    
    if (err.response && err.response.data) {
      if (err.response.data.error && err.response.data.error.message) {
        errorMessage = err.response.data.error.message;
        errorCode = err.response.data.error.code || errorCode;
        
        // Handle specific Instagram API errors
        if (err.response.data.error.error_subcode === 2108006) {
          errorMessage = "User doesn't allow message requests from businesses";
        } else if (err.response.data.error.code === 10) {
          errorMessage = "Message blocked by Instagram's content policies";
        } else if (err.response.data.error.code === 190) {
          errorMessage = "Invalid access token - Please reconnect your Instagram account";
          errorCode = 'INVALID_TOKEN';
        }
      }
    } else if (err.code === 'ECONNABORTED') {
      errorMessage = "Request timed out. Please try again.";
      errorCode = 'TIMEOUT';
    }
    
    res.status(500).json({ error: errorMessage, code: errorCode });
  }
});

// Add token status to user info endpoint
app.get('/api/user-info', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tokenStatus = isTokenValid(userId) ? 'valid' : 'expired';
    const expirationTime = tokenExpirations.get(userId);
    
    res.json({
      username: user.username,
      instagram_id: user.instagram_id,
      profile_pic: user.profile_pic,
      platform: user.platform,
      last_login: user.last_login,
      token_status: tokenStatus,
      token_expiration: expirationTime || null
    });
  } catch (err) {
    console.error('🔥 User info error:', serializeError(err));
    res.status(500).json({ error: 'Server error' });
  }
});

// MESSENGER ENDPOINTS
app.get('/api/messenger/conversations', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Simulate conversations (replace with Facebook Graph API if needed)
    res.json([
      { id: 'conv1', name: 'John Doe' },
      { id: 'conv2', name: 'Jane Smith' }
    ]);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching Messenger conversations' });
  }
});

app.get('/api/messenger/messages', async (req, res) => {
  try {
    const { userId, conversationId } = req.query;
    if (!userId || !conversationId) return res.status(400).json({ error: 'Missing required fields' });

    // Simulate messages (replace with Facebook Graph API if needed)
    res.json([
      { id: 'msg1', sender_name: 'John Doe', text: 'Hello!' },
      { id: 'msg2', sender_name: 'You', text: 'Hi there!' }
    ]);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching Messenger messages' });
  }
});

app.post('/api/messenger/send-message', async (req, res) => {
  try {
    const { userId, conversationId, message } = req.body;
    if (!userId || !conversationId || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // TODO: Integrate with Facebook Messenger API here
    // For now, just simulate success:
    console.log(`Sending Messenger message to ${conversationId}: ${message}`);
    
    // Track the message
    messageTracking.create({
      userId: userId,
      platform: 'messenger',
      type: 'outgoing',
      conversationId: conversationId,
      messageId: Date.now().toString(),
      content: message
    });
    
    res.json({ success: true, to: conversationId, message });
  } catch (err) {
    console.error('Messenger message error:', err);
    res.status(500).json({ error: 'Failed to send Messenger message' });
  }
});

// Sign Up Route
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = localUsers.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        errors: { email: 'An account with this email already exists' }
      });
    }

    // Create new user
    const user = localUsers.create({ email, password });

    // Generate token
    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Sign In Route
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = localUsers.findOne({ email });
    if (!user) {
      return res.status(401).json({
        errors: { email: 'Invalid email or password' }
      });
    }

    // Compare password
    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        errors: { password: 'Invalid email or password' }
      });
    }

    // Generate token
    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Signed in successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted
      }
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
});
// ONBOARDING ENDPOINTS

// Submit Onboarding Data
app.post('/api/onboarding', authMiddleware, (req, res) => {
  try {
    const { userId, ...onboardingData } = req.body;

    // Verify that the authenticated user matches the userId
    if (req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only submit your own onboarding data.'
      });
    }

    // Check if user has already completed onboarding
    const existingOnboarding = localOnboarding.findOne({ userId });
    if (existingOnboarding) {
      return res.status(400).json({
        success: false,
        message: 'Onboarding has already been completed for this user.'
      });
    }

    // Validate required fields
    const requiredFields = [
      'businessName', 'userName', 'businessDescription', 'idealCustomer',
      'leadSources', 'dealSize', 'communicationPlatforms', 'leadHandling',
      'salesGoal', 'urgency'
    ];

    const missingFields = requiredFields.filter(field => {
      const value = onboardingData[field];
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return !value || (typeof value === 'string' && value.trim() === '');
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Create onboarding record
    const newOnboarding = localOnboarding.create({
      userId,
      ...onboardingData
    });

    // Update user's onboarding status
    localUsers.updateById(userId, {
      onboardingCompleted: true,
      name: onboardingData.userName // Update user's name from onboarding
    });

    res.status(201).json({
      success: true,
      message: 'Onboarding completed successfully',
      onboarding: {
        id: newOnboarding.id,
        completedAt: newOnboarding.completedAt
      }
    });

  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get onboarding data (protected route)
app.get('/api/onboarding/:userId', authMiddleware, (req, res) => {
  try {
    const { userId } = req.params;

    // Verify that the authenticated user matches the userId or is admin
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied.'
      });
    }

    const onboardingData = localOnboarding.findOne({ userId });

    if (!onboardingData) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding data not found'
      });
    }

    // Get user data to populate
    const userData = localUsers.findById(userId);
    if (userData) {
      onboardingData.user = {
        email: userData.email,
        name: userData.name
      };
    }

    res.json({
      success: true,
      onboarding: onboardingData
    });

  } catch (error) {
    console.error('Get onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
});

// Get connected social media accounts
app.get('/api/social-media/accounts', authMiddleware, (req, res) => {
  try {
    const accounts = socialMediaAccounts.find({ userId: req.user.id, isActive: true });
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch social media accounts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Disconnect social media account
app.delete('/api/social-media/accounts/:accountId', authMiddleware, (req, res) => {
  try {
    const { accountId } = req.params;
    
    const account = socialMediaAccounts.findOne({
      id: accountId,
      userId: req.user.id,
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    
    const updatedAccount = socialMediaAccounts.updateById(accountId, { isActive: false });
    
    res.json({
      success: true,
      message: 'Account disconnected successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Send Facebook message
app.post('/api/social-media/facebook/message', authMiddleware, async (req, res) => {
  try {
    const { accountId, recipientId, message } = req.body;
    
    // Verify account belongs to user
    const account = socialMediaAccounts.findOne({
      id: accountId,
      userId: req.user.id,
      platform: 'facebook',
      isActive: true,
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Facebook account not found'
      });
    }
    
    // TODO: Integrate with Facebook Messenger API here
    // For now, just simulate success:
    console.log(`Sending Facebook message to ${recipientId}: ${message}`);
    
    // Track the message
    messageTracking.create({
      userId: req.user.id,
      platform: 'messenger',
      type: 'outgoing',
      conversationId: accountId,
      messageId: Date.now().toString(),
      content: message
    });
    
    res.json({
      success: true,
      message: 'Message sent successfully'
    });
  } catch (error) {
    console.error('Facebook message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Send Instagram message
app.post('/api/social-media/instagram/message', authMiddleware, async (req, res) => {
  try {
    const { accountId, recipientId, message } = req.body;
    
    // Verify account belongs to user
    const account = socialMediaAccounts.findOne({
      id: accountId,
      userId: req.user.id,
      platform: 'instagram',
      isActive: true,
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Instagram account not found'
      });
    }
    
    // TODO: Integrate with Instagram API here
    // For now, just simulate success:
    console.log(`Sending Instagram message to ${recipientId}: ${message}`);
    
    // Track the message
    messageTracking.create({
      userId: req.user.id,
      platform: 'instagram',
      type: 'outgoing',
      conversationId: accountId,
      messageId: Date.now().toString(),
      content: message
    });
    
    res.json({
      success: true,
      message: 'Message sent successfully'
    });
  } catch (error) {
    console.error('Instagram message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get real conversations for MessengerChat
app.get('/api/conversations', authMiddleware, (req, res) => {
  try {
    // Get all social media accounts for the user
    const accounts = socialMediaAccounts.find({ userId: req.user.id, isActive: true });
    
    // Generate mock conversations based on accounts
    const conversations = [];
    accounts.forEach((account, index) => {
      // Generate 3-5 conversations per account
      const conversationCount = Math.floor(Math.random() * 3) + 3;
      for (let i = 0; i < conversationCount; i++) {
        const isOnline = Math.random() > 0.5;
        const leadScore = Math.floor(Math.random() * 40) + 60; // 60-100
        
        conversations.push({
          id: `${account.id}-${i}`,
          name: `${account.platform.charAt(0).toUpperCase() + account.platform.slice(1)} User ${index * 10 + i}`,
          avatar: `https://ui-avatars.com/api/?name=${account.platform.charAt(0).toUpperCase() + account.platform.slice(1)}+User+${index * 10 + i}&background=random`,
          lastMessage: `Hello, I'm interested in your ${account.platform} services.`,
          timestamp: `${Math.floor(Math.random() * 60)} min`,
          isOnline: isOnline,
          location: `${['New York', 'London', 'Tokyo', 'Sydney', 'Berlin'][Math.floor(Math.random() * 5)]}, ${['USA', 'UK', 'Japan', 'Australia', 'Germany'][Math.floor(Math.random() * 5)]}`,
          bio: `Interested in ${account.platform} services and looking for more information.`,
          intent: `Inquiry about ${account.platform} services`,
          stage: ['new', 'contacted', 'qualified', 'demo_completed', 'pricing_inquiry', 'negotiation', 'converted'][Math.floor(Math.random() * 7)],
          status: ['open', 'snoozed', 'closed'][Math.floor(Math.random() * 3)],
          assignedTo: Math.random() > 0.7 ? 'Me' : null,
          email: `user${index * 10 + i}@${account.platform}.com`,
          phone: `+1-555-${Math.floor(Math.random() * 9000) + 1000}`,
          company: `${account.platform.charAt(0).toUpperCase() + account.platform.slice(1)} Client ${index * 10 + i}`,
          leadScore: leadScore,
          lastUpdated: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString(), // Random date in last 7 days
          tags: [account.platform, 'lead', leadScore > 80 ? 'high-value' : 'standard']
        });
      }
    });
    
    res.json({
      success: true,
      conversations: conversations
    });
  } catch (error) {
    console.error('Conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get messages for a specific conversation
app.get('/api/conversations/:conversationId/messages', authMiddleware, (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // Generate mock messages
    const messages = [];
    const messageCount = Math.floor(Math.random() * 10) + 5; // 5-15 messages
    
    for (let i = 0; i < messageCount; i++) {
      const isCustomer = Math.random() > 0.4; // 60% customer messages, 40% AI replies
      const timestamp = new Date(Date.now() - (messageCount - i) * 60000); // Staggered timestamps
      
      messages.push({
        id: `${conversationId}-msg-${i}`,
        sender: isCustomer ? 'customer' : 'ai',
        message: isCustomer
          ? `Hello, I'm interested in your services. Can you tell me more about your ${['pricing', 'features', 'implementation', 'support'][Math.floor(Math.random() * 4)]}?`
          : `Thank you for your inquiry! Our ${['pricing starts at $99/month', 'features include advanced analytics', 'implementation takes 1-2 weeks', 'support is available 24/7'][Math.floor(Math.random() * 4)]}. Would you like me to schedule a demo?`,
        timestamp: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRead: true
      });
    }
    
    res.json({
      success: true,
      messages: messages
    });
  } catch (error) {
    console.error('Messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Send a message in a conversation
app.post('/api/conversations/:conversationId/messages', authMiddleware, (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message } = req.body;
    
    // Create the new message
    const newMessage = {
      id: `${conversationId}-msg-${Date.now()}`,
      sender: 'customer',
      message: message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false
    };
    
    // Simulate AI response after a delay
    setTimeout(() => {
      const aiResponse = {
        id: `${conversationId}-msg-${Date.now()}-ai`,
        sender: 'ai',
        message: `Thanks for your message! I'm an AI assistant. ${['How can I help you today?', 'What specific information are you looking for?', 'Would you like me to schedule a demo?', 'Our pricing starts at $99/month.'][Math.floor(Math.random() * 4)]}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRead: true
      };
      
      // In a real implementation, you would emit this to the frontend via socket.io
      console.log(`AI Response to ${conversationId}:`, aiResponse.message);
    }, 1000);
    
    res.json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ANALYTICS ENDPOINTS
// Get analytics data for the dashboard
app.get('/api/analytics/dashboard', authMiddleware, (req, res) => {
  try {
    // Get all social media accounts for the user
    const accounts = socialMediaAccounts.find({ userId: req.user.id, isActive: true });
    
    // Get message tracking stats for the user
    const stats = messageTracking.getStats(req.user.id, 30); // Last 30 days
    
    // Initialize counters
    let instagramCount = 0;
    let whatsappCount = 0;
    let messengerCount = 0;
    
    // Count accounts by platform
    accounts.forEach(account => {
      if (account.platform === 'instagram') {
        instagramCount++;
      } else if (account.platform === 'whatsapp') {
        whatsappCount++;
      } else if (account.platform === 'messenger') {
        messengerCount++;
      }
    });
    
    // Calculate response rate based on message types
    const totalMessages = stats.typeCounts.incoming + stats.typeCounts.outgoing + stats.typeCounts.ai_response;
    const responseRate = totalMessages > 0 ? Math.min(100, Math.round((stats.typeCounts.outgoing + stats.typeCounts.ai_response) / totalMessages * 100)) : 0;
    
    // Calculate average response time (simplified)
    const averageResponseTime = totalMessages > 0 ? (0.5 + Math.random() * 2).toFixed(1) + 's' : '0s';
    
    // Calculate AI accuracy score
    const aiAccuracyScore = Math.min(100, Math.max(80, 90 + Math.floor(Math.random() * 10)));
    
    // Generate last 6 months of data for workflow performance
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const messagesProcessedData = [];
    const aiResponsesData = [];
    
    // Generate realistic data based on message stats
    for (let i = 0; i < months.length; i++) {
      const baseValue = Math.max(100, Math.floor(stats.total / 6));
      const variance = Math.floor(baseValue * 0.3);
      messagesProcessedData.push(Math.max(0, baseValue + Math.floor(Math.random() * variance * 2) - variance));
      aiResponsesData.push(Math.max(0, Math.floor(messagesProcessedData[i] * 0.7) + Math.floor(Math.random() * variance) - Math.floor(variance / 2)));
    }
    
    // Generate weekly engagement data
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const instagramEngagement = [85, 90, 88, 92];
    const whatsappEngagement = [78, 82, 85, 88];
    const messengerEngagement = [72, 75, 80, 83];
    
    // Generate response types data
    const autoReplyCount = stats.typeCounts.ai_response;
    const smartReplyCount = Math.floor(stats.typeCounts.outgoing * 0.3);
    const humanReplyCount = stats.typeCounts.outgoing - smartReplyCount;
    
    // Generate recent activity feed
    const activityFeed = [];
    
    // Add recent activities based on message tracking
    if (stats.total > 0) {
      activityFeed.push({
        platform: 'System',
        action: `Processed ${stats.total} messages in the last 30 days`,
        time: 'Just now',
        status: 'success'
      });
      
      if (stats.typeCounts.ai_response > 0) {
        activityFeed.push({
          platform: 'AI',
          action: `Generated ${stats.typeCounts.ai_response} automated responses`,
          time: '5 minutes ago',
          status: 'success'
        });
      }
      
      if (stats.platformCounts.instagram > 0) {
        activityFeed.push({
          platform: 'Instagram',
          action: `Handled ${stats.platformCounts.instagram} Instagram interactions`,
          time: '10 minutes ago',
          status: 'success'
        });
      }
      
      if (stats.platformCounts.whatsapp > 0) {
        activityFeed.push({
          platform: 'WhatsApp',
          action: `Processed ${stats.platformCounts.whatsapp} WhatsApp messages`,
          time: '15 minutes ago',
          status: 'success'
        });
      }
    } else {
      // Default activities if no messages
      activityFeed.push({
        platform: 'System',
        action: 'System initialized and ready',
        time: 'Just now',
        status: 'success'
      });
      
      activityFeed.push({
        platform: 'AI',
        action: 'AI engine ready for interactions',
        time: '5 minutes ago',
        status: 'success'
      });
    }
    
    // Generate analytics data
    const analyticsData = {
      metrics: {
        totalMessagesProcessed: stats.total,
        responseRate: responseRate,
        averageResponseTime: averageResponseTime,
        aiAccuracyScore: aiAccuracyScore
      },
      workflowPerformance: {
        labels: months,
        datasets: [
          {
            label: 'Messages Processed',
            data: messagesProcessedData,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
          },
          {
            label: 'AI Responses',
            data: aiResponsesData,
            borderColor: 'rgb(16, 185, 129)',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
          },
        ],
      },
      platformDistribution: {
        labels: ['Instagram', 'WhatsApp', 'Messenger'],
        datasets: [
          {
            data: [instagramCount, whatsappCount, messengerCount],
            backgroundColor: [
              'rgb(236, 72, 153)',
              'rgb(34, 197, 94)',
              'rgb(59, 130, 246)',
            ],
            borderWidth: 0,
          },
        ],
      },
      engagementRate: {
        labels: weeks,
        datasets: [
          {
            label: 'Instagram',
            data: instagramEngagement,
            borderColor: 'rgb(236, 72, 153)',
            backgroundColor: 'rgba(236, 72, 153, 0.2)',
            fill: true,
            tension: 0.4,
          },
          {
            label: 'WhatsApp',
            data: whatsappEngagement,
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            fill: true,
            tension: 0.4,
          },
          {
            label: 'Messenger',
            data: messengerEngagement,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            fill: true,
            tension: 0.4,
          },
        ],
      },
      responseTypes: {
        labels: ['Auto Reply', 'Smart Reply', 'Human Reply'],
        datasets: [
          {
            data: [autoReplyCount, smartReplyCount, humanReplyCount],
            backgroundColor: [
              'rgb(59, 130, 246)',
              'rgb(16, 185, 129)',
              'rgb(245, 158, 11)',
            ],
            borderWidth: 0,
          },
        ],
      },
      activityFeed: activityFeed.slice(0, 4) // Limit to 4 activities
    };
    
    res.json({
      success: true,
      data: analyticsData
    });
  } catch (error) {
    console.error('Analytics data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// INSTAGRAM AUTOMATION ENDPOINTS

// Instagram OAuth
app.get('/auth/instagram', (req, res) => {
  try {
    const authUrl = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${config.instagram.appId}&redirect_uri=${encodeURIComponent(config.instagram.redirectUri)}&response_type=code&scope=instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments%2Cinstagram_business_content_publish%2Cinstagram_business_manage_insights`;
    
    console.log('🔗 Redirecting to Instagram Auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (err) {
    console.error('🔥 Instagram login redirect error:', err);
    res.status(500).send('Server error during Instagram login');
  }
});

// Instagram callback
app.get('/auth/instagram/callback', async (req, res) => {
  try {
    console.log('📬 Received Instagram callback:', req.query);
    const { code, error, error_reason } = req.query;
    
    if (error) {
      throw new Error(`OAuth error: ${error_reason || 'unknown'} - ${error}`);
    }

    if (!code) {
      throw new Error('Authorization code is missing');
    }

    if (usedAuthorizationCodes.has(code)) {
      console.warn('⚠️ Authorization code reuse detected:', code);
      for (const [userId, userData] of users_social.entries()) {
        if (userData.code === code) {
          console.log(`↩️ Redirecting reused code to existing user: ${userId}`);
          return res.redirect(`/instagram-dashboard?user_id=${userId}`);
        }
      }
      throw new Error('Authorization code has already been used');
    }
    
    usedAuthorizationCodes.add(code);

    // Exchange code for token
    const tokenResponse = await axios.post('https://api.instagram.com/oauth/access_token', {
      client_id: config.instagram.appId,
      client_secret: config.instagram.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: config.instagram.redirectUri,
      code: code
    }, {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-IG-App-ID': config.instagram.appId
      }
    });

    if (!tokenResponse.data || !tokenResponse.data.access_token) {
      throw new Error('Invalid token response: ' + JSON.stringify(tokenResponse.data));
    }

    console.log('✅ Token exchange successful');
    const access_token = tokenResponse.data.access_token;
    const user_id = String(tokenResponse.data.user_id);
    
    // Calculate token expiration (60 days from now)
    const expirationTime = Date.now() + 60 * 24 * 60 * 60 * 1000; // 60 days
    tokenExpirations.set(user_id, expirationTime);
    console.log(`⏱️ Token expiration set for user ${user_id}: ${new Date(expirationTime).toISOString()}`);

    // Get user profile
    const profileResponse = await axios.get(`https://graph.instagram.com/me`, {
      params: { 
        fields: 'id,username,profile_picture_url',
        access_token: access_token
      },
      headers: { 'X-IG-App-ID': config.instagram.appId }
    });

    console.log(`👋 User authenticated: ${profileResponse.data.username} (ID: ${user_id})`);
    
    const userData = {
      access_token,
      username: profileResponse.data.username,
      profile_pic: profileResponse.data.profile_picture_url,
      instagram_id: user_id,
      last_login: new Date(),
      code,
      platform: 'instagram'
    };
    users_social.set(user_id, userData);

    res.redirect(`/instagram-dashboard?user_id=${user_id}`);
  } catch (err) {
    console.error('🔥 Instagram authentication error:', err);
    res.redirect(`/?error=instagram_auth_failed&message=${encodeURIComponent('Instagram login failed. Please try again.')}`);
  }
});

// Instagram posts API
app.get('/api/instagram/posts', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const user = users_social.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const response = await axios.get(`https://graph.instagram.com/v23.0/me/media`, {
      params: {
        fields: 'id,caption,media_url,media_type,thumbnail_url',
        access_token: user.access_token
      },
      headers: { 'X-IG-App-ID': config.instagram.appId }
    });

    const processedPosts = response.data.data.map(post => ({
      id: post.id,
      caption: post.caption || '',
      media_url: post.media_type === 'VIDEO' ? (post.thumbnail_url || '') : post.media_url,
      media_type: post.media_type
    }));

    res.json(processedPosts);
  } catch (err) {
    console.error('🔥 Instagram posts error:', err);
    res.status(500).json({ error: 'Error fetching posts' });
  }
});

// Instagram DM sending
app.post('/api/instagram/send-dm', async (req, res) => {
  try {
    const { userId, username, message } = req.body;
    if (!userId || !username || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = users_social.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    console.log(`✉️ Sending Instagram DM to ${username}: ${message.substring(0, 50)}...`);
    
    const response = await axios.post(`https://graph.facebook.com/v23.0/${user.instagram_id}/messages`, {
      recipient: { username: username },
      message: { text: message }
    }, {
      headers: {
        'Authorization': `Bearer ${user.access_token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log(`✅ Instagram DM sent to ${username}`);
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('🔥 Instagram DM error:', err);
    res.status(500).json({ error: 'Failed to send DM' });
  }
});

// Enhanced dashboard with social media stats
app.get('/api/social-stats', (req, res) => {
  res.json({
    instagramUsers: users_social.size,
    configurations: configurations.size,
    messagesSent: 0,
    platforms: {
      instagram: Array.from(users_social.values()).filter(u => u.platform === 'instagram').length,
      facebook: Array.from(users_social.values()).filter(u => u.platform === 'facebook').length,
      whatsapp: 1 // Placeholder
    }
  });
});

// START SERVER
server.listen(PORT, () => {
  console.log('=====================================');
  console.log('🚀 Work Automation Platform Started');
  console.log('📡 Server running on port ' + PORT);
  console.log('🔗 Instagram Redirect: ' + config.instagram.redirectUri);
  console.log('🔗 Facebook Callback: ' + config.facebook.callbackUrl);
  
  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    console.log('🌐 Live at: https://' + process.env.RENDER_EXTERNAL_HOSTNAME);
  }
  
  console.log('=====================================');
  console.log('✅ Platforms Ready:');
  console.log('   📸 Instagram - Comment & DM automation');
  console.log('   💬 Facebook Messenger - Chat management');
  console.log('   📱 WhatsApp - AI-powered responses');
  console.log('=====================================');
// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  // More robust path resolution for frontend build
  const possiblePaths = [
    path.join(__dirname, '../work-flow/dist'),  // Development structure
    path.join(__dirname, '../../work-flow/dist'),  // Alternative structure
    path.join(__dirname, '../dist'),  // Build output in backend directory
    path.join(process.cwd(), 'work-flow/dist'),  // Relative to current working directory
    path.join(process.cwd(), 'dist')  // Direct dist folder
  ];
  
  let frontendPath = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      frontendPath = possiblePath;
      break;
    }
  }
  
  if (frontendPath) {
    console.log('Serving frontend from:', frontendPath);
    app.use(express.static(frontendPath));
    
    // Handle React routing, return all requests to React app
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  } else {
    console.log('Frontend build directory not found, serving backend only');
    console.log('Checked paths:', possiblePaths);
    // Fallback to backend UI if frontend not built
    app.get('/', (req, res) => {
      res.send(`
        <h1>Work Automation Platform</h1>
        <p>Backend server is running, but frontend is not built.</p>
        <p><a href="/dashboard">Go to Backend Dashboard</a></p>
      `);
    });
  }
} else {
  // In development, serve a simple message
  app.get('/', (req, res) => {
    res.send(`
      <h1>Work Automation Platform</h1>
      <p>Backend server is running. For frontend, run the React development server.</p>
      <p><a href="/dashboard">Go to Backend Dashboard</a></p>
    `);
  });
}
});
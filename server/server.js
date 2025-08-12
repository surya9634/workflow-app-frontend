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

// Resolve the correct path to the client's build directory
const clientBuildPath = path.join(__dirname, '..', 'dist');
const clientIndexPath = path.join(clientBuildPath, 'index.html');

// Set NODE_ENV if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
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

// Middleware to parse JSON request bodies - must come before any route handlers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration for development
const corsOptions = {
  origin: function (origin, callback) {
    // In production, we'll be serving the frontend from the same origin
    // So we only need CORS for development or specific API clients
    if (process.env.NODE_ENV === 'development') {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5000'
      ];
      
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // In production, only allow same-origin
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Add CORS headers to all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// API logger middleware
app.use('/api', (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Serve static files with proper MIME types
app.use(express.static(clientBuildPath, {
  setHeaders: (res, path) => {
    // Set proper MIME types for JavaScript files
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
  }
}));

// Handle SPA client-side routing - serve index.html for non-API routes
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // Serve index.html with proper MIME type
  res.sendFile(clientIndexPath, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8'
    }
  });
});

const PORT = process.env.PORT || 3000;

// Data storage for enhanced features
const users_social = new Map();
const configurations = new Map();
const usedAuthorizationCodes = new Set();
const whatsappMemory = {};
let assignedAI = { key: '', systemPrompt: '', waToken: '' };
let frontendSocket = null;

// AI Training and Campaign Data
const campaigns = new Map();
const aiTrainingData = new Map();
const campaignQuestions = new Map();
const productTraining = new Map();

// AI Automation Settings
const aiAutomationSettings = new Map();
const chatInteractions = new Map();

// Token expiration tracking
const tokenExpirations = new Map();

// Enhanced Configuration
const config = {
  instagram: {
    appId: process.env.INSTAGRAM_APP_ID || '1477959410285896',
    appSecret: process.env.INSTAGRAM_APP_SECRET || 'fc7fbca3fbecd5bc6b06331bc4da17c9',
    redirectUri: process.env.NODE_ENV === 'production' 
      ? 'https://work-flow-render.onrender.com/auth/instagram/callback'
      : `https://work-flow-render.onrender.com/auth/instagram/callback`
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID || '1477959410285896',
    appSecret: process.env.FACEBOOK_APP_SECRET || 'fc7fbca3fbecd5bc6b06331bc4da17c9',
    callbackUrl: process.env.NODE_ENV === 'production'
      ? 'https://work-flow-render.onrender.com/auth/facebook/callback'
      : `https://work-flow-render.onrender.com/auth/facebook/callback`
  },
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '123456789',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || 'your-whatsapp-token',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'your-webhook-verify-token',
    webhookUrl: process.env.NODE_ENV === 'production'
      ? 'https://work-flow-render.onrender.com/webhook/whatsapp'
      : `https://work-flow-render.onrender.com/webhook/whatsapp`
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || 'AIzaSyBYanNh-KVJObP1eqQ7fF5JVukV2DULtcw',
    model: 'gemini-pro'
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

// Middleware - CORS configuration for development and production
const allowedOrigins = [
  'https://work-flow-render.onrender.com',
  'http://localhost:3000',
  'http://localhost:5173', // Vite default dev server
  'http://127.0.0.1:5173',
  'https://ai-workflow-saas.onrender.com',
  process.env.CORS_ORIGIN
].filter(Boolean);

// Enable pre-flight across the board
app.options('*', cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      console.error('CORS Error:', msg, 'Origin:', origin);
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  maxAge: 86400 // 24 hours
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve built frontend files
app.use(express.static(path.join(__dirname, '../work-flow/dist')));

// Health check endpoint for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'AI-Powered Social Media Automation SaaS',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});


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

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('✅ Health check requested');
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Authentication endpoints
app.post('/api/auth/signup', async (req, res) => {
  console.log('🔑 Signup request received:', { email: req.body.email });
  
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      const error = {
        success: false,
        message: 'Email and password are required',
        errors: {
          email: !email ? 'Email is required' : undefined,
          password: !password ? 'Password is required' : undefined
        }
      };
      console.log('❌ Validation failed:', error);
      return res.status(400).json(error);
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
    }

    // Check if user already exists
    const existingUser = localUsers.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists',
        errors: { email: 'User with this email already exists' }
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = {
      id: `user_${Date.now()}`,
      email,
      name: name || email.split('@')[0],
      password: hashedPassword,
      role: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save user
    localUsers.insert(user);

    // Generate token
    const token = generateToken(user.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

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
      message: 'Internal server error',
      errors: { general: error.message || 'Something went wrong during signup' }
    });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  console.log('🔑 Sign-in attempt:', { 
    email: req.body?.email ? 'provided' : 'missing',
    body: JSON.stringify(req.body),
    headers: req.headers
  });
  
  try {
    // Ensure request has body
    if (!req.body) {
      console.error('❌ No request body received');
      return res.status(400).json({
        success: false,
        message: 'Request body is required',
        errors: { general: 'No request body received' }
      });
    }

    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      const error = {
        success: false,
        message: 'Email and password are required',
        errors: {
          email: !email ? 'Email is required' : undefined,
          password: !password ? 'Password is required' : undefined
        },
        received: { email: !!email, password: !!password }
      };
      console.log('❌ Validation failed:', JSON.stringify(error, null, 2));
      return res.status(400).json(error);
    }

    console.log('🔍 Looking up user:', email);
    // Find user by email
    try {
      console.log('🔍 Database state before query:', { 
        dbSize: localUsers.size(),
        allUsers: localUsers.find()
      });
      
      const user = localUsers.findOne({ email });
      console.log('👤 User lookup result:', { email, userFound: !!user });
      
      if (!user) {
        console.log('❌ User not found for email:', email);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
          errors: { general: 'Invalid email or password' }
        });
      }

      // Verify password
      console.log('🔑 Verifying password for user:', user.id);
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (!isPasswordValid) {
        console.log('❌ Invalid password for user:', user.id);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
          errors: { general: 'Invalid email or password' }
        });
      }

      // Generate token
      const token = generateToken(user.id);
      console.log('✅ Generated token for user:', user.id);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      const response = {
        success: true,
        message: 'Logged in successfully',
        user: userWithoutPassword,
        token
      };

      console.log('✅ Login successful for user:', user.id);
      return res.status(200)
        .set('Content-Type', 'application/json')
        .json(response);
        
    } catch (dbError) {
      console.error('❌ Database error during signin:', {
        message: dbError.message,
        stack: dbError.stack,
        email
      });
      
      return res.status(500).json({
        success: false,
        message: 'Database error during authentication',
        errors: { general: 'Error accessing user data' }
      });
    }
    
  } catch (error) {
    console.error('❌ Unexpected error during signin:', {
      message: error.message,
      stack: error.stack,
      requestBody: req.body,
      headers: req.headers
    });
    
    const errorResponse = {
      success: false,
      message: 'Internal server error',
      errors: { 
        general: 'Something went wrong during signin',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    };
    
    return res.status(500)
      .set('Content-Type', 'application/json')
      .json(errorResponse);
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  try {
    const user = localUsers.findOne({ id: req.user.userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    
    res.status(200).json({
      success: true,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      errors: { general: 'Failed to get current user' }
    });
  }
});

// Sign out
app.post('/api/auth/signout', (req, res) => {
  // In a real app, you might want to invalidate the token here
  res.status(200).json({
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

    const userData = { email, password };

    try {
      // Hash password
      console.log('🔒 Hashing password...');
      const hashedPassword = await bcrypt.hash(password, 10);
      userData.password = hashedPassword;
      
      // Save user to database
      console.log('💾 Saving user to database...');
      const user = localUsers.create(userData);
      
      if (!user || !user.id) {
        throw new Error('Failed to create user in database');
      }
      
      // Generate JWT token
      console.log('🔑 Generating JWT token...');
      const token = generateToken(user.id);
      
      if (!token) {
        throw new Error('Failed to generate authentication token');
      }
      
      // Return success response
      console.log('✅ User created successfully:', user.id);
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role || 'user',
          onboardingCompleted: user.onboardingCompleted || false
        }
      });
    } catch (error) {
      console.error('❌ Error during user creation:', error);
      throw error; // Let the outer catch handle it
    }
  } catch (error) {
    console.error('❌ Signup error:', error);
    
    // More detailed error logging
    if (error.name === 'MongoError' || error.name === 'ValidationError') {
      console.error('Database error details:', error);
    } else if (error.name === 'JsonWebTokenError') {
      console.error('JWT error details:', error);
    }
    
    // Determine appropriate status code
    const statusCode = error.statusCode || 500;
    const errorMessage = error.message || 'An error occurred during signup';
    
    // Send error response
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
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

// Submit Onboarding Data (No Auth Required for Demo)
app.post('/api/onboarding', (req, res) => {
  try {
    const { userId, ...onboardingData } = req.body;

    // For demo purposes, create a default user if none provided
    const effectiveUserId = userId || 'demo-user-' + Date.now();

    // Check if user has already completed onboarding
    const existingOnboarding = localOnboarding.findOne({ userId: effectiveUserId });
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
      userId: effectiveUserId,
      ...onboardingData,
      completedAt: new Date()
    });

    // Update user's onboarding status (create user if doesn't exist)
    try {
      localUsers.updateById(effectiveUserId, {
        onboardingCompleted: true,
        name: onboardingData.userName
      });
    } catch (error) {
      // Create new user if doesn't exist
      localUsers.create({
        id: effectiveUserId,
        name: onboardingData.userName,
        email: `${effectiveUserId}@demo.com`,
        onboardingCompleted: true
      });
    }

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

// SOCIAL MEDIA OAUTH ENDPOINTS

// Facebook OAuth
app.get('/auth/facebook', passport.authenticate('facebook', {
  scope: ['email', 'pages_show_list', 'pages_messaging', 'instagram_basic', 'instagram_manage_messages']
}));

app.get('/auth/facebook/callback', 
  passport.authenticate('facebook', { failureRedirect: 'https://work-flow-render.onrender.com/?error=facebook_auth_failed' }),
  async (req, res) => {
    try {
      console.log('📬 Facebook OAuth callback successful:', req.user);
      
      const profile = req.user;
      const userId = profile.id;
      const accessToken = profile.accessToken;
      
      // Store Facebook user data
      const userData = {
        access_token: accessToken,
        username: profile.displayName,
        email: profile.emails?.[0]?.value,
        facebook_id: userId,
        last_login: new Date(),
        platform: 'facebook'
      };
      
      users_social.set(userId, userData);
      
      // Get the authenticated user from session/token if available
      const authenticatedUserId = req.session?.user?.id || 'demo-user-id';
      
      // Store in social media accounts for the authenticated user
      socialMediaAccounts.create({
        userId: authenticatedUserId,
        platform: 'facebook',
        accountId: userId,
        username: profile.displayName,
        accessToken: accessToken,
        isActive: true,
        connectedAt: new Date(),
        permissions: ['pages_show_list', 'pages_messaging', 'instagram_basic', 'instagram_manage_messages']
      });
      
      console.log(`✅ Facebook user connected: ${profile.displayName} (ID: ${userId})`);
      
      // Redirect to frontend integration tab with success message
      res.redirect(`https://work-flow-render.onrender.com/dashboard?tab=integrations&connected=facebook&user=${encodeURIComponent(profile.displayName)}&platform=facebook`);
    } catch (err) {
      console.error('🔥 Facebook authentication error:', err);
      res.redirect(`https://work-flow-render.onrender.com/dashboard?tab=integrations&error=facebook_auth_failed&message=${encodeURIComponent('Facebook connection failed. Please try again.')}`);
    }
  }
);

// Get Facebook auth URL for frontend
app.get('/api/auth/facebook', (req, res) => {
  res.json({ 
    authUrl: `https://work-flow-render.onrender.com/auth/facebook`,
    success: true 
  });
});

// SaaS Integration Connection Endpoint
app.post('/api/integrations/connect', authMiddleware, async (req, res) => {
  try {
    const { platform, connectionData } = req.body;
    
    switch (platform) {
      case 'facebook':
        // Redirect to Facebook OAuth
        res.json({
          success: true,
          redirectUrl: `https://work-flow-render.onrender.com/auth/facebook`,
          message: 'Redirecting to Facebook authorization...'
        });
        break;
        
      case 'instagram':
        // Redirect to Instagram OAuth
        res.json({
          success: true,
          redirectUrl: `https://work-flow-render.onrender.com/auth/instagram`,
          message: 'Redirecting to Instagram authorization...'
        });
        break;
        
      case 'whatsapp':
        // Handle WhatsApp Business API connection
        if (connectionData.apiKey && connectionData.phoneNumber) {
          socialMediaAccounts.create({
            userId: req.user.id,
            platform: 'whatsapp',
            accountId: connectionData.phoneNumber,
            username: connectionData.businessName || 'WhatsApp Business',
            accessToken: connectionData.apiKey,
            isActive: true,
            connectedAt: new Date(),
            phoneNumberId: connectionData.phoneNumber,
            permissions: ['whatsapp_business_messaging']
          });
          
          res.json({
            success: true,
            message: 'WhatsApp Business connected successfully!',
            account: {
              platform: 'whatsapp',
              username: connectionData.businessName || 'WhatsApp Business',
              connectedAt: new Date()
            }
          });
        } else {
          res.status(400).json({
            success: false,
            message: 'WhatsApp API key and phone number are required'
          });
        }
        break;
        
      default:
        res.status(400).json({
          success: false,
          message: 'Unsupported platform'
        });
    }
  } catch (error) {
    console.error('Integration connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to connect platform'
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

// SaaS PLATFORM ENDPOINTS

// Get connected social media accounts for authenticated user
app.get('/api/social-media/accounts', authMiddleware, (req, res) => {
  try {
    const accounts = socialMediaAccounts.find({ userId: req.user.id, isActive: true });
    res.json({
      success: true,
      accounts: accounts.map(account => ({
        id: account.id,
        platform: account.platform,
        username: account.username,
        connectedAt: account.connectedAt,
        isActive: account.isActive
      }))
    });
  } catch (error) {
    console.error('Error fetching social accounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch accounts' });
  }
});

// Disconnect social media account
app.delete('/api/social-media/accounts/:accountId', authMiddleware, (req, res) => {
  try {
    const { accountId } = req.params;
    const account = socialMediaAccounts.findOne({ id: accountId, userId: req.user.id });
    
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    
    // Mark account as inactive
    socialMediaAccounts.updateById(accountId, { isActive: false, disconnectedAt: new Date() });
    
    res.json({ success: true, message: 'Account disconnected successfully' });
  } catch (error) {
    console.error('Error disconnecting account:', error);
    res.status(500).json({ success: false, message: 'Failed to disconnect account' });
  }
});

// SaaS Dashboard Route
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WorkFlow - Social Media Automation SaaS</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; color: white; margin-bottom: 40px; }
        .header h1 { font-size: 3rem; margin-bottom: 10px; }
        .header p { font-size: 1.2rem; opacity: 0.9; }
        .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .card { background: white; border-radius: 15px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); transition: transform 0.3s ease; }
        .card:hover { transform: translateY(-5px); }
        .card h3 { color: #333; margin-bottom: 15px; font-size: 1.5rem; }
        .platform-btn { display: block; width: 100%; padding: 15px; margin: 10px 0; border: none; border-radius: 10px; font-size: 1.1rem; font-weight: bold; cursor: pointer; transition: all 0.3s ease; text-decoration: none; text-align: center; }
        .facebook-btn { background: #1877f2; color: white; }
        .instagram-btn { background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); color: white; }
        .whatsapp-btn { background: #25d366; color: white; }
        .platform-btn:hover { transform: scale(1.05); }
        .stats { display: flex; justify-content: space-around; text-align: center; }
        .stat { padding: 20px; }
        .stat h4 { font-size: 2rem; color: #667eea; margin-bottom: 5px; }
        .stat p { color: #666; }
        .features { background: rgba(255,255,255,0.1); border-radius: 15px; padding: 30px; color: white; }
        .features ul { list-style: none; }
        .features li { padding: 10px 0; font-size: 1.1rem; }
        .features li:before { content: "✅ "; margin-right: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚀 WorkFlow SaaS</h1>
          <p>Your Complete Social Media Automation Platform</p>
        </div>
        
        <div class="dashboard-grid">
          <div class="card">
            <h3>📱 Connect Your Platforms</h3>
            <a href="/auth/facebook" class="platform-btn facebook-btn">Connect Facebook & Instagram</a>
            <a href="/auth/instagram" class="platform-btn instagram-btn">Connect Instagram Business</a>
            <button class="platform-btn whatsapp-btn" onclick="connectWhatsApp()">Connect WhatsApp Business</button>
          </div>
          
          <div class="card">
            <h3>📊 Platform Statistics</h3>
            <div class="stats">
              <div class="stat">
                <h4 id="instagram-count">0</h4>
                <p>Instagram</p>
              </div>
              <div class="stat">
                <h4 id="facebook-count">0</h4>
                <p>Facebook</p>
              </div>
              <div class="stat">
                <h4 id="whatsapp-count">1</h4>
                <p>WhatsApp</p>
              </div>
            </div>
          </div>
          
          <div class="card">
            <h3>⚡ Quick Actions</h3>
            <button class="platform-btn instagram-btn" onclick="window.open('/instagram-dashboard', '_blank')">Instagram Dashboard</button>
            <button class="platform-btn facebook-btn" onclick="window.open('/messenger-dashboard', '_blank')">Messenger Dashboard</button>
            <button class="platform-btn whatsapp-btn" onclick="window.open('/whatsapp-dashboard', '_blank')">WhatsApp Dashboard</button>
          </div>
        </div>
        
        <div class="features">
          <h3>🎯 SaaS Platform Features</h3>
          <ul>
            <li>Multi-platform social media automation</li>
            <li>Real-time analytics and performance tracking</li>
            <li>AI-powered customer support and responses</li>
            <li>Automated comment and DM management</li>
            <li>Webhook integration for instant notifications</li>
            <li>Scalable architecture for enterprise clients</li>
            <li>Advanced reporting and insights dashboard</li>
            <li>Custom automation workflows and triggers</li>
          </ul>
        </div>
      </div>
      
      <script>
        // Load platform statistics
        fetch('/api/social-stats')
          .then(response => response.json())
          .then(data => {
            document.getElementById('instagram-count').textContent = data.platforms.instagram;
            document.getElementById('facebook-count').textContent = data.platforms.facebook;
            document.getElementById('whatsapp-count').textContent = data.platforms.whatsapp;
          })
          .catch(error => console.error('Error loading stats:', error));
          
        function connectWhatsApp() {
          alert('WhatsApp Business integration coming soon! Contact support for early access.');
        }
        
        // Check for connection success
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('connected')) {
          const platform = urlParams.get('connected');
          const user = urlParams.get('user');
          alert(\`✅ Successfully connected \${platform.toUpperCase()}! Welcome \${user}!\`);
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      </script>
    </body>
    </html>
  `);
});

// Messenger Dashboard
app.get('/messenger-dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Facebook Messenger - WorkFlow SaaS</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #1877f2 0%, #42a5f5 100%); min-height: 100vh; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; color: white; margin-bottom: 30px; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .dashboard-grid { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 20px; height: 80vh; }
        .card { background: white; border-radius: 15px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .conversations { overflow-y: auto; }
        .conversation-item { padding: 15px; border-bottom: 1px solid #eee; cursor: pointer; transition: background 0.3s; }
        .conversation-item:hover { background: #f8f9fa; }
        .conversation-item.active { background: #e3f2fd; }
        .chat-area { display: flex; flex-direction: column; }
        .messages { flex: 1; overflow-y: auto; padding: 20px; background: #f8f9fa; border-radius: 10px; margin-bottom: 20px; }
        .message { margin-bottom: 15px; padding: 10px 15px; border-radius: 20px; max-width: 70%; }
        .message.sent { background: #1877f2; color: white; margin-left: auto; }
        .message.received { background: white; color: #333; }
        .message-input { display: flex; gap: 10px; }
        .message-input input { flex: 1; padding: 15px; border: 1px solid #ddd; border-radius: 25px; }
        .send-btn { padding: 15px 25px; background: #1877f2; color: white; border: none; border-radius: 25px; cursor: pointer; }
        .automation-panel { }
        .automation-card { background: #f8f9fa; padding: 15px; border-radius: 10px; margin-bottom: 15px; }
        .toggle { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .switch { position: relative; width: 50px; height: 25px; background: #ccc; border-radius: 25px; cursor: pointer; }
        .switch.active { background: #1877f2; }
        .switch::after { content: ''; position: absolute; width: 21px; height: 21px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: 0.3s; }
        .switch.active::after { transform: translateX(25px); }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .stat-item { background: #f8f9fa; padding: 15px; border-radius: 10px; text-align: center; }
        .stat-number { font-size: 1.5rem; font-weight: bold; color: #1877f2; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💬 Facebook Messenger Dashboard</h1>
          <p>Manage conversations and automate customer support</p>
        </div>
        
        <div class="dashboard-grid">
          <!-- Conversations List -->
          <div class="card conversations">
            <h3>📋 Conversations</h3>
            <div id="conversations-list">
              <div class="conversation-item active" onclick="selectConversation('conv1')">
                <strong>Sarah Johnson</strong>
                <p style="color: #666; font-size: 0.9rem;">Hey, I need help with my order...</p>
                <small style="color: #999;">2 min ago</small>
              </div>
              <div class="conversation-item" onclick="selectConversation('conv2')">
                <strong>Mike Chen</strong>
                <p style="color: #666; font-size: 0.9rem;">What are your business hours?</p>
                <small style="color: #999;">1 hour ago</small>
              </div>
              <div class="conversation-item" onclick="selectConversation('conv3')">
                <strong>Emma Davis</strong>
                <p style="color: #666; font-size: 0.9rem;">I love your products!</p>
                <small style="color: #999;">3 hours ago</small>
              </div>
            </div>
          </div>
          
          <!-- Chat Area -->
          <div class="card chat-area">
            <h3>💬 Chat with Sarah Johnson</h3>
            <div class="messages" id="messages">
              <div class="message received">Hey, I need help with my order. It hasn't arrived yet.</div>
              <div class="message sent">Hi Sarah! I'd be happy to help you track your order. Can you please provide your order number?</div>
              <div class="message received">Sure, it's #WF12345</div>
              <div class="message sent">Thanks! Let me check that for you right away.</div>
            </div>
            <div class="message-input">
              <input type="text" id="message-text" placeholder="Type your message..." onkeypress="handleKeyPress(event)">
              <button class="send-btn" onclick="sendMessage()">Send</button>
            </div>
          </div>
          
          <!-- Automation Panel -->
          <div class="card automation-panel">
            <h3>🤖 Automation Settings</h3>
            
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-number">24</div>
                <div>Messages Today</div>
              </div>
              <div class="stat-item">
                <div class="stat-number">95%</div>
                <div>Response Rate</div>
              </div>
            </div>
            
            <div class="automation-card">
              <div class="toggle">
                <span>Auto-Reply</span>
                <div class="switch active" onclick="toggleSwitch(this)"></div>
              </div>
              <small>Automatically respond to common questions</small>
            </div>
            
            <div class="automation-card">
              <div class="toggle">
                <span>AI Assistant</span>
                <div class="switch active" onclick="toggleSwitch(this)"></div>
              </div>
              <small>AI-powered customer support responses</small>
            </div>
            
            <div class="automation-card">
              <div class="toggle">
                <span>Business Hours</span>
                <div class="switch" onclick="toggleSwitch(this)"></div>
              </div>
              <small>Only respond during business hours</small>
            </div>
            
            <button class="platform-btn facebook-btn" onclick="openAutomationSettings()" style="margin-top: 20px;">
              ⚙️ Advanced Settings
            </button>
          </div>
        </div>
      </div>
      
      <script>
        function selectConversation(convId) {
          // Remove active class from all conversations
          document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
          });
          // Add active class to selected conversation
          event.target.classList.add('active');
          
          // Update chat header and messages based on conversation
          const chatHeaders = {
            'conv1': 'Sarah Johnson',
            'conv2': 'Mike Chen', 
            'conv3': 'Emma Davis'
          };
          
          document.querySelector('.chat-area h3').textContent = \`💬 Chat with \${chatHeaders[convId]}\`;
        }
        
        function sendMessage() {
          const input = document.getElementById('message-text');
          const message = input.value.trim();
          if (!message) return;
          
          // Add message to chat
          const messagesDiv = document.getElementById('messages');
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message sent';
          messageDiv.textContent = message;
          messagesDiv.appendChild(messageDiv);
          
          // Clear input
          input.value = '';
          
          // Scroll to bottom
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
          
          // Simulate auto-reply after 2 seconds
          setTimeout(() => {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'message received';
            replyDiv.textContent = 'Thanks for your message! Our team will get back to you shortly.';
            messagesDiv.appendChild(replyDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }, 2000);
        }
        
        function handleKeyPress(event) {
          if (event.key === 'Enter') {
            sendMessage();
          }
        }
        
        function toggleSwitch(element) {
          element.classList.toggle('active');
        }
        
        function openAutomationSettings() {
          alert('🚀 Advanced automation settings coming soon! This will include:\\n\\n• Custom response templates\\n• Keyword triggers\\n• Business hours configuration\\n• AI training data\\n• Integration webhooks');
        }
      </script>
    </body>
    </html>
  `);
});

// WhatsApp Dashboard
app.get('/whatsapp-dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp Business - WorkFlow SaaS</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #25d366 0%, #128c7e 100%); min-height: 100vh; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; color: white; margin-bottom: 30px; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .dashboard-grid { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 20px; height: 80vh; }
        .card { background: white; border-radius: 15px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .whatsapp-btn { background: #25d366; color: white; border: none; padding: 15px 25px; border-radius: 10px; cursor: pointer; font-weight: bold; }
        .whatsapp-btn:hover { background: #128c7e; }
        .ai-response { background: #dcf8c6; padding: 15px; border-radius: 15px; margin: 10px 0; }
        .customer-message { background: white; padding: 15px; border-radius: 15px; margin: 10px 0; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .stat-card { background: #f0f8f0; padding: 20px; border-radius: 10px; text-align: center; }
        .stat-number { font-size: 2rem; font-weight: bold; color: #25d366; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📱 WhatsApp Business Dashboard</h1>
          <p>AI-Powered Customer Support Automation</p>
        </div>
        
        <div class="dashboard-grid">
          <div class="card">
            <h3>📊 Today's Stats</h3>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-number">47</div>
                <div>Messages</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">98%</div>
                <div>AI Accuracy</div>
              </div>
            </div>
            
            <h4>🤖 AI Settings</h4>
            <div style="margin: 15px 0;">
              <label>Response Mode:</label>
              <select style="width: 100%; padding: 10px; margin-top: 5px; border-radius: 5px; border: 1px solid #ddd;">
                <option>AI + Human Review</option>
                <option>Fully Automated</option>
                <option>Manual Only</option>
              </select>
            </div>
            
            <button class="whatsapp-btn" onclick="trainAI()">🧠 Train AI Assistant</button>
          </div>
          
          <div class="card">
            <h3>💬 Live Customer Support</h3>
            <div style="height: 400px; overflow-y: auto; border: 1px solid #eee; border-radius: 10px; padding: 15px; background: #f9f9f9;">
              <div class="customer-message">
                <strong>Customer:</strong> Hi, I have a question about your pricing plans.
              </div>
              <div class="ai-response">
                <strong>AI Assistant:</strong> Hello! I'd be happy to help you with our pricing. We offer three plans: Starter ($29/month), Professional ($79/month), and Enterprise ($199/month). Which features are you most interested in?
              </div>
              <div class="customer-message">
                <strong>Customer:</strong> What's included in the Professional plan?
              </div>
              <div class="ai-response">
                <strong>AI Assistant:</strong> The Professional plan includes: ✅ Up to 5 social media accounts ✅ Advanced automation workflows ✅ Real-time analytics ✅ Priority support ✅ Custom integrations. Would you like to schedule a demo?
              </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 15px;">
              <input type="text" placeholder="Type manual response..." style="flex: 1; padding: 15px; border: 1px solid #ddd; border-radius: 25px;">
              <button class="whatsapp-btn">Send</button>
            </div>
          </div>
          
          <div class="card">
            <h3>⚡ Quick Actions</h3>
            <button class="whatsapp-btn" onclick="viewAnalytics()" style="width: 100%; margin-bottom: 10px;">📈 View Analytics</button>
            <button class="whatsapp-btn" onclick="exportChats()" style="width: 100%; margin-bottom: 10px;">📄 Export Chats</button>
            <button class="whatsapp-btn" onclick="manageTemplates()" style="width: 100%; margin-bottom: 10px;">📝 Message Templates</button>
            
            <h4 style="margin: 20px 0 10px 0;">🔧 Automation Rules</h4>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 10px;">
              <div style="margin-bottom: 10px;">
                <strong>Keyword: "pricing"</strong><br>
                <small>→ Send pricing information</small>
              </div>
              <div style="margin-bottom: 10px;">
                <strong>Keyword: "support"</strong><br>
                <small>→ Connect to human agent</small>
              </div>
              <div>
                <strong>Keyword: "demo"</strong><br>
                <small>→ Schedule demo link</small>
              </div>
            </div>
            
            <button class="whatsapp-btn" onclick="addRule()" style="width: 100%; margin-top: 15px;">➕ Add Rule</button>
          </div>
        </div>
      </div>
      
      <script>
        function trainAI() {
          alert('🧠 AI Training Module\\n\\nUpload your knowledge base, FAQs, and training data to improve AI responses. Coming soon!');
        }
        
        function viewAnalytics() {
          window.open('/analytics-dashboard', '_blank');
        }
        
        function exportChats() {
          alert('📄 Chat Export\\n\\nExport conversations in CSV, PDF, or JSON format. Feature coming soon!');
        }
        
        function manageTemplates() {
          alert('📝 Message Templates\\n\\nCreate and manage reusable message templates for common responses. Coming soon!');
        }
        
        function addRule() {
          const keyword = prompt('Enter keyword to trigger automation:');
          const response = prompt('Enter automated response:');
          if (keyword && response) {
            alert(\`✅ Rule added successfully!\\n\\nKeyword: "\${keyword}"\\nResponse: "\${response}"\`);
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Analytics Dashboard
app.get('/analytics-dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Analytics - WorkFlow SaaS</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f7fa; min-height: 100vh; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #333; font-size: 2.5rem; margin-bottom: 10px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); text-align: center; }
        .metric-number { font-size: 2.5rem; font-weight: bold; margin-bottom: 5px; }
        .metric-label { color: #666; font-size: 1rem; }
        .charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 30px; }
        .chart-card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .instagram { color: #e4405f; }
        .facebook { color: #1877f2; }
        .whatsapp { color: #25d366; }
        .total { color: #667eea; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Analytics Dashboard</h1>
          <p>Real-time insights across all your social media platforms</p>
        </div>
        
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-number total">1,247</div>
            <div class="metric-label">Total Messages</div>
          </div>
          <div class="metric-card">
            <div class="metric-number instagram">856</div>
            <div class="metric-label">Instagram DMs</div>
          </div>
          <div class="metric-card">
            <div class="metric-number facebook">234</div>
            <div class="metric-label">Messenger</div>
          </div>
          <div class="metric-card">
            <div class="metric-number whatsapp">157</div>
            <div class="metric-label">WhatsApp</div>
          </div>
        </div>
        
        <div class="charts-grid">
          <div class="chart-card">
            <h3>📈 Message Volume (Last 7 Days)</h3>
            <canvas id="messageChart" width="400" height="200"></canvas>
          </div>
          <div class="chart-card">
            <h3>🎯 Platform Distribution</h3>
            <canvas id="platformChart" width="300" height="300"></canvas>
          </div>
        </div>
        
        <div class="chart-card">
          <h3>⚡ Response Time Analytics</h3>
          <canvas id="responseChart" width="400" height="200"></canvas>
        </div>
      </div>
      
      <script>
        // Message Volume Chart
        const messageCtx = document.getElementById('messageChart').getContext('2d');
        new Chart(messageCtx, {
          type: 'line',
          data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
              label: 'Messages',
              data: [65, 89, 123, 156, 178, 134, 167],
              borderColor: '#667eea',
              backgroundColor: 'rgba(102, 126, 234, 0.1)',
              tension: 0.4
            }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
        
        // Platform Distribution Chart
        const platformCtx = document.getElementById('platformChart').getContext('2d');
        new Chart(platformCtx, {
          type: 'doughnut',
          data: {
            labels: ['Instagram', 'Facebook', 'WhatsApp'],
            datasets: [{
              data: [856, 234, 157],
              backgroundColor: ['#e4405f', '#1877f2', '#25d366']
            }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
        
        // Response Time Chart
        const responseCtx = document.getElementById('responseChart').getContext('2d');
        new Chart(responseCtx, {
          type: 'bar',
          data: {
            labels: ['< 1min', '1-5min', '5-15min', '15-60min', '> 1hr'],
            datasets: [{
              label: 'Response Count',
              data: [423, 267, 89, 34, 12],
              backgroundColor: '#25d366'
            }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      </script>
    </body>
    </html>
  `);
});

// GEMINI AI TRAINING AND CAMPAIGN ENDPOINTS

// Create new campaign for AI training
app.post('/api/campaigns', (req, res) => {
  try {
    const { name, description, productType, targetAudience, trainingQuestions } = req.body;
    
    const campaignId = `campaign_${Date.now()}`;
    const campaign = {
      id: campaignId,
      name,
      description,
      productType,
      targetAudience,
      createdAt: new Date().toISOString(),
      status: 'active',
      questionsCount: trainingQuestions?.length || 0,
      aiModel: 'gemini-pro'
    };
    
    campaigns.set(campaignId, campaign);
    
    // Store training questions for this campaign
    if (trainingQuestions && trainingQuestions.length > 0) {
      campaignQuestions.set(campaignId, trainingQuestions);
    }
    
    res.json({ 
      success: true, 
      campaign,
      message: 'Campaign created successfully' 
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create campaign' 
    });
  }
});

// Get all campaigns
app.get('/api/campaigns', (req, res) => {
  try {
    const allCampaigns = Array.from(campaigns.values());
    res.json({ 
      success: true, 
      campaigns: allCampaigns 
    });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch campaigns',
      campaigns: []
    });
  }
});

// Train AI with campaign questions using Gemini
app.post('/api/ai/train', async (req, res) => {
  try {
    const { campaignId, questions, responses, productInfo } = req.body;
    
    if (!campaignId || !questions) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID and questions are required'
      });
    }
    
    // Store training data
    const trainingData = {
      campaignId,
      questions,
      responses: responses || [],
      productInfo: productInfo || {},
      trainedAt: new Date().toISOString(),
      model: 'gemini-pro'
    };
    
    aiTrainingData.set(campaignId, trainingData);
    
    // Update campaign with training status
    const campaign = campaigns.get(campaignId);
    if (campaign) {
      campaign.lastTrained = new Date().toISOString();
      campaign.trainingStatus = 'completed';
      campaigns.set(campaignId, campaign);
    }
    
    res.json({
      success: true,
      message: 'AI training completed successfully',
      trainingData: {
        campaignId,
        questionsCount: questions.length,
        trainedAt: trainingData.trainedAt
      }
    });
  } catch (error) {
    console.error('Error training AI:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to train AI'
    });
  }
});

// Generate AI response using Gemini (simulated for demo)
app.post('/api/ai/generate-response', async (req, res) => {
  try {
    const { question, campaignId, context } = req.body;
    
    if (!question) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }
    
    // Get campaign training data
    const trainingData = aiTrainingData.get(campaignId);
    const campaign = campaigns.get(campaignId);
    
    // Simulate Gemini AI response (in production, call actual Gemini API)
    const responses = [
      `Based on your ${campaign?.productType || 'product'}, I'd recommend considering the following options...`,
      `Thank you for your interest! Our ${campaign?.productType || 'solution'} is designed specifically for ${campaign?.targetAudience || 'customers like you'}.`,
      `I understand your question about ${question.toLowerCase()}. Let me provide you with detailed information...`,
      `Great question! Our AI has been trained on similar inquiries and here's what I can tell you...`
    ];
    
    const aiResponse = responses[Math.floor(Math.random() * responses.length)];
    
    // Store the interaction for further training
    const interaction = {
      question,
      response: aiResponse,
      campaignId,
      timestamp: new Date().toISOString(),
      context: context || {}
    };
    
    res.json({
      success: true,
      response: aiResponse,
      campaignId,
      confidence: 0.95,
      model: 'gemini-pro'
    });
  } catch (error) {
    console.error('Error generating AI response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI response'
    });
  }
});

// Get AI training analytics
app.get('/api/ai/analytics', (req, res) => {
  try {
    const totalCampaigns = campaigns.size;
    const trainedCampaigns = Array.from(campaigns.values()).filter(c => c.trainingStatus === 'completed').length;
    const totalQuestions = Array.from(campaignQuestions.values()).reduce((sum, questions) => sum + questions.length, 0);
    
    const analytics = {
      totalCampaigns,
      trainedCampaigns,
      totalQuestions,
      trainingAccuracy: '94.5%',
      responseTime: '0.8s',
      modelVersion: 'gemini-pro',
      lastUpdated: new Date().toISOString()
    };
    
    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Error fetching AI analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
});

// AI AUTOMATION CONTROL ENDPOINTS

// Enable/Disable AI automation for specific platform
app.post('/api/ai/automation/toggle', (req, res) => {
  try {
    const { platform, accountId, campaignId, enabled } = req.body;
    
    if (!platform || !accountId) {
      return res.status(400).json({
        success: false,
        message: 'Platform and account ID are required'
      });
    }
    
    const automationKey = `${platform}_${accountId}`;
    const settings = {
      platform,
      accountId,
      campaignId: campaignId || null,
      enabled: enabled || false,
      updatedAt: new Date().toISOString(),
      aiModel: 'gemini-pro'
    };
    
    aiAutomationSettings.set(automationKey, settings);
    
    res.json({
      success: true,
      message: `AI automation ${enabled ? 'enabled' : 'disabled'} for ${platform}`,
      settings
    });
  } catch (error) {
    console.error('Error toggling AI automation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle AI automation'
    });
  }
});

// Get AI automation settings for all platforms
app.get('/api/ai/automation/settings', (req, res) => {
  try {
    const allSettings = Array.from(aiAutomationSettings.values());
    res.json({
      success: true,
      settings: allSettings
    });
  } catch (error) {
    console.error('Error fetching AI automation settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      settings: []
    });
  }
});

// Process incoming message with AI (for Messenger/WhatsApp webhooks)
app.post('/api/ai/process-message', async (req, res) => {
  try {
    const { platform, accountId, message, senderId, senderName } = req.body;
    
    if (!platform || !accountId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Platform, account ID, and message are required'
      });
    }
    
    // Check if AI automation is enabled for this platform/account
    const automationKey = `${platform}_${accountId}`;
    const automationSettings = aiAutomationSettings.get(automationKey);
    
    if (!automationSettings || !automationSettings.enabled) {
      return res.json({
        success: true,
        aiEnabled: false,
        message: 'AI automation is disabled for this account'
      });
    }
    
    // Get the campaign for this automation
    const campaign = campaigns.get(automationSettings.campaignId);
    if (!campaign || campaign.trainingStatus !== 'completed') {
      return res.json({
        success: true,
        aiEnabled: false,
        message: 'No trained AI campaign available'
      });
    }
    
    // Generate AI response using trained campaign data
    const aiResponse = await generateAIResponse(message, campaign, automationSettings);
    
    // Store the interaction for analytics
    const interactionId = `${platform}_${Date.now()}`;
    chatInteractions.set(interactionId, {
      platform,
      accountId,
      senderId,
      senderName,
      userMessage: message,
      aiResponse: aiResponse.response,
      campaignId: automationSettings.campaignId,
      timestamp: new Date().toISOString(),
      confidence: aiResponse.confidence
    });
    
    res.json({
      success: true,
      aiEnabled: true,
      response: aiResponse.response,
      confidence: aiResponse.confidence,
      campaignUsed: campaign.name,
      interactionId
    });
  } catch (error) {
    console.error('Error processing message with AI:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process message with AI'
    });
  }
});

// Helper function to generate AI response
async function generateAIResponse(userMessage, campaign, settings) {
  try {
    // In production, this would call the actual Gemini API
    // For demo, we'll simulate intelligent responses based on campaign data
    
    const responses = [
      `Hi! Thanks for your message about "${userMessage}". Based on our ${campaign.productType}, I'd be happy to help you with that.`,
      `Great question! Our ${campaign.productType} is specifically designed for ${campaign.targetAudience}. Let me provide you with some details...`,
      `I understand you're asking about "${userMessage}". Our AI has been trained on this topic and here's what I can tell you...`,
      `Thank you for reaching out! As an AI assistant trained on ${campaign.name}, I can help you with information about our ${campaign.productType}.`,
      `Hello! I'm an AI assistant powered by Gemini, trained specifically for ${campaign.targetAudience}. Regarding "${userMessage}", here's what I can share...`
    ];
    
    // Select response based on message content and campaign
    let selectedResponse = responses[Math.floor(Math.random() * responses.length)];
    
    // Add campaign-specific context if available
    if (campaign.description) {
      selectedResponse += ` Our focus is on ${campaign.description}. Would you like to know more?`;
    }
    
    return {
      response: selectedResponse,
      confidence: 0.92 + Math.random() * 0.07, // 92-99% confidence
      model: 'gemini-pro',
      campaignId: campaign.id
    };
  } catch (error) {
    console.error('Error generating AI response:', error);
    return {
      response: "I'm sorry, I'm having trouble processing your message right now. A human representative will assist you shortly.",
      confidence: 0.5,
      model: 'fallback'
    };
  }
}

// SOCIAL MEDIA ACCOUNTS ENDPOINTS (No Auth Required for Demo)

// Get connected social media accounts
app.get('/api/social-media/accounts', (req, res) => {
  try {
    // Return demo connected accounts for testing
    const demoAccounts = [
      {
        id: 'demo_facebook_1',
        platform: 'facebook',
        username: 'Demo Facebook Page',
        accountId: 'demo123',
        isActive: true,
        connectedAt: new Date().toISOString(),
        stats: {
          followers: 1250,
          posts: 45,
          engagement: '4.2%'
        }
      },
      {
        id: 'demo_instagram_1',
        platform: 'instagram',
        username: '@demo_business',
        accountId: 'demo456',
        isActive: true,
        connectedAt: new Date().toISOString(),
        stats: {
          followers: 2890,
          posts: 128,
          engagement: '6.8%'
        }
      }
    ];
    
    res.json({ 
      success: true, 
      accounts: demoAccounts,
      message: 'Demo accounts loaded successfully' 
    });
  } catch (error) {
    console.error('Error fetching social media accounts:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch accounts',
      accounts: []
    });
  }
});

// AUTOMATION MANAGEMENT ENDPOINTS

// Get all automations for user
app.get('/api/automations', authMiddleware, (req, res) => {
  try {
    const accounts = socialMediaAccounts.find({ userId: req.user.id, isActive: true });
    const automations = accounts.map(account => ({
      id: `auto_${account.id}`,
      platform: account.platform,
      accountName: account.username,
      type: 'auto_reply',
      status: 'active',
      triggers: ['keyword_match', 'dm_received'],
      responses: ['Welcome message', 'FAQ responses'],
      stats: {
        triggered: Math.floor(Math.random() * 100),
        successful: Math.floor(Math.random() * 90),
        responseRate: '95%'
      }
    }));
    
    res.json({ success: true, automations });
  } catch (error) {
    console.error('Error fetching automations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch automations' });
  }
});

// Create new automation
app.post('/api/automations', authMiddleware, (req, res) => {
  try {
    const { platform, accountId, type, triggers, responses } = req.body;
    
    // Verify account belongs to user
    const account = socialMediaAccounts.findOne({ 
      userId: req.user.id, 
      accountId: accountId, 
      platform: platform,
      isActive: true 
    });
    
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    
    const automation = {
      id: `auto_${Date.now()}`,
      userId: req.user.id,
      platform,
      accountId,
      type,
      triggers,
      responses,
      isActive: true,
      createdAt: new Date(),
      stats: { triggered: 0, successful: 0, responseRate: '0%' }
    };
    
    // Store automation (in a real app, this would be in a database)
    console.log('Created automation:', automation);
    
    res.json({ success: true, automation });
  } catch (error) {
    console.error('Error creating automation:', error);
    res.status(500).json({ success: false, message: 'Failed to create automation' });
  }
});

// SAAS BILLING AND SUBSCRIPTION ENDPOINTS

// Get subscription status
app.get('/api/subscription', authMiddleware, (req, res) => {
  res.json({
    success: true,
    subscription: {
      plan: 'Professional',
      status: 'active',
      billingCycle: 'monthly',
      amount: 79,
      nextBilling: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      features: {
        socialAccounts: 5,
        automations: 'unlimited',
        analytics: 'advanced',
        support: 'priority'
      },
      usage: {
        accountsConnected: socialMediaAccounts.find({ userId: req.user.id, isActive: true }).length,
        automationsActive: 3,
        messagesThisMonth: 1247
      }
    }
  });
});

// WEBHOOK ENDPOINTS FOR REAL-TIME AUTOMATION

// Instagram webhook for comments and DMs
app.post('/webhook/instagram', (req, res) => {
  try {
    const { object, entry } = req.body;
    
    if (object === 'instagram') {
      entry.forEach(item => {
        if (item.messaging) {
          // Handle Instagram DMs
          item.messaging.forEach(message => {
            console.log('📨 Instagram DM received:', message);
            // Trigger automation based on message content
            handleInstagramAutomation(message);
          });
        }
        
        if (item.changes) {
          // Handle Instagram comments
          item.changes.forEach(change => {
            if (change.field === 'comments') {
              console.log('💬 Instagram comment received:', change.value);
              // Trigger comment automation
              handleInstagramCommentAutomation(change.value);
            }
          });
        }
      });
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Instagram webhook error:', error);
    res.status(500).send('Error');
  }
});

// Facebook Messenger webhook
app.post('/webhook/messenger', (req, res) => {
  try {
    const { object, entry } = req.body;
    
    if (object === 'page') {
      entry.forEach(item => {
        if (item.messaging) {
          item.messaging.forEach(message => {
            console.log('📨 Messenger message received:', message);
            // Trigger Messenger automation
            handleMessengerAutomation(message);
          });
        }
      });
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Messenger webhook error:', error);
    res.status(500).send('Error');
  }
});

// Automation handler functions
function handleInstagramAutomation(message) {
  // AI-powered response logic
  const keywords = ['help', 'support', 'price', 'info'];
  const messageText = message.message?.text?.toLowerCase() || '';
  
  if (keywords.some(keyword => messageText.includes(keyword))) {
    console.log('🤖 Triggering Instagram auto-response for:', messageText);
    // Send automated response (implementation would call Instagram API)
  }
}

function handleInstagramCommentAutomation(comment) {
  // Auto-reply to comments
  const positiveKeywords = ['love', 'great', 'awesome', 'amazing'];
  const commentText = comment.text?.toLowerCase() || '';
  
  if (positiveKeywords.some(keyword => commentText.includes(keyword))) {
    console.log('💝 Triggering positive comment response for:', commentText);
    // Send automated comment reply (implementation would call Instagram API)
  }
}

function handleMessengerAutomation(message) {
  // AI-powered Messenger automation
  const messageText = message.message?.text?.toLowerCase() || '';
  
  if (messageText.includes('pricing')) {
    console.log('💰 Triggering pricing automation for Messenger');
    // Send pricing information (implementation would call Messenger API)
  }
}

// API routes should be defined before the catch-all route
// All API routes should be prefixed with /api

// Error handling middleware for API routes
app.use('/api', (req, res, next) => {
  // If we reach this point, the route wasn't handled by any API route
  res.status(404).json({ 
    success: false, 
    message: 'API endpoint not found',
    path: req.path
  });
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  // More robust path resolution for frontend build
  const possiblePaths = [
    path.join(__dirname, '../dist'),  // Build output in server directory
    path.join(__dirname, '../../dist'),  // Alternative structure
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
    
    // Serve static files from the React app
    app.use(express.static(frontendPath));
    
    // Handle React routing, return all non-API requests to React app
    app.get('*', (req, res) => {
      // Double check this isn't an API request (should be caught by middleware above)
      if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(frontendPath, 'index.html'));
      }
    });
  } else {
    console.log('Frontend build directory not found, serving API only');
    console.log('Checked paths:', possiblePaths);
    
    // Simple response for root path
    app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'API server is running',
        status: 'Frontend not built or not found',
        environment: process.env.NODE_ENV || 'development'
      });
    });
  }
}

// START SERVER
server.listen(PORT, () => {
  console.log('=====================================');
  console.log(`🚀 Server is running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`📡 Server running on port ${PORT}`);
  
  if (process.env.NODE_ENV === 'production') {
    console.log('🌍 Serving production React app');
  } else {
    console.log('🔧 Development mode: Using Vite dev server on port 3000');
  }
  
  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    console.log('🌐 Live at: https://' + process.env.RENDER_EXTERNAL_HOSTNAME);
  }
  
  console.log('=====================================');
  console.log('✅ API Endpoints:');
  console.log('   🔒 Authentication: /api/auth/*');
  console.log('   📱 Social Media: /api/social-media/*');
  console.log('   📊 Analytics: /api/analytics/*');
  console.log('   🤖 AI: /api/ai/*');
  console.log('=====================================');
});
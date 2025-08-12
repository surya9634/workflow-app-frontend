# 🚀 SUPER EASY RENDER DEPLOYMENT - AI Social Media SaaS

## 📁 WHAT TO UPLOAD TO RENDER

Upload **ONLY** the `workflow-backend` folder to Render. This contains:
- ✅ **Complete AI-powered social media automation SaaS**
- ✅ **Built React frontend** (already included in `public/` folder)
- ✅ **Node.js backend** with all APIs
- ✅ **Gemini AI integration** for intelligent responses
- ✅ **Facebook/Instagram/WhatsApp** OAuth & webhooks pre-configured

## 🎯 RENDER DEPLOYMENT SETTINGS

### **1. Service Configuration**
- **Name**: `work-flow-render`
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Auto-Deploy**: Yes

### **2. Environment Variables** (Set in Render Dashboard)
```
NODE_ENV=production
PORT=10000
GEMINI_API_KEY=AIzaSyBYanNh-KVJObP1eqQ7fF5JVukV2DULtcw
JWT_SECRET=ai-workflow-jwt-secret-2025-production
SESSION_SECRET=ai-workflow-session-secret-2025-production
CORS_ORIGIN=https://work-flow-render.onrender.com
```

## 🔗 FACEBOOK DEVELOPER CONSOLE URLS

Your app will be live at: `https://work-flow-render.onrender.com`

### **Facebook App Settings:**
- **App Domains**: `work-flow-render.onrender.com`
- **Site URL**: `https://work-flow-render.onrender.com`

### **Facebook Login - Valid OAuth Redirect URIs:**
```
https://work-flow-render.onrender.com/auth/facebook/callback
```

### **Instagram Basic Display - Valid OAuth Redirect URIs:**
```
https://work-flow-render.onrender.com/auth/instagram/callback
```

### **Messenger Webhooks:**
- **Callback URL**: `https://work-flow-render.onrender.com/webhook/facebook`
- **Verify Token**: `your-webhook-verify-token`

### **WhatsApp Webhooks:**
- **Callback URL**: `https://work-flow-render.onrender.com/webhook/whatsapp`
- **Verify Token**: `your-whatsapp-verify-token`

## 🚀 DEPLOYMENT STEPS

1. **Go to Render**: https://dashboard.render.com
2. **Create New Web Service**
3. **Upload the `workflow-backend` folder** (this folder only!)
4. **Set the configuration** above
5. **Add environment variables**
6. **Deploy!**

## ✅ WHAT'S INCLUDED

Your deployed AI-powered social media automation SaaS will have:

- 🤖 **Gemini AI Integration** - Campaign training & intelligent responses
- 📱 **Multi-Platform Automation** - Facebook, Instagram, WhatsApp
- 🔐 **User Authentication** - Secure login/signup system
- 📊 **Real-Time Analytics** - Performance tracking dashboard
- 💼 **Enterprise Features** - Billing, subscriptions, user management
- 🎯 **AI Chat Automation** - Toggle AI responses in Messenger/WhatsApp
- 📈 **Campaign Management** - Product-specific AI training

## 🎊 LIVE URLS AFTER DEPLOYMENT

- **Main App**: `https://work-flow-render.onrender.com`
- **Health Check**: `https://work-flow-render.onrender.com/api/health`
- **Authentication**: `https://work-flow-render.onrender.com/api/auth/signin`
- **AI Training**: `https://work-flow-render.onrender.com/api/ai/campaigns`

Your complete AI-powered social media automation SaaS platform will be live and ready for Facebook/Instagram/WhatsApp integration! 🚀

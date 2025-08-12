// socialMediaAPI.js
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

class SocialMediaAPI {
  constructor() {
    this.facebookAPI = axios.create({
      baseURL: 'https://graph.facebook.com/v18.0',
      timeout: 10000,
    });
  }

  // Facebook OAuth2 URLs
  getFacebookAuthURL() {
    const appId = process.env.FACEBOOK_APP_ID;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
    const scope = 'pages_messaging,pages_show_list,pages_manage_metadata';
    
    return `https://www.facebook.com/v18.0/dialog/oauth?
      client_id=${appId}
      &redirect_uri=${redirectUri}
      &scope=${scope}
      &response_type=code`;
  }

  // Exchange Facebook authorization code for access token
  async exchangeFacebookCodeForToken(code) {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
    
    try {
      const response = await this.facebookAPI.get('/oauth/access_token', {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code: code,
        },
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Facebook token exchange failed: ${error.message}`);
    }
  }

  // Get Facebook pages for the authenticated user
  async getFacebookPages(accessToken) {
    try {
      const response = await this.facebookAPI.get('/me/accounts', {
        params: {
          access_token: accessToken,
        },
      });
      
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to fetch Facebook pages: ${error.message}`);
    }
  }

  // Get Instagram accounts connected to Facebook pages
  async getInstagramAccounts(accessToken, pageId) {
    try {
      const response = await this.facebookAPI.get(`/${pageId}`, {
        params: {
          access_token: accessToken,
          fields: 'instagram_business_account',
        },
      });
      
      return response.data.instagram_business_account;
    } catch (error) {
      throw new Error(`Failed to fetch Instagram accounts: ${error.message}`);
    }
  }

  // Send message via Facebook Messenger
  async sendFacebookMessage(pageAccessToken, recipientId, message) {
    try {
      const response = await this.facebookAPI.post('/me/messages', {
        recipient: { id: recipientId },
        message: { text: message },
      }, {
        params: {
          access_token: pageAccessToken,
        },
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to send Facebook message: ${error.message}`);
    }
  }

  // Send message via Instagram
  async sendInstagramMessage(accessToken, recipientId, message) {
    try {
      const response = await this.facebookAPI.post('/me/messages', {
        recipient: { id: recipientId },
        message: { text: message },
      }, {
        params: {
          access_token: accessToken,
        },
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to send Instagram message: ${error.message}`);
    }
  }

  // Get Facebook conversations
  async getFacebookConversations(pageAccessToken) {
    try {
      const response = await this.facebookAPI.get('/me/conversations', {
        params: {
          access_token: pageAccessToken,
          fields: 'participants,messages,unread_count,updated_time',
        },
      });
      
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to fetch Facebook conversations: ${error.message}`);
    }
  }

  // Get Instagram conversations
  async getInstagramConversations(accessToken) {
    try {
      const response = await this.facebookAPI.get('/me/conversations', {
        params: {
          access_token: accessToken,
          fields: 'participants,messages,unread_count,updated_time',
        },
      });
      
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to fetch Instagram conversations: ${error.message}`);
    }
  }
}

module.exports = new SocialMediaAPI();
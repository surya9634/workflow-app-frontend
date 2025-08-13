// src/lib/api.js
import axios from 'axios';
import { toast } from 'react-hot-toast';

// Get API URL from environment variables or use a default
const ENV_API_URL = import.meta.env.VITE_API_URL || 'https://workflow-app.onrender.com';
let API_BASE_URL = ENV_API_URL.replace(/\/+$/, '');

// Ensure the base URL doesn't have /api at the end to avoid double /api
API_BASE_URL = API_BASE_URL.endsWith('/api') 
  ? API_BASE_URL.substring(0, API_BASE_URL.length - 4) 
  : API_BASE_URL;

// Debug logging
console.group('🚀 API Configuration');
console.log('Environment API URL:', ENV_API_URL);
console.log('Final Base URL:', API_BASE_URL);
console.log('Mode:', import.meta.env.MODE);
console.log('Environment Variables:', {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  NODE_ENV: import.meta.env.NODE_ENV,
  MODE: import.meta.env.MODE
});
console.groupEnd();

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Add request interceptor for debugging
api.interceptors.request.use(request => {
  console.log('Starting Request', {
    url: request.url,
    method: request.method,
    baseURL: request.baseURL,
    fullURL: request.baseURL + request.url,
    headers: request.headers,
    data: request.data
  });
  return request;
});

// Add response interceptor for debugging
api.interceptors.response.use(
  response => {
    console.log('Response:', {
      status: response.status,
      statusText: response.statusText,
      data: response.data,
      headers: response.headers,
      config: {
        url: response.config.url,
        baseURL: response.config.baseURL,
        method: response.config.method
      }
    });
    return response;
  },
  error => {
    console.error('API Error:', {
      message: error.message,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers,
      } : 'No response',
      request: error.request ? 'Request made but no response received' : 'No request was made',
      config: {
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        method: error.config?.method,
        data: error.config?.data
      }
    });
    return Promise.reject(error);
  }
);

// Request interceptor for logging and auth
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Log request details
    console.log(`📤 [${config.method?.toUpperCase()}] ${config.url}`, {
      data: config.data,
      params: config.params,
    });
    
    return config;
  },
  (error) => {
    console.error('❌ Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => {
    console.log(`✅ [${response.status}] ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    const { response } = error;
    const errorMessage = response?.data?.message || error.message;
    
    console.error('❌ Response error:', {
      url: error.config?.url,
      status: response?.status,
      message: errorMessage,
    });

    // Handle specific error statuses
    if (response) {
      switch (response.status) {
        case 401:
          // Handle unauthorized (e.g., redirect to login)
          if (window.location.pathname !== '/login') {
            localStorage.removeItem('token');
            window.location.href = '/login';
          }
          break;
        case 404:
          toast.error('Resource not found');
          break;
        case 500:
          toast.error('Server error. Please try again later.');
          break;
        default:
          toast.error(errorMessage || 'An error occurred');
      }
    } else {
      toast.error('Network error. Please check your connection.');
    }

    return Promise.reject(error);
  }
);

// Helper function to handle API errors
export const handleApiError = (error, customMessage = 'An error occurred') => {
  console.error('API Error:', error);
  const errorMessage = error.response?.data?.message || customMessage;
  toast.error(errorMessage);
  throw new Error(errorMessage);
};

// API endpoints
export const authAPI = {
  login: (credentials) => api.post('/api/auth/signin', credentials),
  register: (userData) => api.post('/api/auth/signup', userData),
  logout: () => api.post('/api/auth/signout'),
  getCurrentUser: () => api.get('/api/auth/me')
};

// AI APIs
export const aiAPI = {
  chat: (data) => api.post('/api/ai/chat', data),
  generateContent: (data) => api.post('/api/ai/generate-content', data),
};

// Social Media APIs
export const socialMediaAPI = {
  getFacebookAuthUrl: () => api.get('/api/auth/facebook'),
  getAccounts: () => api.get('/api/social-media/accounts'),
  disconnectAccount: (accountId) => api.delete(`/api/social-media/accounts/${accountId}`),
  sendFacebookMessage: (data) => api.post('/api/social-media/facebook/message', data),
  sendInstagramMessage: (data) => api.post('/api/social-media/instagram/message', data),
};

// Admin APIs
export const adminAPI = {
  getUsers: (params) => api.get('/api/admin/users', { params }),
  getStats: () => api.get('/api/admin/stats'),
  getOnboardingData: (params) => api.get('/api/admin/onboarding', { params }),
  updateUser: (userId, data) => api.put(`/api/admin/users/${userId}`, data),
  deleteUser: (userId) => api.delete(`/api/admin/users/${userId}`),
  createUser: (data) => api.post('/api/admin/users', data),
  resetPassword: (userId, data) => api.post(`/api/admin/users/${userId}/reset-password`, data),
};

// Analytics APIs
export const analyticsAPI = {
  getDashboardData: () => api.get('/api/analytics/dashboard'),
};

// Conversation APIs
export const conversationAPI = {
  getConversations: () => api.get('/api/conversations'),
  getMessages: (conversationId) => api.get(`/api/conversations/${conversationId}/messages`),
  sendMessage: (conversationId, message) => api.post(`/api/conversations/${conversationId}/messages`, { message }),
};

export default api;

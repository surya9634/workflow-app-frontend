// src/lib/api.js
import axios from 'axios';
import { toast } from 'react-hot-toast';

// Get API URL from environment variables or use a default
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://workflow-app.onrender.com';

// Debug logging
console.log('🚀 API Configuration:');
console.log('- Base URL:', API_BASE_URL);
console.log('- Mode:', import.meta.env.MODE);
console.log('- Env:', import.meta.env);

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
  login: (credentials) => api.post('/auth/signin', credentials),
  register: (userData) => api.post('/auth/signup', userData),
  logout: () => api.post('/auth/logout'),
  getCurrentUser: () => api.get('/auth/me')
};

// AI APIs
export const aiAPI = {
  chat: (data) => api.post('/ai/chat', data),
  generateContent: (data) => api.post('/ai/generate-content', data),
};

// Social Media APIs
export const socialMediaAPI = {
  getFacebookAuthUrl: () => api.get('/auth/facebook'),
  getAccounts: () => api.get('/social-media/accounts'),
  disconnectAccount: (accountId) => api.delete(`/social-media/accounts/${accountId}`),
  sendFacebookMessage: (data) => api.post('/social-media/facebook/message', data),
  sendInstagramMessage: (data) => api.post('/social-media/instagram/message', data),
};

// Admin APIs
export const adminAPI = {
  getUsers: (params) => api.get('/admin/users', { params }),
  getStats: () => api.get('/admin/stats'),
  getOnboardingData: (params) => api.get('/admin/onboarding', { params }),
  updateUser: (userId, data) => api.put(`/admin/users/${userId}`, data),
  deleteUser: (userId) => api.delete(`/admin/users/${userId}`),
  createUser: (data) => api.post('/admin/users', data),
  resetPassword: (userId, data) => api.post(`/admin/users/${userId}/reset-password`, data),
};

// Analytics APIs
export const analyticsAPI = {
  getDashboardData: () => api.get('/analytics/dashboard'),
};

// Conversation APIs
export const conversationAPI = {
  getConversations: () => api.get('/conversations'),
  getMessages: (conversationId) => api.get(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId, message) => api.post(`/conversations/${conversationId}/messages`, { message }),
};

export default api;

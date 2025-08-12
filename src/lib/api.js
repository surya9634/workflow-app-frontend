// src/lib/api.js
import axios from 'axios';
import { toast } from 'react-hot-toast';

// Use VITE_API_URL from environment variables with fallback to empty string
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Debug logging
console.log('🔄 API Configuration:');
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
    
    // Log request details in development
    if (import.meta.env.DEV) {
      console.log(`📤 [${config.method?.toUpperCase()}] ${config.url}`, {
        data: config.data,
        params: config.params,
        headers: config.headers,
      });
    }
    
    return config;
  },
  (error) => {
    console.error('❌ Request error:', error);
    return Promise.reject(error);
  }
);

// Helper function to safely parse JSON
const safeJsonParse = (str) => {
  try {
    return str ? JSON.parse(str) : str;
  } catch (e) {
    console.warn('Failed to parse JSON:', str);
    return str;
  }
};

// Response interceptor for handling errors globally
api.interceptors.response.use(
  (response) => {
    // Ensure response data is properly parsed
    if (typeof response.data === 'string') {
      try {
        response.data = safeJsonParse(response.data);
      } catch (e) {
        console.warn('Failed to parse response data:', response.data);
      }
    }
    
    // Log successful responses in development
    if (import.meta.env.DEV) {
      console.log(`📥 [${response.status}] ${response.config.method?.toUpperCase()} ${response.config.url}`, {
        data: response.data,
        headers: response.headers,
      });
    }
    
    return response;
  },
  async (error) => {
    // Log the full error in development
    if (import.meta.env.DEV) {
      console.error('❌ API Error:', {
        message: error.message,
        config: {
          ...error.config,
          // Don't log potentially sensitive data
          data: error.config?.data ? '[REDACTED]' : undefined,
          headers: error.config?.headers ? '[REDACTED]' : undefined,
        },
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers,
        } : 'No response',
        stack: error.stack,
      });
    }

    // Handle network errors
    if (!error.response) {
      const errorMessage = 'Network error. Please check your connection.';
      console.error('Network Error:', error.message);
      toast.error(errorMessage);
      return Promise.reject({
        message: errorMessage,
        isNetworkError: true,
      });
    }

    // Handle specific status codes
    const { status, data } = error.response;
    
    // Handle 401 Unauthorized
    if (status === 401) {
      // Clear auth data and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      toast.error('Session expired. Please log in again.');
    }
    
    // Handle 403 Forbidden
    if (status === 403) {
      toast.error('You do not have permission to perform this action.');
    }
    
    // Handle 422 Unprocessable Entity (validation errors)
    if (status === 422 && data.errors) {
      const errorMessages = Object.values(data.errors).flat().join('\n');
      toast.error(errorMessages || 'Validation failed. Please check your input.');
    }
    
    // Handle 500 Internal Server Error
    if (status >= 500) {
      toast.error('Server error. Please try again later.');
    }
    
    // Handle 404 Not Found
    if (status === 404) {
      toast.error('The requested resource was not found.');
    }
    
    // Handle 500 Internal Server Error
    if (status >= 500) {
      toast.error('Server error. Please try again later.');
    }
    
    // Return a consistent error object
    return Promise.reject({
      status,
      message: data?.message || error.message || 'An error occurred',
      errors: data?.errors || {},
      data: data,
    });
  }
);

// Auth APIs
export const authAPI = {
  signup: (data) => api.post('/auth/signup', data),
  signin: (data) => api.post('/auth/signin', data),
  getCurrentUser: () => api.get('/auth/me'),
  signout: () => api.post('/auth/signout'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, newPassword) => api.post(`/auth/reset-password/${token}`, { newPassword }),
};

// Onboarding APIs
export const onboardingAPI = {
  submit: (data) => api.post('/onboarding', data),
  get: (userId) => api.get(`/onboarding/${userId}`),
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
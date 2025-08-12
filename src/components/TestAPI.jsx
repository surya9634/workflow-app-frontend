import React from 'react';
import { toast } from 'react-hot-toast';
import api from '../lib/api';

const TestAPI = () => {
  const testAPI = async () => {
    try {
      console.log('🔄 Testing API connection...');
      console.log('API Base URL:', api.defaults.baseURL);
      
      // Test with and without leading slash
      const endpoints = ['/health', 'health', '/api/health', 'api/health'];
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Testing endpoint: ${endpoint}`);
          const response = await api.get(endpoint);
          console.log(`✅ Success (${endpoint}):`, response.data);
          toast.success(`API connection successful! (${endpoint})`);
          return; // Stop on first success
        } catch (err) {
          console.log(`❌ Failed (${endpoint}):`, err.message);
        }
      }
      
      toast.error('All API test attempts failed. Check console for details.');
    } catch (error) {
      console.error('❌ API Test Error:', {
        message: error.message,
        config: error.config,
        response: error.response?.data
      });
      toast.error(`API Error: ${error.message}`);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">API Test</h2>
      <button
        onClick={testAPI}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Test API Connection
      </button>
    </div>
  );
};

export default TestAPI;

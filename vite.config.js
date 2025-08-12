import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    
    // Base public path when served in production
    base: './',
    
    // Development server configuration
    server: {
      port: 3000, // Will try 3000 first, then increment if needed
      strictPort: false, // Allow port to be incremented if 3000 is in use
      proxy: {
        // Proxy API requests to the backend in development
        '/api': {
          target: 'http://localhost:5000', // Backend server runs on port 5000
          changeOrigin: true,
          secure: false,
          ws: true, // Enable WebSocket proxy
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('Proxy error:', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Proxying request to backend:', req.method, req.url);
            });
          }
        },
      },
      cors: true, // Enable CORS for development
    },
    
    // Build configuration
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: mode === 'development',
      minify: mode === 'production' ? 'esbuild' : false,
      rollupOptions: {
        output: {
          // Ensure consistent hashing of asset names
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
        },
      },
    },
    
    // Environment variables
    define: {
      'process.env': {},
      'import.meta.env.VITE_API_URL': JSON.stringify(
        mode === 'production' ? '/api' : '/api'
      ),
    },
  };
});

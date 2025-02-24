import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),
    tailwindcss(),
  ],
  base: "/Video-Call-WebApp/",
  server: {
    proxy: {
      "/api": "http://localhost:3000", // Proxy API requests to the backend
    },
  },
})

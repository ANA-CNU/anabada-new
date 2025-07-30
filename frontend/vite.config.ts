import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          gsap: ['gsap'],
          recharts: ['recharts'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    // 빌드 최적화 설정
    minify: 'esbuild',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'gsap', 'recharts'],
  },
  // 개발 서버 최적화
  server: {
    hmr: {
      overlay: false,
    },
  },
})
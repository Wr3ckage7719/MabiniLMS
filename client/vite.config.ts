import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    open: "/teacher",
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;

          // Core runtime — always needed on first load
          if (id.includes('react-router') || id.includes('@remix-run')) return 'vendor-router';
          if (id.includes('@tanstack/')) return 'vendor-query';
          if (id.includes('@supabase/')) return 'vendor-supabase';

          // Heavy lazy-only deps — only loaded when their pages mount
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('jspdf') || id.includes('jspdf-autotable')) return 'vendor-pdf';
          if (id.includes('mammoth')) return 'vendor-mammoth';
          if (id.includes('jszip')) return 'vendor-jszip';
          if (id.includes('papaparse')) return 'vendor-papaparse';

          // UI primitives — separate bucket so one Radix update doesn't bust entire UI bundle
          if (id.includes('@radix-ui/')) return 'vendor-radix';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('date-fns')) return 'vendor-datefns';

          // Form/validation
          if (id.includes('react-hook-form') || id.includes('@hookform/') || id.includes('zod')) {
            return 'vendor-forms';
          }

          // Everything else — single hashed bucket, browser-cacheable across deploys
          return 'vendor-misc';
        },
      },
    },
  },
});

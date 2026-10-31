/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        command: {
          950: '#0B111D', // Deepest background / Top nav
          900: '#0F172A', // Main dark sidebar
          850: '#15203B', // Elevated dark panel
          800: '#1E293B', // Borders / subtle contrast
          700: '#334155',
          600: '#475569',
          500: '#64748B',
          400: '#94A3B8',
          300: '#CBD5E1',
          200: '#E2E8F0',
          100: '#F1F5F9', // Light neutral cards
          50: '#F8FAFC',  // Main workspace canvas
        },
        ops: {
          teal: '#0D9488',     // Teal 600 - Primary actions
          cyan: '#06B6D4',     // Cyan 500 - Highlights
          amber: '#D97706',    // Amber 600 - Warning / Moderate
          red: '#DC2626',      // Red 600 - Critical emergency
          green: '#16A34A',    // Green 600 - Verified / Available
          purple: '#7C3AED',   // Purple 600 - Infrastructure
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}


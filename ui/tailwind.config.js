/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#F8A5B6',
          50: '#FFF5F7',
          100: '#FDE8ED',
          200: '#FBD1DB',
          300: '#F9BAC8',
          400: '#F8A5B6',
          500: '#F090A3',
          600: '#E88398',
          700: '#D4687E',
          800: '#C0506A',
          900: '#A84058',
        },
        apple: {
          green: '#34C759',
          orange: '#FF9500',
          red: '#FF3B30',
          gray: '#8E8E93',
          lightGray: '#C7C7CC',
          border: '#E5E5EA',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Hiragino Sans GB"', 'sans-serif'],
        mono: ['"SF Mono"', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'card': '18px',
        'modal': '24px',
        'input': '12px',
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0,0,0,0.06)',
        'card-hover': '0 12px 32px rgba(0,0,0,0.1)',
        'modal': '0 24px 80px rgba(0,0,0,0.16)',
        'navbar': '0 1px 0 rgba(0,0,0,0.06)',
        'leaderboard': '0 2px 16px rgba(248,165,182,0.05)',
        'leaderboard-hover': '0 4px 20px rgba(248,165,182,0.08)',
      },
    },
  },
  plugins: [],
}

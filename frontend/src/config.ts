/**
 * Returns the base URL for API requests.
 * - In development (Vite dev server): empty string (uses Vite proxy)
 * - In production (Render/Vercel): defaults to Render backend URL if VITE_API_URL is not set
 */
export const API_BASE = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? 'https://manna-edge-backend.onrender.com' : '');

/**
 * Returns the base URL for API requests.
 * - In development (Vite dev server): empty string (uses Vite proxy)
 * - In production (Render): uses VITE_API_URL env var
 */
export const API_BASE = import.meta.env.VITE_API_URL || '';

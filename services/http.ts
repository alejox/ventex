import axios from "axios";

/**
 * Cliente HTTP compartido para APIs externas (no-Supabase).
 * Los datos propios de la app van por el cliente Supabase dentro de cada service;
 * axios queda reservado para integraciones HTTP de terceros.
 */
export const http = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { "Content-Type": "application/json" },
});

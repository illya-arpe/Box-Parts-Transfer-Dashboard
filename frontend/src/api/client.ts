import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE || "http://localhost:8002";

export const apiClient = axios.create({
  baseURL,
  timeout: 120000
});

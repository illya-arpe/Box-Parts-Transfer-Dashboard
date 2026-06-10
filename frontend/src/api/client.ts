import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE || "http://localhost:8001";

export const apiClient = axios.create({
  baseURL,
  timeout: 120000
});

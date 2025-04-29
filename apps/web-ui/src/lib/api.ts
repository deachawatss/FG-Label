import axios from "axios";
import type { AxiosRequestHeaders } from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor แนบ token ทุก request
api.interceptors.request.use((config) => {
  const t = localStorage.getItem("jwt");
  if (t) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${t}`,
    } as AxiosRequestHeaders;
  }
  return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('jwt');
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api; 
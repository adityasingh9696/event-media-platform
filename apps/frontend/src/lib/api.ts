import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Track if we're currently refreshing to avoid loops
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor: attach Bearer token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const { data } = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefresh } = data;
        localStorage.setItem('access_token', accessToken);
        if (newRefresh) {
          localStorage.setItem('refresh_token', newRefresh);
        }

        api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        processQueue(null, accessToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Clear auth and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export { api };
export default api;

// Typed API helpers
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { displayName: string; username: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  me: () => api.get('/auth/me'),
  googleAuth: () => `${API_URL}/auth/google`,
};

export const eventsApi = {
  list: (params?: Record<string, unknown>) => api.get('/events', { params }),
  get: (id: string) => api.get(`/events/${id}`),
  create: (data: FormData | Record<string, unknown>) => api.post('/events', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/events/${id}`, data),
  delete: (id: string) => api.delete(`/events/${id}`),
};

export const mediaApi = {
  list: (params?: Record<string, unknown>) => api.get('/media', { params }),
  get: (id: string) => api.get(`/media/${id}`),
  upload: (data: FormData, onProgress?: (pct: number) => void) =>
    api.post('/media/upload', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    }),
  delete: (id: string) => api.delete(`/media/${id}`),
  like: (id: string) => api.post(`/media/${id}/like`),
  unlike: (id: string) => api.delete(`/media/${id}/like`),
  search: (params: Record<string, unknown>) => api.get('/media/search', { params }),
  infinite: (params?: Record<string, unknown>) => api.get('/media', { params }),
};

export const albumsApi = {
  list: (params?: Record<string, unknown>) => api.get('/albums', { params }),
  get: (id: string) => api.get(`/albums/${id}`),
  create: (data: Record<string, unknown>) => api.post('/albums', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/albums/${id}`, data),
  delete: (id: string) => api.delete(`/albums/${id}`),
  getQR: (id: string) => api.get(`/albums/${id}/qr`),
  getMedia: (id: string, params?: Record<string, unknown>) =>
    api.get(`/albums/${id}/media`, { params }),
};

export const usersApi = {
  get: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: FormData | Record<string, unknown>) => api.put(`/users/${id}`, data),
  uploads: (id: string, params?: Record<string, unknown>) =>
    api.get(`/users/${id}/uploads`, { params }),
  favorites: (id: string, params?: Record<string, unknown>) =>
    api.get(`/users/${id}/favorites`, { params }),
  tagged: (id: string, params?: Record<string, unknown>) =>
    api.get(`/users/${id}/tagged`, { params }),
  enrollFace: (id: string, data: FormData) =>
    api.post(`/users/${id}/face-enroll`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const notificationsApi = {
  list: (params?: Record<string, unknown>) => api.get('/notifications', { params }),
  markRead: (id: string) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  unreadCount: () => api.get('/notifications/unread-count'),
};

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  users: (params?: Record<string, unknown>) => api.get('/admin/users', { params }),
  updateRole: (userId: string, role: string) => api.put(`/admin/users/${userId}/role`, { role }),
  flaggedMedia: (params?: Record<string, unknown>) => api.get('/admin/media/flagged', { params }),
  approveMedia: (id: string) => api.put(`/admin/media/${id}/approve`),
  rejectMedia: (id: string) => api.delete(`/admin/media/${id}`),
  analyticsUploads: () => api.get('/admin/analytics/uploads'),
  analyticsTopEvents: () => api.get('/admin/analytics/top-events'),
};

export const clubsApi = {
  list: () => api.get('/clubs'),
  get: (id: string) => api.get(`/clubs/${id}`),
  join: (id: string) => api.post(`/clubs/${id}/join`),
  leave: (id: string) => api.delete(`/clubs/${id}/leave`),
};

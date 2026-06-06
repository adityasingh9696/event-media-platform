import { create } from 'zustand';

export type UploadStatus = 'pending' | 'signing' | 'uploading' | 'confirming' | 'done' | 'error';

export interface UploadQueueItem {
  id: string;
  file: File;
  preview: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  cloudinaryPublicId?: string;
  cloudinaryUrl?: string;
}

interface AppState {
  // Upload queue
  uploadQueue: UploadQueueItem[];
  addToQueue: (items: UploadQueueItem[]) => void;
  updateQueueItem: (id: string, update: Partial<UploadQueueItem>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;

  // Notifications
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  clearUnread: () => void;

  // Sidebar
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Gallery filters
  galleryFilter: 'all' | 'events' | 'albums' | 'mine';
  setGalleryFilter: (f: 'all' | 'events' | 'albums' | 'mine') => void;

  // Modal states
  activeModal: string | null;
  setActiveModal: (modal: string | null) => void;

  // Club selector
  selectedClubId: string | null;
  setSelectedClubId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Upload queue
  uploadQueue: [],
  addToQueue: (items) =>
    set((state) => ({ uploadQueue: [...state.uploadQueue, ...items] })),
  updateQueueItem: (id, update) =>
    set((state) => ({
      uploadQueue: state.uploadQueue.map((item) =>
        item.id === id ? { ...item, ...update } : item
      ),
    })),
  removeFromQueue: (id) =>
    set((state) => ({
      uploadQueue: state.uploadQueue.filter((item) => item.id !== id),
    })),
  clearQueue: () => set({ uploadQueue: [] }),

  // Notifications
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnread: () =>
    set((state) => ({ unreadCount: state.unreadCount + 1 })),
  clearUnread: () => set({ unreadCount: 0 }),

  // Sidebar
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // Search
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  // Gallery filters
  galleryFilter: 'all',
  setGalleryFilter: (f) => set({ galleryFilter: f }),

  // Modal states
  activeModal: null,
  setActiveModal: (modal) => set({ activeModal: modal }),

  // Club selector
  selectedClubId: null,
  setSelectedClubId: (id) => set({ selectedClubId: id }),
}));

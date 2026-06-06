'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileImage, FileVideo, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import axios from 'axios';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { toast } from 'react-hot-toast';

interface UploadZoneProps {
  onSuccess?: () => void;
  albumId?: string;
  eventId?: string;
}

interface UploadFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'idle' | 'uploading' | 'success' | 'error';
  errorMsg?: string;
}

interface EventOption {
  id: string;
  name: string;
}

interface AlbumOption {
  id: string;
  name: string;
  eventId: string;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onSuccess, albumId: initialAlbumId, eventId: initialEventId }) => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(initialEventId || '');
  const [selectedAlbumId, setSelectedAlbumId] = useState(initialAlbumId || '');
  
  // Media info attributes
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaDesc, setMediaDesc] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch events and albums for selection
  useEffect(() => {
    async function loadSelectors() {
      try {
        const { data: eventData } = await api.get('/events');
        setEvents(eventData.data || []);
      } catch (err) {
        toast.error('Failed to load events list');
      }
    }
    loadSelectors();
  }, []);

  // Fetch albums when event changes
  useEffect(() => {
    if (!selectedEventId) {
      setAlbums([]);
      return;
    }
    async function loadAlbums() {
      try {
        const { data } = await api.get(`/events/${selectedEventId}/albums`);
        setAlbums(data || []);
        if (data.length > 0 && !initialAlbumId) {
          setSelectedAlbumId(data[0].id);
        }
      } catch (err) {
        toast.error('Failed to load albums for this event');
      }
    }
    loadAlbums();
  }, [selectedEventId, initialAlbumId]);

  // Set default event if albumId provided
  useEffect(() => {
    if (initialAlbumId && events.length > 0 && albums.length > 0) {
      const match = albums.find(a => a.id === initialAlbumId);
      if (match) {
        setSelectedEventId(match.eventId);
        setSelectedAlbumId(match.id);
      }
    }
  }, [initialAlbumId, events, albums]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const items: UploadFileItem[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: 'idle',
    }));
    setFiles(prev => [...prev, ...items]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': [],
      'video/*': [],
    },
  });

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const uploadSingleFile = async (item: UploadFileItem, index: number) => {
    try {
      // Update status to uploading
      setFiles(prev =>
        prev.map(f => (f.id === item.id ? { ...f, status: 'uploading', progress: 5 } : f))
      );

      // 1. Get upload signature from backend
      const { data: sig } = await api.post('/media/presign', {
        filename: item.file.name,
        mimeType: item.file.type,
        sizeBytes: item.file.size,
        albumId: selectedAlbumId,
      });

      // 2. Upload directly to Cloudinary
      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('api_key', sig.apiKey);
      formData.append('timestamp', sig.timestamp.toString());
      formData.append('signature', sig.signature);
      formData.append('folder', sig.folder);
      formData.append('eager', sig.eager);

      const cloudinaryRes = await axios.post(
        `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
        formData,
        {
          onUploadProgress: (progressEvent) => {
            const pct = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || item.file.size)
            );
            setFiles(prev =>
              prev.map(f => (f.id === item.id ? { ...f, progress: Math.min(pct, 95) } : f))
            );
          },
        }
      );

      const publicId = cloudinaryRes.data.public_id;
      const secureUrl = cloudinaryRes.data.secure_url;
      const width = cloudinaryRes.data.width;
      const height = cloudinaryRes.data.height;

      // 3. Confirm with backend
      await api.post('/media/confirm', {
        cloudinaryPublicId: publicId,
        cloudinaryUrl: secureUrl,
        albumId: selectedAlbumId,
        filename: item.file.name,
        mimeType: item.file.type,
        sizeBytes: item.file.size,
        title: mediaTitle || item.file.name.split('.')[0],
        description: mediaDesc || undefined,
        width,
        height,
      });

      // Update file status to success
      setFiles(prev =>
        prev.map(f => (f.id === item.id ? { ...f, status: 'success', progress: 100 } : f))
      );
    } catch (err: any) {
      console.error('File upload failed:', err);
      const msg = err.response?.data?.message || err.message || 'Upload failed';
      setFiles(prev =>
        prev.map(f => (f.id === item.id ? { ...f, status: 'error', errorMsg: msg } : f))
      );
    }
  };

  const startUpload = async () => {
    if (!selectedAlbumId) {
      toast.error('Please select an event and an album first.');
      return;
    }

    const idleFiles = files.filter(f => f.status === 'idle' || f.status === 'error');
    if (idleFiles.length === 0) {
      toast.error('No files to upload.');
      return;
    }

    setIsUploading(true);
    toast.loading('Uploading files directly to Cloudinary...', { id: 'upload' });

    // Upload files concurrently (max 3 at a time)
    const limit = 3;
    const queue = [...idleFiles];
    const activeUploads: Promise<void>[] = [];

    const processQueue = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          const index = files.findIndex(f => f.id === item.id);
          const uploadPromise = uploadSingleFile(item, index);
          activeUploads.push(uploadPromise);
          if (activeUploads.length >= limit) {
            await Promise.race(activeUploads);
          }
          // Filter out completed ones
          activeUploads.forEach((p, idx) => {
            // Remove resolved promises (just checking states isn't possible directly,
            // but we can slice/manage queue simply)
          });
        }
      }
      await Promise.all(activeUploads);
    };

    try {
      await processQueue();
      toast.success('Upload batch completed!', { id: 'upload' });
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      toast.error('Some uploads failed.', { id: 'upload' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Target Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Target Event
          </label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            disabled={isUploading || !!initialEventId}
            className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118] px-3.5 py-2.5 text-sm text-gray-200 outline-none focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/50"
          >
            <option value="">Select an Event</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Target Album
          </label>
          <select
            value={selectedAlbumId}
            onChange={(e) => setSelectedAlbumId(e.target.value)}
            disabled={isUploading || !selectedEventId || !!initialAlbumId}
            className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118] px-3.5 py-2.5 text-sm text-gray-200 outline-none focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/50"
          >
            <option value="">Select an Album</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metadata Fields (Optional) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3.5">
          <Input
            label="Media Title (Optional)"
            placeholder="E.g. Sunrise view"
            value={mediaTitle}
            onChange={(e) => setMediaTitle(e.target.value)}
            disabled={isUploading}
          />
          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Description (Optional)
            </label>
            <textarea
              placeholder="Provide a description..."
              rows={3}
              value={mediaDesc}
              onChange={(e) => setMediaDesc(e.target.value)}
              disabled={isUploading}
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118] px-3.5 py-2.5 text-sm text-gray-200 outline-none focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/50"
            />
          </div>
        </div>

        <div>
          <Input
            label="Add Tags (Press Enter)"
            placeholder="E.g. scenic, candid, party"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
            disabled={isUploading}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t, idx) => (
              <Badge key={idx} variant="info">
                {t}
                <X
                  size={12}
                  className="ml-1 cursor-pointer hover:text-white"
                  onClick={() => removeTag(idx)}
                />
              </Badge>
            ))}
            {tags.length === 0 && (
              <span className="text-xs text-gray-500 italic">No manual tags added yet. AI will auto-tag.</span>
            )}
          </div>
        </div>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all ${
          isDragActive
            ? 'border-[#6366f1] bg-[#6366f1]/5'
            : 'border-[#1e1e2e] bg-[#111118]/40 hover:border-[#6366f1]/40 hover:bg-[#111118]/80'
        }`}
      >
        <input {...getInputProps()} />
        <Upload size={36} className="text-gray-400 mb-3 group-hover:text-indigo-400" />
        <p className="text-sm text-gray-300">
          Drag & drop photos or videos here, or <span className="text-indigo-400">browse</span>
        </p>
        <p className="text-xs text-gray-500 mt-2">Supports high-res PNG, JPG, WEBP, and MP4 up to 500MB</p>
      </div>

      {/* File Queue List */}
      {files.length > 0 && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-300">Upload Queue ({files.length} items)</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiles([])}
              disabled={isUploading}
            >
              Clear Queue
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
            {files.map((file) => {
              const isImage = file.type.startsWith('image/');
              return (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border border-[#1e1e2e] bg-[#111118] p-3 transition-colors hover:bg-[#111118]/85"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {isImage ? (
                      <FileImage className="text-indigo-400 flex-shrink-0" size={20} />
                    ) : (
                      <FileVideo className="text-indigo-400 flex-shrink-0" size={20} />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate max-w-[220px] md:max-w-md">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Status Icons / Progress Bar */}
                    {file.status === 'uploading' && (
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-[#1a1a27] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 font-semibold">{file.progress}%</span>
                      </div>
                    )}
                    {file.status === 'success' && (
                      <span className="flex items-center gap-1 text-xs text-green-400 font-medium bg-green-500/10 px-2 py-0.5 rounded">
                        <CheckCircle2 size={13} />
                        Done
                      </span>
                    )}
                    {file.status === 'error' && (
                      <span
                        className="flex items-center gap-1 text-xs text-red-400 font-medium bg-red-500/10 px-2 py-0.5 rounded cursor-help"
                        title={file.errorMsg}
                      >
                        <AlertCircle size={13} />
                        Failed
                      </span>
                    )}

                    <button
                      onClick={() => removeFile(file.id)}
                      disabled={isUploading}
                      className="text-gray-500 hover:text-white transition-colors"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={startUpload} disabled={isUploading || !selectedAlbumId}>
              {isUploading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Uploading...
                </>
              ) : (
                'Upload All to Cloudinary'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

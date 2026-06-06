'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Calendar, MapPin, Plus, Folder, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

export default function EventDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const eventId = params.id as string;

  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const [albumName, setAlbumName] = useState('');
  const [albumDesc, setAlbumDesc] = useState('');
  const [albumVis, setAlbumVis] = useState<'public' | 'club_only' | 'private'>('public');

  // Fetch Event details
  const { data: event, isLoading, error } = useQuery({
    queryKey: ['event-details', eventId],
    queryFn: async () => {
      const { data } = await api.get(`/events/${eventId}`);
      return data;
    },
  });

  // Create Album Mutation
  const createAlbumMutation = useMutation({
    mutationFn: async (newAlbum: any) => {
      return api.post(`/events/${eventId}/albums`, newAlbum);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-details', eventId] });
      toast.success('Album created successfully!');
      setCreateAlbumOpen(false);
      setAlbumName('');
      setAlbumDesc('');
      setAlbumVis('public');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create album');
    },
  });

  const handleCreateAlbum = (e: React.FormEvent) => {
    e.preventDefault();
    if (!albumName) {
      toast.error('Album Name is required.');
      return;
    }
    createAlbumMutation.mutate({
      name: albumName,
      description: albumDesc,
      visibility: albumVis,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20 min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="text-center py-20">
        <h3 className="text-lg font-bold text-gray-300">Event not found</h3>
        <p className="text-sm text-gray-500 mt-1">The event you are looking for does not exist or has been deleted.</p>
        <Link href="/events" className="mt-4 inline-block">
          <Button variant="ghost">Go Back</Button>
        </Link>
      </div>
    );
  }

  // Check if member/admin to show Create Album
  const isMember = event.club?.members?.some((m: any) => m.userId === user?.id) || user?.role === 'admin';

  return (
    <div className="space-y-8">
      {/* Back button */}
      <div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      {/* Hero Event Banner */}
      <section className="relative rounded-3xl overflow-hidden border border-[#1e1e2e] bg-[#0a0a0f] min-h-[220px] md:min-h-[280px] flex items-end p-6 md:p-8">
        <div className="absolute inset-0 -z-10">
          <img
            src={event.coverImageUrl || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&q=80'}
            alt={event.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
        </div>

        <div className="w-full flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3">
            <span className="inline-block px-3 py-1 rounded-full bg-indigo-500/80 border border-indigo-400 text-[10px] font-bold text-white uppercase tracking-wider">
              {event.category}
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
              {event.name}
            </h1>
            
            {event.description && (
              <p className="text-sm text-gray-300 max-w-2xl leading-relaxed">{event.description}</p>
            )}

            {/* Meta Row */}
            <div className="flex flex-wrap gap-4 text-xs text-gray-400 font-medium">
              <span className="flex items-center gap-1">
                <Calendar size={13} className="text-indigo-400" />
                {new Date(event.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={13} className="text-indigo-400" />
                {event.location || 'Main Campus'}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Club: {event.club?.name || 'Pixel Society'}
              </span>
            </div>
          </div>

          {isMember && (
            <Button onClick={() => setCreateAlbumOpen(true)} className="shrink-0 shadow-glow-md">
              <Plus size={16} className="mr-2" />
              Create Album
            </Button>
          )}
        </div>
      </section>

      {/* Albums Header */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2 border-b border-[#1e1e2e] pb-3">
          <Folder size={18} className="text-indigo-400" />
          Event Albums ({event.albums?.length || 0})
        </h2>

        {/* Albums Grid */}
        {!event.albums || event.albums.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-[#1e1e2e] bg-[#111118]/20">
            <Folder size={40} className="mx-auto text-gray-600 mb-2.5" />
            <h4 className="font-semibold text-gray-300">No albums in this event</h4>
            <p className="text-xs text-gray-500 mt-1">Create a smart album and start gathering event snaps.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {event.albums.map((album: any) => (
              <Link href={`/albums/${album.id}`} key={album.id}>
                <div className="group relative overflow-hidden rounded-2xl border border-[#1e1e2e] bg-[#111118] p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-[#6366f1]/50 shadow-card">
                  {/* Album Cover */}
                  <div className="relative h-40 w-full overflow-hidden rounded-xl bg-black mb-3">
                    <img
                      src={album.coverImageUrl || 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=600&q=80'}
                      alt={album.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                      <div className="text-center">
                        <ImageIcon size={22} className="mx-auto text-white/80 mb-1" />
                        <span className="text-sm font-bold text-white">{album._count?.media || 0} items</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-bold text-gray-200 group-hover:text-indigo-400 transition-colors">
                      {album.name}
                    </h3>
                    <p className="text-xs text-gray-400 line-clamp-1">{album.description || 'No description.'}</p>
                  </div>

                  <div className="mt-4 flex justify-between items-center border-t border-[#1e1e2e] pt-3 text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                    <span>Vis: {album.visibility}</span>
                    <span>Created {new Date(album.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Album Modal */}
      <Modal isOpen={createAlbumOpen} onClose={() => setCreateAlbumOpen(false)} title="Create Event Album">
        <form onSubmit={handleCreateAlbum} className="space-y-4">
          <Input
            label="Album Name"
            placeholder="E.g. Group Candids"
            value={albumName}
            onChange={(e) => setAlbumName(e.target.value)}
            required
          />

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Description
            </label>
            <textarea
              placeholder="E.g. Candid portraits, hike trails, and fun group milestones."
              rows={3}
              value={albumDesc}
              onChange={(e) => setAlbumDesc(e.target.value)}
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118] px-3.5 py-2.5 text-sm text-gray-200 outline-none focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/50"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Visibility
            </label>
            <select
              value={albumVis}
              onChange={(e) => setAlbumVis(e.target.value as any)}
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118] px-3.5 py-2.5 text-sm text-gray-200 outline-none focus:border-[#6366f1]/50"
            >
              <option value="public">Public (Everyone can view)</option>
              <option value="club_only">Club Only (Members only)</option>
              <option value="private">Private (Uploader only)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-[#1e1e2e]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateAlbumOpen(false)}
              disabled={createAlbumMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createAlbumMutation.isPending}>
              {createAlbumMutation.isPending ? <Spinner size="sm" /> : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

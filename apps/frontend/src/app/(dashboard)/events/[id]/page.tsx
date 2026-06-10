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
import { Calendar, MapPin, Plus, Folder, Image as ImageIcon, ArrowLeft, Edit2, Trash2 } from 'lucide-react';
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

  const [editEventOpen, setEditEventOpen] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventCat, setEventCat] = useState('other');
  const [eventDate, setEventDate] = useState('');
  const [eventLoc, setEventLoc] = useState('');
  const [eventCoverUrl, setEventCoverUrl] = useState('');

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

  const editEventMutation = useMutation({
    mutationFn: async (updatedEvent: any) => {
      return api.patch(`/events/${eventId}`, updatedEvent);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-details', eventId] });
      toast.success('Event updated successfully!');
      setEditEventOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update event');
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/events/${eventId}`);
    },
    onSuccess: () => {
      toast.success('Event deleted successfully!');
      router.push('/events');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete event');
    },
  });

  const handleEditEvent = (e: React.FormEvent) => {
    e.preventDefault();
    editEventMutation.mutate({
      name: eventName,
      description: eventDesc,
      category: eventCat,
      date: new Date(eventDate).toISOString(),
      location: eventLoc || undefined,
      coverImageUrl: eventCoverUrl || undefined,
    });
  };
  
  const handleDeleteEvent = () => {
    if (window.confirm('Are you sure you want to delete this event and all its albums? This action cannot be undone.')) {
      deleteEventMutation.mutate();
    }
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
            <div className="flex flex-col gap-2 shrink-0">
              <Button onClick={() => setCreateAlbumOpen(true)} className="shadow-glow-md">
                <Plus size={16} className="mr-2" />
                Create Album
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEventName(event.name);
                  setEventDesc(event.description || '');
                  setEventCat(event.category || 'other');
                  setEventDate(event.date ? new Date(event.date).toISOString().slice(0, 16) : '');
                  setEventLoc(event.location || '');
                  setEventCoverUrl(event.coverImageUrl || '');
                  setEditEventOpen(true);
                }}
              >
                <Edit2 size={16} className="mr-2" />
                Edit Event
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteEvent}
                disabled={deleteEventMutation.isPending}
              >
                {deleteEventMutation.isPending ? <Spinner size="sm" className="mr-2" /> : <Trash2 size={16} className="mr-2" />}
                Delete
              </Button>
            </div>
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

      {/* Edit Event Modal */}
      <Modal isOpen={editEventOpen} onClose={() => setEditEventOpen(false)} title="Edit Event">
        <form onSubmit={handleEditEvent} className="space-y-4">
          <Input
            label="Event Name"
            placeholder="E.g. Annual Fest 2025"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            required
          />

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Description
            </label>
            <textarea
              placeholder="Provide event details, description, schedules..."
              rows={3}
              value={eventDesc}
              onChange={(e) => setEventDesc(e.target.value)}
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118] px-3.5 py-2.5 text-sm text-gray-200 outline-none focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Category
              </label>
              <select
                value={eventCat}
                onChange={(e) => setEventCat(e.target.value)}
                className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118] px-3.5 py-2.5 text-sm text-gray-200 outline-none focus:border-[#6366f1]/50"
              >
                <option value="workshop">Workshop</option>
                <option value="trip">Trip & Trek</option>
                <option value="cultural">Cultural</option>
                <option value="party">Party</option>
                <option value="competition">Competition</option>
                <option value="photoshoot">Photoshoot</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Date & Time
              </label>
              <input
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
                className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118] px-3.5 py-2 text-sm text-gray-200 outline-none focus:border-[#6366f1]/50"
              />
            </div>
          </div>

          <Input
            label="Location"
            placeholder="E.g. Main Seminar Hall"
            value={eventLoc}
            onChange={(e) => setEventLoc(e.target.value)}
          />

          <Input
            label="Cover Image URL (Optional)"
            placeholder="E.g. https://unsplash.com/..."
            value={eventCoverUrl}
            onChange={(e) => setEventCoverUrl(e.target.value)}
          />

          <div className="flex justify-end gap-2.5 pt-3 border-t border-[#1e1e2e]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditEventOpen(false)}
              disabled={editEventMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={editEventMutation.isPending}>
              {editEventMutation.isPending ? <Spinner size="sm" /> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

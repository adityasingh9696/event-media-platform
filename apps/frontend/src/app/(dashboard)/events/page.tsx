'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Calendar, MapPin, Tag, Plus, SlidersHorizontal, Search } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

type CategoryType = 'workshop' | 'trip' | 'cultural' | 'party' | 'competition' | 'photoshoot' | 'other';

export default function EventsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'category'>('date');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // New Event Form State
  const [eventName, setEventName] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventCat, setEventCat] = useState<CategoryType>('other');
  const [eventDate, setEventDate] = useState('');
  const [eventLoc, setEventLoc] = useState('');
  const [eventCoverUrl, setEventCoverUrl] = useState('');

  // Fetch Events
  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['events-list', categoryFilter, sortBy, search],
    queryFn: async () => {
      const { data } = await api.get('/events', {
        params: {
          category: categoryFilter || undefined,
          sort: sortBy,
          search: search || undefined,
          limit: 100, // list all
        },
      });
      return data.data || [];
    },
  });

  // Fetch Clubs for create-event club selection
  const { data: clubs } = useQuery({
    queryKey: ['user-clubs-for-events'],
    queryFn: async () => {
      const { data } = await api.get('/admin/clubs').catch(() => ({ data: [] }));
      return data || [];
    },
    enabled: ['admin', 'photographer', 'club_member'].includes(user?.role || ''),
  });

  const [selectedClubId, setSelectedClubId] = useState('');

  // Create Event Mutation
  const createEventMutation = useMutation({
    mutationFn: async (newEvent: any) => {
      return api.post('/events', newEvent);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events-list'] });
      toast.success('Event created successfully!');
      setCreateModalOpen(false);
      // Reset form
      setEventName('');
      setEventDesc('');
      setEventCat('other');
      setEventDate('');
      setEventLoc('');
      setEventCoverUrl('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create event');
    },
  });

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName || !eventDate || !selectedClubId) {
      toast.error('Event Name, Date, and Club selection are required.');
      return;
    }

    createEventMutation.mutate({
      name: eventName,
      description: eventDesc,
      category: eventCat,
      date: new Date(eventDate).toISOString(),
      location: eventLoc || undefined,
      coverImageUrl: eventCoverUrl || undefined,
      clubId: selectedClubId,
    });
  };

  const categories: Array<{ value: string; label: string }> = [
    { value: 'workshop', label: 'Workshops' },
    { value: 'trip', label: 'Trips & Treks' },
    { value: 'cultural', label: 'Cultural' },
    { value: 'party', label: 'Parties' },
    { value: 'competition', label: 'Competitions' },
    { value: 'photoshoot', label: 'Photoshoots' },
    { value: 'other', label: 'Others' },
  ];

  const canCreateEvent = ['admin', 'photographer', 'club_member'].includes(user?.role || '');

  return (
    <div className="space-y-8">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Event Hubs</h1>
          <p className="text-sm text-gray-400 mt-1">Browse and contribute to album collections organized by club events.</p>
        </div>

        {canCreateEvent && (
          <Button onClick={() => {
            if (clubs && clubs.length > 0) {
              setSelectedClubId(clubs[0].id);
            }
            setCreateModalOpen(true);
          }} className="shadow-glow-md">
            <Plus size={16} className="mr-2" />
            Create Event
          </Button>
        )}
      </div>

      {/* Filter and Sort Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border-b border-[#1e1e2e] pb-6">
        {/* Search & Sort */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search events by name, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118]/80 py-2 pl-9 pr-4 text-sm text-gray-200 outline-none focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-gray-500 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-lg border border-[#1e1e2e] bg-[#111118] px-3.5 py-2 text-xs text-gray-300 outline-none focus:border-[#6366f1]/50"
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="category">Sort by Category</option>
            </select>
          </div>
        </div>

        {/* Category Filters scroll bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none shrink-0 max-w-full">
          <button
            onClick={() => setCategoryFilter('')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              categoryFilter === ''
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                : 'bg-transparent border-[#1e1e2e] text-gray-400 hover:text-gray-200 hover:border-gray-700'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                categoryFilter === cat.value
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  : 'bg-transparent border-[#1e1e2e] text-gray-400 hover:text-gray-200 hover:border-gray-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Events Grid */}
      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Spinner size="lg" />
        </div>
      ) : !eventsData || eventsData.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-[#1e1e2e] bg-[#111118]/20">
          <Calendar size={48} className="mx-auto text-gray-600 mb-3" />
          <h3 className="font-semibold text-gray-300">No events found</h3>
          <p className="text-sm text-gray-500 mt-1">Try resetting your search query or category filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {eventsData.map((event: any) => (
            <Link href={`/events/${event.id}`} key={event.id}>
              <div className="group relative overflow-hidden rounded-2xl border border-[#1e1e2e] bg-[#111118] p-5 cursor-pointer transition-all hover:scale-[1.02] hover:border-[#6366f1]/50 hover:shadow-lg hover:shadow-indigo-500/5">
                {/* Cover Image */}
                <div className="relative h-44 w-full overflow-hidden rounded-xl bg-black mb-4">
                  <img
                    src={event.coverImageUrl || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&q=80'}
                    alt={event.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                  
                  {/* Floating Date Badge */}
                  <div className="absolute top-3 left-3 rounded-lg bg-black/80 px-2.5 py-1 text-center text-white backdrop-blur-sm border border-white/5">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                      {new Date(event.date).toLocaleDateString(undefined, { month: 'short' })}
                    </span>
                    <span className="block text-base font-extrabold tracking-tight">
                      {new Date(event.date).toLocaleDateString(undefined, { day: 'numeric' })}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                      {event.category}
                    </span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{event.club?.name}</span>
                  </div>

                  <h3 className="font-bold text-gray-100 text-lg group-hover:text-indigo-400 transition-colors">
                    {event.name}
                  </h3>
                  
                  {event.description && (
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{event.description}</p>
                  )}
                </div>

                {/* Location / Action row */}
                <div className="mt-5 flex items-center justify-between border-t border-[#1e1e2e] pt-3.5 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin size={13} className="shrink-0 text-indigo-400" />
                    <span className="truncate">{event.location || 'Campus'}</span>
                  </div>
                  <span className="shrink-0 font-semibold">{event._count?.albums || 0} Albums</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Event Modal */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create New Event">
        <form onSubmit={handleCreateEvent} className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Managing Club
            </label>
            <select
              value={selectedClubId}
              onChange={(e) => setSelectedClubId(e.target.value)}
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118] px-3.5 py-2.5 text-sm text-gray-200 outline-none focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/50"
            >
              {clubs?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

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
                onChange={(e) => setEventCat(e.target.value as CategoryType)}
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
              onClick={() => setCreateModalOpen(false)}
              disabled={createEventMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createEventMutation.isPending}>
              {createEventMutation.isPending ? <Spinner size="sm" /> : 'Create Hub'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

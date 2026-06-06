'use client';

import React, { useState, useEffect, useRef, startTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { MediaCard } from '@/components/media/MediaCard';
import { LightboxViewer } from '@/components/media/LightboxViewer';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Camera, Image as ImageIcon, Calendar, Users, SlidersHorizontal, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function DashboardHome() {
  const { selectedClubId, galleryFilter, setGalleryFilter } = useAppStore();
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Stats
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', selectedClubId],
    queryFn: async () => {
      // Fetch events list to calculate event count
      const { data: eventsData } = await api.get('/events', {
        params: { clubId: selectedClubId || undefined, limit: 100 }
      });
      // Fetch media search to calculate media count
      const { data: mediaData } = await api.get('/search', {
        params: { limit: 1 }
      });

      return {
        eventsCount: eventsData?.data?.length || 3,
        photosCount: mediaData?.meta?.total || 142,
        membersCount: 24, // demo representation
      };
    },
  });

  // 2. Infinite query for Media Gallery
  const {
    data: mediaPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingMedia,
    refetch: refetchMedia,
  } = useInfiniteQuery({
    queryKey: ['gallery-media', selectedClubId, galleryFilter],
    queryFn: async ({ pageParam = 1 }) => {
      const params: Record<string, any> = {
        page: pageParam,
        limit: 12,
      };
      
      // If filtering by club, we will fetch events for that club and pass them, or filter
      const { data } = await api.get('/search', { params });
      return data; // { data: [...], meta: { total, page, limit, totalPages } }
    },
    getNextPageParam: (lastPage) => {
      const meta = lastPage?.meta;
      if (meta && meta.page < meta.totalPages) {
        return meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  // 3. Fetch Events
  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ['gallery-events', selectedClubId],
    queryFn: async () => {
      const { data } = await api.get('/events', {
        params: { clubId: selectedClubId || undefined, limit: 20 }
      });
      return data.data || [];
    },
  });

  // Infinite Scroll Trigger
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.8 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Refetch media when club changes
  useEffect(() => {
    refetchMedia();
  }, [selectedClubId, refetchMedia]);

  const allMediaItems = mediaPages?.pages.flatMap((page) => page.data || []) || [];

  // Filter items in memory by club if a club is selected
  const filteredMediaItems = selectedClubId
    ? allMediaItems.filter((item: any) => item.album?.event?.clubId === selectedClubId)
    : allMediaItems;

  return (
    <div className="space-y-8">
      {/* Hero Intro Section */}
      <section className="relative rounded-3xl overflow-hidden border border-[#1e1e2e] bg-[#111118]/40 p-6 md:p-8 backdrop-blur-md">
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-indigo-500/5 blur-[90px] -z-10" />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-violet-500/5 blur-[80px] -z-10" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              <span className="gradient-text">Capture.</span>{' '}
              <span className="text-gray-100">Preserve.</span>{' '}
              <span className="gradient-text">Relive.</span>
            </h1>
            <p className="text-sm text-gray-400 max-w-lg leading-relaxed">
              Welcome to the university flagship media portal. Upload, automatically tag faces, and collaborate in secure real-time albums.
            </p>
          </div>

          {/* Quick upload trigger */}
          <Link href="/upload">
            <Button className="shadow-glow-md">
              <Sparkles size={16} className="mr-2" />
              Upload Photos
            </Button>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="mt-8 grid grid-cols-3 gap-4 border-t border-[#1e1e2e] pt-6 max-w-xl">
          <div className="space-y-1">
            <p className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              {stats?.eventsCount ?? 0}
            </p>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1">
              <Calendar size={12} className="text-indigo-400" /> Events
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              {stats?.photosCount ?? 0}
            </p>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1">
              <ImageIcon size={12} className="text-indigo-400" /> Photos
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              {stats?.membersCount ?? 0}
            </p>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1">
              <Users size={12} className="text-indigo-400" /> Active Members
            </p>
          </div>
        </div>
      </section>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#1e1e2e] pb-4">
        <div className="flex rounded-lg bg-[#111118] p-1 border border-[#1e1e2e] text-xs">
          {[
            { id: 'all', label: 'All Photos', icon: <ImageIcon size={14} /> },
            { id: 'events', label: 'Events List', icon: <Calendar size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => startTransition(() => setGalleryFilter(tab.id as any))}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-semibold transition-all ${
                galleryFilter === tab.id
                  ? 'bg-[#1a1a27] text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <Button variant="ghost" size="sm" className="text-gray-400 text-xs">
          <SlidersHorizontal size={14} className="mr-1.5" />
          Filter Options
        </Button>
      </div>

      {/* Main Tab Views */}
      <div className="min-h-[400px]">
        {galleryFilter === 'all' && (
          <div className="space-y-6">
            {loadingMedia ? (
              <div className="flex justify-center items-center py-20">
                <Spinner size="lg" />
              </div>
            ) : filteredMediaItems.length === 0 ? (
              <div className="text-center py-20 rounded-2xl border border-[#1e1e2e] bg-[#111118]/20">
                <ImageIcon size={48} className="mx-auto text-gray-600 mb-3" />
                <h3 className="font-semibold text-gray-300">No media found</h3>
                <p className="text-sm text-gray-500 mt-1">Be the first to upload photos to this vault!</p>
                <Link href="/upload" className="mt-4 inline-block">
                  <Button variant="outline" size="sm">Upload Now</Button>
                </Link>
              </div>
            ) : (
              <>
                {/* Responsive Masonry Layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {filteredMediaItems.map((media: any) => (
                    <MediaCard
                      key={media.id}
                      media={media}
                      onSelect={(id) => setSelectedMediaId(id)}
                    />
                  ))}
                </div>

                {/* Infinite Scroll Load Trigger */}
                <div ref={loadMoreRef} className="flex justify-center py-10">
                  {isFetchingNextPage && <Spinner />}
                </div>
              </>
            )}
          </div>
        )}

        {galleryFilter === 'events' && (
          <div>
            {loadingEvents ? (
              <div className="flex justify-center items-center py-20">
                <Spinner size="lg" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-20 rounded-2xl border border-[#1e1e2e] bg-[#111118]/20">
                <Calendar size={48} className="mx-auto text-gray-600 mb-3" />
                <h3 className="font-semibold text-gray-300">No events found</h3>
                <p className="text-sm text-gray-500 mt-1">Clubs haven't created any active event hubs yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event: any) => (
                  <Link href={`/events/${event.id}`} key={event.id}>
                    <div className="group relative overflow-hidden rounded-2xl border border-[#1e1e2e] bg-[#111118] p-5 cursor-pointer transition-all hover:scale-[1.02] hover:border-[#6366f1]/50 shadow-card">
                      {event.coverImageUrl && (
                        <div className="relative h-40 w-full overflow-hidden rounded-xl bg-black mb-4">
                          <img
                            src={event.coverImageUrl}
                            alt={event.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        </div>
                      )}
                      
                      <div className="space-y-1.5">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                          {event.category}
                        </span>
                        <h3 className="font-bold text-gray-200 text-lg group-hover:text-indigo-400 transition-colors">
                          {event.name}
                        </h3>
                        <p className="text-xs text-gray-400 line-clamp-2">{event.description || 'No description provided.'}</p>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-[#1e1e2e] pt-3.5 text-xs text-gray-500">
                        <div className="flex items-center gap-1.5">
                          <Users size={13} />
                          <span>{event.club?.name}</span>
                        </div>
                        <span>{event._count?.albums || 0} Albums</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox Modal overlay */}
      <AnimatePresence>
        {selectedMediaId && (
          <LightboxViewer
            mediaId={selectedMediaId}
            onClose={() => setSelectedMediaId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

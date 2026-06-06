'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MediaCard } from '@/components/media/MediaCard';
import { LightboxViewer } from '@/components/media/LightboxViewer';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Search, SlidersHorizontal, Image as ImageIcon, Calendar, User, Tag, Sparkles } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [searchVal, setSearchVal] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // Filters State
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedMediaType, setSelectedMediaType] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');

  // Fetch suggestions
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      try {
        const { data } = await api.get('/search/suggest', {
          params: { q: query, limit: 6 },
        });
        setSuggestions(data.suggestions || []);
      } catch (err) {
        // ignore suggestions error
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  // Fetch search results
  const { data: searchData, isLoading } = useQuery({
    queryKey: ['search-results', searchVal, selectedTag, selectedMediaType, selectedEventId],
    queryFn: async () => {
      const params: Record<string, any> = {
        q: searchVal || undefined,
        tags: selectedTag || undefined,
        mediaType: selectedMediaType || undefined,
        eventId: selectedEventId || undefined,
        limit: 40,
      };
      const { data } = await api.get('/search', { params });
      return data;
    },
  });

  // Fetch events list for sidebar event selector filter
  const { data: events } = useQuery({
    queryKey: ['search-filter-events'],
    queryFn: async () => {
      const { data } = await api.get('/events', { params: { limit: 100 } });
      return data.data || [];
    },
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchVal(query);
    setShowSuggestions(false);
    // Sync url
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleSuggestionClick = (val: string) => {
    setQuery(val);
    setSearchVal(val);
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(val)}`);
  };

  const results = searchData?.data || [];
  const source = searchData?.source || 'postgresql';

  // Popular tags to choose from (demo list, or extract from results)
  const popularTags = ['trek', 'nature', 'party', 'dance', 'race', 'sprints', 'celebration', 'awards'];

  return (
    <div className="space-y-8">
      {/* Search Header Container */}
      <div className="max-w-3xl mx-auto text-center space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
          <Search className="text-indigo-400" /> Vault Search
        </h1>
        <p className="text-sm text-gray-400">Search high-res assets, events, smart tags, or facial recognition matches.</p>

        {/* Large Input with Suggestion overlay */}
        <form onSubmit={handleSearchSubmit} className="relative mt-6 max-w-xl mx-auto">
          <div className="relative flex items-center bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 h-12 focus-within:border-[#6366f1]/50 focus-within:ring-1 focus-within:ring-[#6366f1]/50 transition-all">
            <Search className="text-gray-500 mr-3" size={18} />
            <input
              type="text"
              placeholder="Search by keywords, tags, events..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSearchVal('');
                  router.push('/search');
                }}
                className="text-xs font-bold text-gray-500 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* Suggestion Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-13 left-0 right-0 z-20 border border-[#1e1e2e] bg-[#111118] rounded-xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.6)] text-left">
              {suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSuggestionClick(sug)}
                  className="w-full px-4 py-3 text-xs text-gray-300 font-semibold border-b border-[#1e1e2e]/50 hover:bg-[#1a1a27] text-left block"
                >
                  🔍 {sug}
                </button>
              ))}
            </div>
          )}
        </form>
      </div>

      {/* Main Split Layout: Sidebar Filters + Masonry Results */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar Filters */}
        <aside className="w-full lg:w-64 shrink-0 rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 p-5 space-y-6 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-3">
            <h4 className="font-bold text-sm text-gray-300 flex items-center gap-1.5">
              <SlidersHorizontal size={14} className="text-indigo-400" /> Filters
            </h4>
            <button
              onClick={() => {
                setSelectedTag('');
                setSelectedMediaType('');
                setSelectedEventId('');
                setQuery('');
                setSearchVal('');
                router.push('/search');
              }}
              className="text-[10px] text-gray-500 hover:text-indigo-400 font-bold uppercase tracking-wider"
            >
              Reset All
            </button>
          </div>

          {/* Media Type */}
          <div className="space-y-2">
            <h5 className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Asset Type</h5>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: '', label: 'All' },
                { id: 'image', label: 'Images' },
                { id: 'video', label: 'Videos' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedMediaType(t.id)}
                  className={`px-2 py-1.5 rounded-lg border text-center text-xs font-semibold transition-all ${
                    selectedMediaType === t.id
                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                      : 'bg-transparent border-[#1e1e2e] text-gray-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Events Filter */}
          <div className="space-y-2">
            <h5 className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Filter by Event</h5>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-3.5 py-2 text-xs text-gray-300 outline-none focus:border-[#6366f1]/50"
            >
              <option value="">All Events</option>
              {events?.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tags Chips Filter */}
          <div className="space-y-2.5">
            <h5 className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Popular Tags</h5>
            <div className="flex flex-wrap gap-1.5">
              {popularTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    selectedTag === tag
                      ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                      : 'bg-transparent border-[#1e1e2e] text-gray-400 hover:text-white hover:border-gray-600'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Results Pane */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-200">Search Results ({results.length} items found)</h3>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[#111118] px-2 py-0.5 border border-[#1e1e2e] rounded">
              Engine: {source}
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Spinner size="lg" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-[#1e1e2e] bg-[#111118]/20">
              <ImageIcon size={44} className="mx-auto text-gray-600 mb-3" />
              <h3 className="font-semibold text-gray-300">No matches found</h3>
              <p className="text-sm text-gray-500 mt-1">Try tweaking your search query or removing filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {results.map((media: any) => (
                <MediaCard
                  key={media.id}
                  media={media}
                  onSelect={(id) => setSelectedMediaId(id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Overlay */}
      {selectedMediaId && (
        <LightboxViewer
          mediaId={selectedMediaId}
          onClose={() => setSelectedMediaId(null)}
        />
      )}
    </div>
  );
}

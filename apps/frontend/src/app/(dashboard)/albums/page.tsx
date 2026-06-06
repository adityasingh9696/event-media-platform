'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Folder, Film, Search } from 'lucide-react';
import Link from 'next/link';

export default function AlbumsPage() {
  const [search, setSearch] = useState('');

  // Fetch Albums
  const { data: albums = [], isLoading } = useQuery({
    queryKey: ['albums-list'],
    queryFn: async () => {
      const { data } = await api.get('/albums');
      return data || [];
    },
  });

  const filteredAlbums = albums.filter((album: any) =>
    album.name.toLowerCase().includes(search.toLowerCase()) ||
    album.event?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
          <Film className="text-indigo-400" /> Photo Albums
        </h1>
        <p className="text-sm text-gray-400 mt-1">Browse photo and video albums compiled across all active events.</p>
      </div>

      {/* Toolbar */}
      <div className="max-w-md">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search albums by name or event..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#1e1e2e] bg-[#111118]/80 py-2 pl-9 pr-4 text-xs text-gray-200 outline-none focus:border-[#6366f1]/50"
          />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Spinner size="lg" />
        </div>
      ) : filteredAlbums.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-[#1e1e2e] bg-[#111118]/20">
          <Folder size={44} className="mx-auto text-gray-600 mb-3" />
          <h3 className="font-semibold text-gray-300">No albums found</h3>
          <p className="text-sm text-gray-500 mt-1">We couldn't find any albums matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredAlbums.map((album: any) => (
            <Link href={`/albums/${album.id}`} key={album.id}>
              <div className="group relative overflow-hidden rounded-2xl border border-[#1e1e2e] bg-[#111118] p-4.5 cursor-pointer transition-all hover:scale-[1.02] hover:border-[#6366f1]/50 hover:shadow-lg hover:shadow-indigo-500/5">
                {/* Album Cover */}
                <div className="relative h-40 w-full overflow-hidden rounded-xl bg-black mb-3">
                  <img
                    src={album.coverImageUrl || 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=600&q=80'}
                    alt={album.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                    <span className="text-sm font-bold text-white uppercase tracking-wider">{album._count?.media || 0} Snaps</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-gray-200 text-base group-hover:text-indigo-400 transition-colors">
                    {album.name}
                  </h3>
                  <p className="text-xs text-indigo-400 truncate">Event: {album.event?.name}</p>
                  {album.description && (
                    <p className="text-xs text-gray-400 line-clamp-1 mt-1">{album.description}</p>
                  )}
                </div>

                <div className="mt-4 flex justify-between items-center border-t border-[#1e1e2e] pt-3 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  <span>Vis: {album.visibility}</span>
                  <span>Created {new Date(album.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

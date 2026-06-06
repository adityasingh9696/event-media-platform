'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { MediaCard } from '@/components/media/MediaCard';
import { LightboxViewer } from '@/components/media/LightboxViewer';
import { Link2, QrCode, Upload, ArrowLeft, Image as ImageIcon, Download } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

export default function AlbumDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const albumId = params.id as string;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Fetch Album details
  const { data: album, isLoading: loadingAlbum } = useQuery({
    queryKey: ['album-details', albumId],
    queryFn: async () => {
      const { data } = await api.get(`/albums/${albumId}`);
      return data;
    },
  });

  // Fetch Album Media items (Infinite Query)
  const {
    data: mediaPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingMedia,
  } = useInfiniteQuery({
    queryKey: ['album-media', albumId],
    queryFn: async ({ pageParam = '' }) => {
      const { data } = await api.get(`/albums/${albumId}/media`, {
        params: {
          cursor: pageParam || undefined,
          limit: 12,
        },
      });
      return data; // { data: [...], meta: { hasMore, nextCursor, limit } }
    },
    getNextPageParam: (lastPage) => {
      return lastPage?.meta?.nextCursor || undefined;
    },
    initialPageParam: '',
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

  const handleShareLink = async () => {
    if (!album) return;
    const shareLink = album.shareCode
      ? `${window.location.origin}/share/${album.shareCode}`
      : `${window.location.origin}/albums/${album.id}`;
    
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success('Album share link copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  if (loadingAlbum) {
    return (
      <div className="flex justify-center items-center py-20 min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="text-center py-20">
        <h3 className="text-lg font-bold text-gray-300">Album not found</h3>
        <p className="text-sm text-gray-500 mt-1">The album you are looking for does not exist or has been deleted.</p>
        <Link href="/events" className="mt-4 inline-block">
          <Button variant="ghost">Go Back</Button>
        </Link>
      </div>
    );
  }

  const mediaItems = mediaPages?.pages.flatMap((page) => page.data || []) || [];
  const qrCodeUrl = `${process.env.NEXT_PUBLIC_API_URL}/albums/${albumId}/qr`;
  const isMember = album.event?.club?.members?.some((m: any) => m.userId === user?.id) || user?.role === 'admin';

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

      {/* Album Header Details */}
      <section className="relative rounded-3xl overflow-hidden border border-[#1e1e2e] bg-[#111118]/40 p-6 md:p-8 backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">{album.name}</h1>
            {album.description && (
              <p className="text-sm text-gray-400 max-w-xl leading-relaxed">{album.description}</p>
            )}
            <div className="flex flex-wrap gap-3.5 text-xs text-gray-500 font-semibold uppercase tracking-wider pt-2">
              <span className="text-indigo-400">
                Event: <Link href={`/events/${album.event?.id}`} className="underline hover:text-white">{album.event?.name}</Link>
              </span>
              <span>•</span>
              <span>{album._count?.media || 0} Media Items</span>
              <span>•</span>
              <span>Visibility: {album.visibility}</span>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap gap-2 pt-2 md:pt-0">
            <Button variant="outline" size="sm" onClick={handleShareLink}>
              <Link2 size={15} className="mr-1.5" />
              Copy Share Link
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQrModalOpen(true)}>
              <QrCode size={15} className="mr-1.5" />
              QR Code
            </Button>
            {isMember && (
              <Link href={`/upload?albumId=${albumId}&eventId=${album.event?.id}`}>
                <Button size="sm">
                  <Upload size={15} className="mr-1.5" />
                  Upload Snaps
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Media Grid */}
      <div className="space-y-4">
        {loadingMedia ? (
          <div className="flex justify-center items-center py-20">
            <Spinner size="lg" />
          </div>
        ) : mediaItems.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-[#1e1e2e] bg-[#111118]/20">
            <ImageIcon size={44} className="mx-auto text-gray-600 mb-3" />
            <h3 className="font-semibold text-gray-300">No media uploaded yet</h3>
            <p className="text-sm text-gray-500 mt-1">This album is empty. Upload your event shots now!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {mediaItems.map((media: any) => (
                <MediaCard
                  key={media.id}
                  media={media}
                  onSelect={(id) => setSelectedMediaId(id)}
                />
              ))}
            </div>

            {/* Infinite loading trigger */}
            <div ref={loadMoreRef} className="flex justify-center py-10">
              {isFetchingNextPage && <Spinner />}
            </div>
          </>
        )}
      </div>

      {/* QR Code Modal */}
      <Modal isOpen={qrModalOpen} onClose={() => setQrModalOpen(false)} title="Album QR Code">
        <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center">
          <p className="text-sm text-gray-400">Scan this QR code with a phone camera to quickly view or join this album.</p>
          <div className="relative w-64 h-64 border border-[#1e1e2e] rounded-xl overflow-hidden bg-white p-2">
            <img src={qrCodeUrl} alt="Album QR Code" className="w-full h-full object-contain" />
          </div>
          <Button variant="outline" size="sm" onClick={() => window.open(qrCodeUrl, '_blank')}>
            <Download size={14} className="mr-1.5" /> Download QR Image
          </Button>
        </div>
      </Modal>

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

'use client';

import React, { useState, startTransition } from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageSquare, Download, Share2, Tag, ShieldAlert } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '../../lib/auth-context';
import { api } from '../../lib/api';
import { toast } from 'react-hot-toast';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { getCloudinaryUrl } from '../../lib/cloudinary';

export interface MediaCardProps {
  media: {
    id: string;
    title: string | null;
    s3Key: string; // contains Cloudinary public ID
    mimeType: string;
    mediaType: 'image' | 'video';
    createdAt: string;
    isModerationFlagged: boolean;
    uploader: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
    };
    album: {
      id: string;
      name: string;
      event: {
        id: string;
        name: string;
      };
    };
    tags: Array<{
      tag: {
        id: string;
        name: string;
      };
    }>;
    _count: {
      likes: number;
      comments: number;
    };
  };
  onSelect: (mediaId: string) => void;
  isLikedInitially?: boolean;
}

export const MediaCard: React.FC<MediaCardProps> = ({ media, onSelect, isLikedInitially = false }) => {
  const { user } = useAuth();
  const [liked, setLiked] = useState(isLikedInitially);
  const [likesCount, setLikesCount] = useState(media._count?.likes || 0);
  const [imgLoaded, setImgLoaded] = useState(false);

  const thumbUrl = getCloudinaryUrl(media.s3Key, 'w_400,h_300,c_fill,q_auto,f_auto');
  const placeholderUrl = getCloudinaryUrl(media.s3Key, 'w_20,h_15,c_fill,e_blur:300,q_10');

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.error('Please log in to like photos');
      return;
    }

    // Optimistic Update
    setLiked(!liked);
    setLikesCount(liked ? likesCount - 1 : likesCount + 1);

    try {
      await api.post(`/social/${media.id}/like`);
    } catch (err) {
      // Revert if error
      setLiked(liked);
      setLikesCount(likesCount);
      toast.error('Failed to like media');
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data } = await api.post(`/social/${media.id}/share`, { expiresIn: 24 });
      const shareLink = `${window.location.origin}/share/${data.shortCode}`;
      await navigator.clipboard.writeText(shareLink);
      toast.success('Share link copied to clipboard!');
    } catch (err) {
      toast.error('Failed to generate share link');
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Direct file stream request
      const downloadUrl = `${process.env.NEXT_PUBLIC_API_URL}/media/${media.id}/download`;
      // Open in a new tab to trigger download stream headers
      window.open(downloadUrl, '_blank');
      toast.success('Download started');
    } catch (err) {
      toast.error('Download failed');
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      onClick={() => onSelect(media.id)}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-[#1e1e2e] bg-[#111118] transition-all hover:scale-[1.02] hover:border-[#6366f1]/50 hover:shadow-lg hover:shadow-indigo-500/10"
    >
      {/* Moderation Banner */}
      {media.isModerationFlagged && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-red-500/95 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          <ShieldAlert size={14} />
          Flagged for Review
        </div>
      )}

      {/* Media Content */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0a0a0f]">
        {/* Placeholder Blur Image */}
        {!imgLoaded && (
          <div className="absolute inset-0 z-0">
            <Image
              src={placeholderUrl}
              alt={media.title || 'Loading...'}
              fill
              className="object-cover blur-md scale-110"
              unoptimized
            />
          </div>
        )}

        {media.mediaType === 'image' ? (
          <Image
            src={thumbUrl}
            alt={media.title || 'Media item'}
            fill
            className={`object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)}
            unoptimized
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center bg-black">
            <video
              src={thumbUrl}
              className="h-full w-full object-cover"
              muted
              playsInline
              onLoadedData={() => setImgLoaded(true)}
            />
            <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
              <span className="rounded-full bg-indigo-500/80 p-2.5 text-white">▶</span>
            </div>
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>

      {/* Details Box */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-semibold text-gray-100 truncate max-w-[170px]">
              {media.title || 'Untitled'}
            </h4>
            <Link
              href={`/events/${media.album?.event?.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-indigo-400 hover:underline truncate block"
            >
              {media.album?.event?.name}
            </Link>
          </div>
          
          {/* Tag Chips */}
          <div className="flex flex-wrap gap-1 justify-end max-w-[120px]">
            {media.tags?.slice(0, 2).map((t) => (
              <Badge key={t.tag.id} variant="accent">
                {t.tag.name}
              </Badge>
            ))}
          </div>
        </div>

        {/* Footer Metrics */}
        <div className="mt-3.5 flex items-center justify-between border-t border-[#1e1e2e] pt-3 text-xs text-gray-400">
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Avatar
              src={media.uploader?.avatarUrl}
              alt={media.uploader?.displayName}
              size="sm"
            />
            <span className="truncate max-w-[80px]" title={media.uploader?.displayName}>
              {media.uploader?.displayName}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1 transition-colors hover:text-red-400 ${liked ? 'text-red-500' : ''}`}
            >
              <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
              <span>{likesCount}</span>
            </button>
            
            <div className="flex items-center gap-1">
              <MessageSquare size={15} />
              <span>{media._count?.comments || 0}</span>
            </div>

            {/* Hover Actions Menu */}
            <div className="hidden group-hover:flex items-center gap-2 border-l border-[#1e1e2e] pl-2.5">
              <button
                onClick={handleDownload}
                title="Download"
                className="hover:text-white transition-colors"
              >
                <Download size={14} />
              </button>
              <button
                onClick={handleShare}
                title="Share Link"
                className="hover:text-white transition-colors"
              >
                <Share2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

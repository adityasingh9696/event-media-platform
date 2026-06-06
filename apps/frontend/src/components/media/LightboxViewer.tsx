'use client';

import React, { useState, useEffect, startTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, Bookmark, Share2, Download, Send, Tag, Calendar, User, MessageCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { getCloudinaryUrl } from '../../lib/cloudinary';
import { toast } from 'react-hot-toast';

interface LightboxViewerProps {
  mediaId: string | null;
  onClose: () => void;
}

interface CommentItem {
  id: string;
  text: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  parentId?: string | null;
  replies?: CommentItem[];
}

interface MediaDetail {
  id: string;
  title: string | null;
  description: string | null;
  s3Key: string;
  mimeType: string;
  mediaType: 'image' | 'video';
  isProcessed: boolean;
  isModerationFlagged: boolean;
  createdAt: string;
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
      clubId: string;
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
    favorites: number;
  };
  metadata?: {
    aiCaption?: string;
    aiTags?: string[];
  } | null;
}

export const LightboxViewer: React.FC<LightboxViewerProps> = ({ mediaId, onClose }) => {
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Load media details and comments
  useEffect(() => {
    if (!mediaId) return;

    async function loadDetails() {
      setLoading(true);
      try {
        const [detailRes, commentsRes, likesRes, favsRes] = await Promise.all([
          api.get(`/media/${mediaId}`),
          api.get(`/social/${mediaId}/comments`),
          api.get(`/social/${mediaId}/likes`),
          api.get('/users/me/favorites').catch(() => ({ data: [] })),
        ]);

        setMedia(detailRes.data);
        setComments(commentsRes.data || []);

        // Check if liked
        const isLiked = likesRes.data?.some((l: any) => l.userId === user?.id);
        setLiked(isLiked);

        // Check if favorited
        const isFav = favsRes.data?.some((f: any) => f.mediaId === mediaId);
        setFavorited(isFav);
      } catch (err) {
        toast.error('Failed to load photo details');
        onClose();
      } finally {
        setLoading(false);
      }
    }

    loadDetails();
  }, [mediaId, user?.id, onClose]);

  const handleLike = async () => {
    if (!user || !media) return;
    setLiked(!liked);
    if (media) {
      media._count.likes = liked ? media._count.likes - 1 : media._count.likes + 1;
    }
    try {
      await api.post(`/social/${media.id}/like`);
    } catch (err) {
      setLiked(liked);
      toast.error('Failed to update like status');
    }
  };

  const handleFavorite = async () => {
    if (!user || !media) return;
    setFavorited(!favorited);
    try {
      await api.post(`/social/${media.id}/favorite`);
      toast.success(favorited ? 'Removed from favorites' : 'Saved to favorites');
    } catch (err) {
      setFavorited(favorited);
      toast.error('Failed to update favorite status');
    }
  };

  const handleShare = async () => {
    if (!media) return;
    try {
      const { data } = await api.post(`/social/${media.id}/share`, { expiresIn: 24 });
      const shareLink = `${window.location.origin}/share/${data.shortCode}`;
      await navigator.clipboard.writeText(shareLink);
      toast.success('Share link copied to clipboard!');
    } catch (err) {
      toast.error('Failed to generate share link');
    }
  };

  const handleDownload = () => {
    if (!media) return;
    const downloadUrl = `${process.env.NEXT_PUBLIC_API_URL}/media/${media.id}/download`;
    window.open(downloadUrl, '_blank');
    toast.success('Download started');
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !media || submittingComment) return;

    setSubmittingComment(true);
    try {
      const { data } = await api.post(`/social/${media.id}/comments`, {
        text: newComment.trim(),
      });
      setComments([data, ...comments]);
      setNewComment('');
      media._count.comments++;
    } catch (err) {
      toast.error('Failed to submit comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!media) return;
    try {
      await api.delete(`/social/${media.id}/comments/${commentId}`);
      setComments(comments.filter(c => c.id !== commentId));
      media._count.comments--;
      toast.success('Comment deleted');
    } catch (err) {
      toast.error('Failed to delete comment');
    }
  };

  if (!mediaId) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 md:p-6 backdrop-blur-md">
        {/* Background Click Close */}
        <div className="absolute inset-0 cursor-default" onClick={onClose} />

        {/* Floating Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 rounded-full bg-[#111118]/80 p-2 text-gray-400 hover:text-white hover:bg-[#1a1a27] transition-all"
        >
          <X size={20} />
        </button>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative z-10 flex h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-[#1e1e2e] bg-[#0a0a0f]"
          onClick={(e) => e.stopPropagation()}
        >
          {loading ? (
            <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f]">
              <Spinner size="lg" />
            </div>
          ) : (
            media && (
              <div className="flex h-full w-full flex-col md:flex-row">
                {/* Left Side: Media Display */}
                <div className="relative flex flex-1 items-center justify-center bg-[#050508] p-4">
                  {media.mediaType === 'image' ? (
                    <div className="relative h-full w-full">
                      <img
                        src={getCloudinaryUrl(media.s3Key, 'q_auto,f_auto')}
                        alt={media.title || 'Enlarged photo'}
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : (
                    <video
                      src={getCloudinaryUrl(media.s3Key)}
                      controls
                      autoPlay
                      className="max-h-full max-w-full rounded-lg"
                    />
                  )}
                </div>

                {/* Right Side: Description, Metadata & Comments */}
                <div className="flex w-full flex-col border-t border-[#1e1e2e] bg-[#111118] md:w-[400px] md:border-t-0 md:border-l">
                  {/* Uploader / Info Header */}
                  <div className="border-b border-[#1e1e2e] p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={media.uploader?.avatarUrl}
                        alt={media.uploader?.displayName}
                        size="md"
                      />
                      <div>
                        <h4 className="font-semibold text-gray-200">{media.uploader?.displayName}</h4>
                        <p className="text-xs text-gray-500">@{media.uploader?.username}</p>
                      </div>
                    </div>
                  </div>

                  {/* Body Info Scrollable container */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
                    <div>
                      <h3 className="text-lg font-bold text-gray-100">{media.title || 'Untitled'}</h3>
                      {media.description && (
                        <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">{media.description}</p>
                      )}
                    </div>

                    {/* AI Smart Features panel */}
                    {(media.metadata?.aiCaption || media.tags.length > 0) && (
                      <div className="rounded-xl bg-[#1a1a27]/60 border border-[#1e1e2e] p-3.5 space-y-3">
                        <h5 className="text-xs font-bold text-[#6366f1] uppercase tracking-wider flex items-center gap-1.5">
                          <span>✦</span> Pixel AI Insight
                        </h5>
                        
                        {media.metadata?.aiCaption && (
                          <div className="text-xs text-gray-300 italic">
                            &ldquo;{media.metadata.aiCaption}&rdquo;
                          </div>
                        )}

                        {media.tags && media.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {media.tags.map((t) => (
                              <Badge key={t.tag.id} variant="accent">
                                {t.tag.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Details Row */}
                    <div className="space-y-2 text-xs text-gray-500">
                      <div className="flex items-center gap-2">
                        <Calendar size={13} />
                        <span>Uploaded on {new Date(media.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tag size={13} />
                        <span>Event: {media.album?.event?.name} / {media.album?.name}</span>
                      </div>
                    </div>

                    {/* Action Buttons Toolbar */}
                    <div className="flex items-center gap-2 border-y border-[#1e1e2e] py-3.5">
                      <Button
                        variant={liked ? 'primary' : 'outline'}
                        size="sm"
                        onClick={handleLike}
                        className="flex-1 gap-1.5"
                      >
                        <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
                        {liked ? 'Liked' : 'Like'} ({media._count.likes})
                      </Button>

                      <Button
                        variant={favorited ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={handleFavorite}
                        className="flex-1 gap-1.5"
                      >
                        <Bookmark size={15} fill={favorited ? 'currentColor' : 'none'} />
                        {favorited ? 'Saved' : 'Save'}
                      </Button>

                      <Button variant="outline" size="sm" onClick={handleShare} className="p-2.5">
                        <Share2 size={15} />
                      </Button>

                      <Button variant="outline" size="sm" onClick={handleDownload} className="p-2.5">
                        <Download size={15} />
                      </Button>
                    </div>

                    {/* Comments List */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-gray-300 text-sm flex items-center gap-1.5">
                        <MessageCircle size={15} />
                        Comments ({media._count.comments})
                      </h4>

                      <div className="space-y-3.5">
                        {comments.length === 0 ? (
                          <p className="text-xs text-gray-500 italic py-2">No comments yet. Start the conversation!</p>
                        ) : (
                          comments.map((comment) => (
                            <div key={comment.id} className="group/cmt flex gap-3 text-xs leading-relaxed">
                              <Avatar
                                src={comment.user?.avatarUrl}
                                alt={comment.user?.displayName}
                                size="sm"
                              />
                              <div className="flex-1 bg-[#1a1a27]/30 border border-[#1e1e2e]/30 rounded-lg p-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-gray-300">{comment.user?.displayName}</span>
                                  {user && (user.id === comment.user.id || user.role === 'admin') && (
                                    <button
                                      onClick={() => deleteComment(comment.id)}
                                      className="text-gray-500 hover:text-red-400 opacity-0 group-hover/cmt:opacity-100 transition-opacity"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                                <p className="text-gray-400 mt-1">{comment.text}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Add Comment Input Form */}
                  <form onSubmit={handleAddComment} className="border-t border-[#1e1e2e] p-4 bg-[#111118]">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Write a comment..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        disabled={submittingComment}
                        className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] py-2.5 pl-4 pr-11 text-xs text-gray-200 outline-none focus:border-[#6366f1]/50"
                      />
                      <button
                        type="submit"
                        disabled={!newComment.trim() || submittingComment}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-indigo-400 hover:text-white transition-colors disabled:text-gray-600"
                      >
                        {submittingComment ? <Spinner size="sm" /> : <Send size={15} />}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

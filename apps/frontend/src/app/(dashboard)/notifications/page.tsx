'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { LightboxViewer } from '@/components/media/LightboxViewer';
import { Heart, MessageSquare, Tag, Bell, Share2, Check, CheckSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // Fetch Notifications
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: async () => {
      const { data } = await api.get('/notifications', { params: { limit: 50 } });
      return data.data || [];
    },
  });

  // Mark all read mutation
  const readAllMutation = useMutation({
    mutationFn: async () => {
      return api.patch('/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
      toast.success('All notifications marked as read.');
    },
  });

  // Mark single read mutation
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.patch(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'media_liked':
        return <Heart className="text-red-500 shrink-0" size={16} fill="currentColor" />;
      case 'media_commented':
        return <MessageSquare className="text-blue-400 shrink-0" size={16} />;
      case 'media_tagged':
      case 'friend_tagged':
        return <Tag className="text-indigo-400 shrink-0" size={16} />;
      case 'media_shared':
        return <Share2 className="text-teal-400 shrink-0" size={16} />;
      default:
        return <Bell className="text-gray-400 shrink-0" size={16} />;
    }
  };

  const handleNotificationClick = async (notification: any) => {
    // Mark as read
    if (!notification.isRead) {
      markReadMutation.mutate(notification.id);
    }
    
    // Parse metadata to extract mediaId if possible
    const mediaId = notification.metadata?.mediaId;
    if (mediaId) {
      setSelectedMediaId(mediaId);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1e1e2e] pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Bell size={24} className="text-indigo-400" /> Notifications
          </h1>
          <p className="text-sm text-gray-400 mt-1">Keep track of likes, comments, and automated facial recognition tags.</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => readAllMutation.mutate()}
          disabled={readAllMutation.isPending || notifications.length === 0}
        >
          <CheckSquare size={14} className="mr-1.5" />
          Mark all read
        </Button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Spinner size="lg" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-[#1e1e2e] bg-[#111118]/20">
            <Bell size={40} className="mx-auto text-gray-600 mb-2.5 animate-bounce" />
            <h4 className="font-semibold text-gray-300">All caught up!</h4>
            <p className="text-xs text-gray-500 mt-1">No new notifications in your inbox.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden border border-[#1e1e2e] bg-[#111118]/40 divide-y divide-[#1e1e2e]/50">
            {notifications.map((notif: any) => {
              const hasMedia = !!notif.metadata?.mediaId;
              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`flex items-start justify-between gap-4 p-4.5 transition-colors ${
                    hasMedia ? 'cursor-pointer hover:bg-[#1a1a27]/30' : ''
                  } ${!notif.isRead ? 'bg-indigo-500/5' : ''}`}
                >
                  <div className="flex gap-3.5 min-w-0">
                    <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a1a27] border border-[#1e1e2e]/60">
                      {getNotificationIcon(notif.type)}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <p className={`text-xs text-gray-200 leading-normal ${!notif.isRead ? 'font-semibold' : ''}`}>
                        {notif.message}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {formatDistanceToNow(new Date(notif.createdAt))} ago
                      </p>
                    </div>
                  </div>

                  {/* Action/Indicator dot */}
                  <div className="flex items-center shrink-0">
                    {!notif.isRead ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse" />
                    ) : (
                      <Check className="text-gray-600" size={14} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox Modal overlay */}
      {selectedMediaId && (
        <LightboxViewer
          mediaId={selectedMediaId}
          onClose={() => setSelectedMediaId(null)}
        />
      )}
    </div>
  );
}

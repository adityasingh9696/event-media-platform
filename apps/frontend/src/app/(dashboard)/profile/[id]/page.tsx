'use client';

import React, { useState, useRef, startTransition } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { MediaCard } from '@/components/media/MediaCard';
import { LightboxViewer } from '@/components/media/LightboxViewer';
import { User, Image as ImageIcon, Camera, Star, Calendar, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const profileId = params.id as string;
  const isMe = profileId === currentUser?.id;

  const tabParam = searchParams.get('tab') as 'uploads' | 'face-enroll' | 'favorites';
  const [activeTab, setActiveTab] = useState<'uploads' | 'face-enroll' | 'favorites'>(
    tabParam && ['uploads', 'face-enroll', 'favorites'].includes(tabParam) ? tabParam : 'uploads'
  );
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Public Profile details
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['profile-details', profileId],
    queryFn: async () => {
      const { data } = await api.get(`/users/${profileId}/profile`);
      return data;
    },
  });

  // Fetch User's uploads (if me, use me endpoint, else custom)
  const { data: uploads, isLoading: loadingUploads } = useQuery({
    queryKey: ['profile-uploads', profileId],
    queryFn: async () => {
      if (isMe) {
        const { data } = await api.get('/users/me/uploads', { params: { limit: 40 } });
        return data.data || [];
      } else {
        const { data } = await api.get('/search', { params: { uploaderId: profileId, limit: 40 } });
        return data.data || [];
      }
    },
  });

  // Fetch face matches (only for current logged-in user viewing themselves)
  const { data: matchedPhotos, isLoading: loadingMatches } = useQuery({
    queryKey: ['profile-matches'],
    queryFn: async () => {
      const { data } = await api.get('/users/me/my-photos', { params: { limit: 40 } });
      return data.data || [];
    },
    enabled: isMe,
  });

  // Fetch Favorites
  const { data: favorites, isLoading: loadingFavs } = useQuery({
    queryKey: ['profile-favorites'],
    queryFn: async () => {
      const { data } = await api.get('/users/me/favorites');
      return data || [];
    },
    enabled: isMe,
  });

  // Face Enrollment Mutation
  const enrollFaceMutation = useMutation({
    mutationFn: async (enrollData: { selfieBase64: string; clubId: string }) => {
      return api.post('/users/me/face-enroll', enrollData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-details', profileId] });
      queryClient.invalidateQueries({ queryKey: ['profile-matches'] });
      toast.success('Face profile enrolled successfully!');
      setEnrolling(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Face enrollment failed. Make sure a face is clearly visible.');
      setEnrolling(false);
    },
  });

  // Delete Enrollment Mutation
  const deleteEnrollmentMutation = useMutation({
    mutationFn: async () => {
      return api.delete('/users/me/face-enrollment');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-details', profileId] });
      toast.success('Face enrollment removed.');
    },
    onError: () => {
      toast.error('Failed to remove face enrollment');
    },
  });

  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Selfie must be under 8MB');
      return;
    }

    setEnrolling(true);
    toast.loading('Uploading selfie and building face profile...', { id: 'enroll' });

    // Read file as base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      
      // Grab first club membership or fallback to a hardcoded club if admin seeded it
      const clubId = profile?.clubMemberships?.[0]?.club?.id || 'demo-club';

      enrollFaceMutation.mutate({
        selfieBase64: base64,
        clubId,
      }, {
        onSettled: () => {
          toast.dismiss('enroll');
        }
      });
    };
    reader.readAsDataURL(file);
  };

  if (loadingProfile) {
    return (
      <div className="flex justify-center items-center py-20 min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <h3 className="text-lg font-bold text-gray-300">Profile not found</h3>
        <p className="text-sm text-gray-500 mt-1">The user profile does not exist.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Profile Header Card */}
      <section className="relative rounded-3xl overflow-hidden border border-[#1e1e2e] bg-[#111118]/40 p-6 md:p-8 backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-indigo-500/50 bg-[#0a0a0f] flex items-center justify-center shrink-0">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
            ) : (
              <User size={48} className="text-gray-600" />
            )}
          </div>

          <div className="flex-1 text-center md:text-left space-y-2">
            <div className="flex flex-col md:flex-row md:items-center gap-2 justify-center md:justify-start">
              <h1 className="text-2xl font-extrabold text-white">{profile.displayName}</h1>
              <Badge variant="accent" className="w-fit mx-auto md:mx-0">
                {profile.role.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-sm text-gray-400">@{profile.username}</p>
            {profile.bio && <p className="text-xs text-gray-300 max-w-xl">{profile.bio}</p>}
            
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 font-semibold uppercase tracking-wider pt-2 justify-center md:justify-start">
              <span className="flex items-center gap-1">
                <Calendar size={13} /> Joined {new Date(profile.createdAt).toLocaleDateString()}
              </span>
              <span>•</span>
              <span>{profile._count?.uploadedMedia || 0} Uploads</span>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex border-b border-[#1e1e2e] pb-4 gap-2">
        <button
          onClick={() => startTransition(() => setActiveTab('uploads'))}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-semibold text-xs transition-all ${
            activeTab === 'uploads' ? 'bg-[#1a1a27] text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <ImageIcon size={14} /> Uploads ({profile._count?.uploadedMedia || 0})
        </button>

        {isMe && (
          <>
            <button
              onClick={() => startTransition(() => setActiveTab('face-enroll'))}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-semibold text-xs transition-all ${
                activeTab === 'face-enroll' ? 'bg-[#1a1a27] text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Camera size={14} /> My Detected Photos ({matchedPhotos?.length || 0})
            </button>

            <button
              onClick={() => startTransition(() => setActiveTab('favorites'))}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-semibold text-xs transition-all ${
                activeTab === 'favorites' ? 'bg-[#1a1a27] text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Star size={14} /> Saved Favorites
            </button>
          </>
        )}
      </div>

      {/* Tab Panels */}
      <div className="min-h-[300px]">
        {activeTab === 'uploads' && (
          <div>
            {loadingUploads ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : uploads.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-10 text-center">No uploads found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {uploads.map((media: any) => (
                  <MediaCard key={media.id} media={media} onSelect={setSelectedMediaId} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'face-enroll' && isMe && (
          <div className="space-y-6">
            {/* Enrollment selfie card status */}
            <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/60 p-6 flex flex-col md:flex-row items-center gap-6 justify-between">
              <div className="space-y-1.5 flex-1">
                <h3 className="font-bold text-gray-200 text-lg flex items-center gap-2">
                  <ShieldCheck size={20} className="text-green-400" /> Facial Recognition Enrollment
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
                  Upload a clear, high-resolution portrait selfie. Our local AI will analyze facial geometry and create a secure mathematical embedding to automatically scan future event group photos and tag you!
                </p>
                <div className="text-xs pt-1.5">
                  Status:{' '}
                  {profile.faceEnrollmentEnabled ? (
                    <span className="text-green-400 font-bold">● Active & Enrolled</span>
                  ) : (
                    <span className="text-amber-400 font-bold">● Not Enrolled</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSelfieUpload}
                  className="hidden"
                />
                
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={enrolling}
                >
                  {profile.faceEnrollmentEnabled ? 'Re-enroll Face' : 'Enroll Now'}
                </Button>

                {profile.faceEnrollmentEnabled && (
                  <Button
                    variant="danger"
                    size="icon"
                    onClick={() => deleteEnrollmentMutation.mutate()}
                    disabled={deleteEnrollmentMutation.isPending}
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
            </div>

            {/* AI Detected Match Gallery */}
            <div className="space-y-4">
              <h3 className="font-bold text-gray-200 text-sm">Photos You Were Detected In</h3>
              {loadingMatches ? (
                <div className="flex justify-center py-10"><Spinner /></div>
              ) : !matchedPhotos || matchedPhotos.length === 0 ? (
                <div className="text-center py-12 rounded-xl border border-[#1e1e2e] bg-[#111118]/10 text-xs text-gray-500 italic">
                  No automated matches detected yet. Enroll your face or wait for more event snaps to be uploaded.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {matchedPhotos.map((item: any) => (
                    <div key={item.media.id} className="relative group">
                      <MediaCard media={item.media} onSelect={setSelectedMediaId} />
                      <div className="absolute top-2 right-2 bg-indigo-600/90 text-[10px] font-bold text-white px-2 py-0.5 rounded-full border border-indigo-400/35 z-10">
                        {item.confidence}% Match
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'favorites' && isMe && (
          <div>
            {loadingFavs ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : favorites.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-10 text-center">No favorites saved.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {favorites.map((fav: any) => (
                  <MediaCard key={fav.media.id} media={fav.media} onSelect={setSelectedMediaId} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox Modal overlay */}
      {selectedMediaId && (
        <LightboxViewer mediaId={selectedMediaId} onClose={() => setSelectedMediaId(null)} />
      )}
    </div>
  );
}

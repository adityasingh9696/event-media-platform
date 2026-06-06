'use client';

import React, { use } from 'react';
import { UploadZone } from '@/components/media/UploadZone';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload, Sparkles } from 'lucide-react';

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const albumId = searchParams.get('albumId') || '';
  const eventId = searchParams.get('eventId') || '';

  const handleUploadSuccess = () => {
    // If successfully uploaded, redirect to the album page or home
    if (albumId) {
      router.push(`/albums/${albumId}`);
    } else {
      router.push('/');
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
          <Upload className="text-indigo-400" /> Upload Snaps
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Upload images or videos directly to Cloudinary. Our AI will automatically caption and tag your media, and detect enrolled faces!
        </p>
      </div>

      {/* Upload Box Container */}
      <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/60 p-6 md:p-8 backdrop-blur-md">
        <UploadZone
          albumId={albumId}
          eventId={eventId}
          onSuccess={handleUploadSuccess}
        />
      </div>

      {/* Upload tips card */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 flex gap-3 text-xs leading-relaxed text-indigo-300">
        <Sparkles size={16} className="shrink-0 text-indigo-400 mt-0.5 animate-pulse" />
        <div className="space-y-1.5">
          <h4 className="font-bold text-indigo-200">Pro Tip: Facial Auto-Detection</h4>
          <p>
            Make sure to remind your club members to enroll their faces in their profile tab! Once enrolled, our background processor will automatically identify them in any photos uploaded to this album and tag them in their personal photo stream.
          </p>
        </div>
      </div>
    </div>
  );
}

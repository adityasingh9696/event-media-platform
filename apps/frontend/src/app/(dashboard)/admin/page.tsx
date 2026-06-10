'use client';

import React, { useState, useEffect, startTransition } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ShieldAlert, Users, Folder, ImageIcon, HardDrive, Trash2, CheckCircle, Settings, Plus, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'clubs' | 'flagged' | 'queues'>('analytics');
  const [chartMounted, setChartMounted] = useState(false);

  // Club Management States
  const [manageClubId, setManageClubId] = useState<string | null>(null);
  const [createClubOpen, setCreateClubOpen] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubDesc, setNewClubDesc] = useState('');
  const [newMemberIdentifier, setNewMemberIdentifier] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');

  // Recharts needs client mount verification
  useEffect(() => {
    setChartMounted(true);
  }, []);

  // 1. Fetch Analytics
  const { data: analytics, isLoading: loadingAnalytics } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: async () => {
      const { data } = await api.get('/admin/analytics');
      return data;
    },
    enabled: user?.role === 'admin',
  });

  // 2. Fetch Users
  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users', { params: { limit: 100 } });
      return data.data || [];
    },
    enabled: user?.role === 'admin' && activeTab === 'users',
  });

  // 3. Fetch Flagged Media
  const { data: flaggedMedia = [], isLoading: loadingFlagged } = useQuery({
    queryKey: ['admin-flagged-media'],
    queryFn: async () => {
      const { data } = await api.get('/admin/flagged');
      return data || [];
    },
    enabled: user?.role === 'admin' && activeTab === 'flagged',
  });

  // 4. Fetch Queue Stats
  const { data: queueStats = [], isLoading: loadingQueues } = useQuery({
    queryKey: ['admin-queues-list'],
    queryFn: async () => {
      const { data } = await api.get('/admin/queues');
      return data || [];
    },
    enabled: user?.role === 'admin' && activeTab === 'queues',
  });

  // Role modification Mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return api.patch(`/admin/users/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users-list'] });
      toast.success('User role updated successfully');
    },
  });

  // Moderation Resolution Mutation
  const moderateMediaMutation = useMutation({
    mutationFn: async ({ mediaId, approved }: { mediaId: string; approved: boolean }) => {
      return api.patch(`/admin/flagged/${mediaId}`, { approved });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-flagged-media'] });
      toast.success(variables.approved ? 'Media approved/unflagged' : 'Media deleted successfully');
    },
  });

  // 5. Fetch Clubs
  const { data: clubsData = [], isLoading: loadingClubs } = useQuery({
    queryKey: ['admin-clubs-list'],
    queryFn: async () => {
      const { data } = await api.get('/admin/clubs');
      return data || [];
    },
    enabled: user?.role === 'admin' && activeTab === 'clubs',
  });

  // 6. Fetch specific Club Members
  const { data: clubMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['admin-club-members', manageClubId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/clubs/${manageClubId}/members`);
      return data || [];
    },
    enabled: !!manageClubId,
  });

  // Club Mutations
  const createClubMutation = useMutation({
    mutationFn: async () => {
      return api.post('/admin/clubs', { name: newClubName, description: newClubDesc });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs-list'] });
      toast.success('Club created successfully');
      setCreateClubOpen(false);
      setNewClubName('');
      setNewClubDesc('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create club')
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      return api.post(`/admin/clubs/${manageClubId}/members`, { userIdentifier: newMemberIdentifier, role: newMemberRole });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-club-members', manageClubId] });
      toast.success('Member added successfully');
      setNewMemberIdentifier('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to add member')
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return api.patch(`/admin/clubs/${manageClubId}/members/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-club-members', manageClubId] });
      toast.success('Member role updated');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return api.delete(`/admin/clubs/${manageClubId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-club-members', manageClubId] });
      toast.success('Member removed');
    },
  });

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-20 text-red-400">
        <ShieldAlert size={48} className="mx-auto mb-4" />
        <h3 className="text-lg font-bold">Access Denied</h3>
        <p className="text-sm">You must be an administrator to access the admin panel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Admin Control Panel</h1>
        <p className="text-sm text-gray-400 mt-1">Monitor uploads, manage system queues, moderate flagged content, and control user scopes.</p>
      </div>

      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4.5">
        <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 p-5 flex items-center gap-4.5">
          <div className="h-11 w-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Users</p>
            <p className="text-2xl font-black text-white mt-1">{analytics?.counts?.users ?? 0}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 p-5 flex items-center gap-4.5">
          <div className="h-11 w-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <Folder size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Event Hubs</p>
            <p className="text-2xl font-black text-white mt-1">{analytics?.counts?.events ?? 0}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 p-5 flex items-center gap-4.5">
          <div className="h-11 w-11 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            <ImageIcon size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Photos/Videos</p>
            <p className="text-2xl font-black text-white mt-1">{analytics?.counts?.media ?? 0}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 p-5 flex items-center gap-4.5">
          <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <HardDrive size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Clubs Active</p>
            <p className="text-2xl font-black text-white mt-1">{analytics?.counts?.clubs ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1e1e2e] pb-4 gap-2">
        {[
          { id: 'analytics', label: 'Analytics Insights' },
          { id: 'users', label: 'Roster & Scopes' },
          { id: 'clubs', label: 'Club Management' },
          { id: 'flagged', label: `Moderation (${flaggedMedia.length})` },
          { id: 'queues', label: 'Queue Diagnostics' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => startTransition(() => setActiveTab(tab.id as any))}
            className={`px-4 py-2 rounded-md font-semibold text-xs transition-all ${
              activeTab === tab.id ? 'bg-[#1a1a27] text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panels */}
      <div className="min-h-[400px]">
        {/* Analytics Insights */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Area Chart: Uploads per Day */}
            <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 p-5 space-y-4">
              <h3 className="font-bold text-sm text-gray-300">Upload Activity (Last 30 Days)</h3>
              {loadingAnalytics ? (
                <div className="flex justify-center items-center h-64"><Spinner /></div>
              ) : chartMounted && analytics?.uploadsPerDay ? (
                <div className="h-64 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.uploadsPerDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                      <XAxis dataKey="date" stroke="#4b5563" />
                      <YAxis stroke="#4b5563" />
                      <Tooltip contentStyle={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }} />
                      <Area type="monotone" dataKey="count" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </div>

            {/* Bar Chart: Top Events */}
            <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 p-5 space-y-4">
              <h3 className="font-bold text-sm text-gray-300">Popular Events (by photo count)</h3>
              {loadingAnalytics ? (
                <div className="flex justify-center items-center h-64"><Spinner /></div>
              ) : chartMounted && analytics?.topEvents ? (
                <div className="h-64 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.topEvents}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                      <XAxis dataKey="name" stroke="#4b5563" />
                      <YAxis stroke="#4b5563" />
                      <Tooltip contentStyle={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }} />
                      <Bar dataKey="mediaCount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Users Management */}
        {activeTab === 'users' && (
          <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 overflow-hidden">
            {loadingUsers ? (
              <div className="flex justify-center py-20"><Spinner /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e1e2e] bg-[#111118] text-gray-500 uppercase font-bold tracking-wider">
                      <th className="p-4">Name</th>
                      <th className="p-4">Username</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Role / Scope</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e2e]/50">
                    {usersData.map((u: any) => (
                      <tr key={u.id} className="hover:bg-[#1a1a27]/20 text-gray-300">
                        <td className="p-4 font-bold">{u.displayName}</td>
                        <td className="p-4 font-mono">@{u.username}</td>
                        <td className="p-4 text-gray-400">{u.email}</td>
                        <td className="p-4">
                          <select
                            value={u.role}
                            onChange={(e) => updateRoleMutation.mutate({ userId: u.id, role: e.target.value })}
                            className="bg-[#0a0a0f] border border-[#1e1e2e] text-xs text-gray-300 rounded px-2.5 py-1.5 focus:border-[#6366f1]/50 outline-none"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="club_member">Club Member</option>
                            <option value="photographer">Photographer</option>
                            <option value="admin">Administrator</option>
                          </select>
                        </td>
                        <td className="p-4 text-right">
                          <span className={u.isActive ? 'text-green-400' : 'text-red-500'}>
                            {u.isActive ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Club Management */}
        {activeTab === 'clubs' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreateClubOpen(true)} className="shadow-glow-md">
                <Plus size={16} className="mr-2" /> Create Club
              </Button>
            </div>
            
            <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 overflow-hidden">
              {loadingClubs ? (
                <div className="flex justify-center py-20"><Spinner /></div>
              ) : clubsData.length === 0 ? (
                <div className="text-center py-20 text-xs text-gray-500 italic">No clubs found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#1e1e2e] bg-[#111118] text-gray-500 uppercase font-bold tracking-wider">
                        <th className="p-4">Club Name</th>
                        <th className="p-4">Description</th>
                        <th className="p-4">Members</th>
                        <th className="p-4">Events</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e2e]/50">
                      {clubsData.map((c: any) => (
                        <tr key={c.id} className="hover:bg-[#1a1a27]/20 text-gray-300">
                          <td className="p-4 font-bold">{c.name}</td>
                          <td className="p-4 text-gray-400 truncate max-w-[200px]">{c.description || 'No description'}</td>
                          <td className="p-4 font-mono">{c._count?.members || 0}</td>
                          <td className="p-4 font-mono">{c._count?.events || 0}</td>
                          <td className="p-4 text-right">
                            <Button size="sm" variant="secondary" onClick={() => setManageClubId(c.id)}>
                              <Settings size={14} className="mr-1" /> Manage Members
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content Moderation */}
        {activeTab === 'flagged' && (
          <div className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 overflow-hidden">
            {loadingFlagged ? (
              <div className="flex justify-center py-20"><Spinner /></div>
            ) : flaggedMedia.length === 0 ? (
              <div className="text-center py-20 text-xs text-gray-500 italic">
                No flagged media items pending moderation review.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e1e2e] bg-[#111118] text-gray-500 uppercase font-bold tracking-wider">
                      <th className="p-4">Asset</th>
                      <th className="p-4">Title</th>
                      <th className="p-4">Uploader</th>
                      <th className="p-4">Event Context</th>
                      <th className="p-4 text-right">Resolution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e2e]/50">
                    {flaggedMedia.map((m: any) => (
                      <tr key={m.id} className="hover:bg-[#1a1a27]/20 text-gray-300">
                        <td className="p-4">
                          <div className="relative h-12 w-16 overflow-hidden rounded bg-black">
                            <img
                              src={`https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/w_150,h_100,c_fill/${m.s3Key}`}
                              alt={m.title}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        </td>
                        <td className="p-4 font-bold">{m.title}</td>
                        <td className="p-4">@{m.uploader?.username}</td>
                        <td className="p-4 text-gray-400">{m.album?.event?.name}</td>
                        <td className="p-4 text-right space-x-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => moderateMediaMutation.mutate({ mediaId: m.id, approved: true })}
                            disabled={moderateMediaMutation.isPending}
                          >
                            <CheckCircle size={14} className="mr-1" /> Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => moderateMediaMutation.mutate({ mediaId: m.id, approved: false })}
                            disabled={moderateMediaMutation.isPending}
                          >
                            <Trash2 size={14} className="mr-1" /> Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Queue Diagnostics */}
        {activeTab === 'queues' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {loadingQueues ? (
              <div className="col-span-3 flex justify-center py-20"><Spinner /></div>
            ) : queueStats.map((q: any) => (
              <div key={q.name} className="rounded-2xl border border-[#1e1e2e] bg-[#111118]/40 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-3">
                  <h4 className="font-bold text-gray-200 font-mono text-xs">{q.name}</h4>
                  <Badge variant={q.active > 0 ? 'accent' : 'info'}>
                    {q.active > 0 ? 'Processing' : 'Idle'}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500 font-medium">Active:</span>
                    <span className="ml-1.5 font-bold text-white">{q.active}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Waiting:</span>
                    <span className="ml-1.5 font-bold text-white">{q.waiting}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Completed:</span>
                    <span className="ml-1.5 font-bold text-green-400">{q.completed}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium">Failed:</span>
                    <span className="ml-1.5 font-bold text-red-400">{q.failed}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Club Modal */}
      <Modal isOpen={createClubOpen} onClose={() => setCreateClubOpen(false)} title="Create New Club">
        <div className="space-y-4 pt-4 text-sm">
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-semibold uppercase">Club Name</label>
            <Input 
              value={newClubName} 
              onChange={e => setNewClubName(e.target.value)} 
              placeholder="e.g. Photography Club" 
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-semibold uppercase">Description (Optional)</label>
            <Input 
              value={newClubDesc} 
              onChange={e => setNewClubDesc(e.target.value)} 
              placeholder="Brief description..." 
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateClubOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => createClubMutation.mutate()} 
              disabled={!newClubName || createClubMutation.isPending}
            >
              {createClubMutation.isPending ? 'Creating...' : 'Create Club'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manage Members Modal */}
      <Modal 
        isOpen={!!manageClubId} 
        onClose={() => { setManageClubId(null); setNewMemberIdentifier(''); }} 
        title="Manage Club Members"
      >
        <div className="space-y-6 pt-4">
          
          {/* Add Member Form */}
          <div className="bg-[#111118]/60 p-4 rounded-xl border border-[#1e1e2e] space-y-3">
            <h4 className="text-xs font-bold uppercase text-gray-400">Add New Member</h4>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-gray-500">Username or Email</label>
                <Input 
                  value={newMemberIdentifier}
                  onChange={e => setNewMemberIdentifier(e.target.value)}
                  placeholder="user@example.com"
                  className="h-9"
                />
              </div>
              <div className="w-32 space-y-1">
                <label className="text-xs text-gray-500">Role</label>
                <select 
                  value={newMemberRole}
                  onChange={e => setNewMemberRole(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-[#1e1e2e] text-sm text-gray-300 rounded h-9 px-2 focus:border-[#6366f1]/50 outline-none"
                >
                  <option value="admin">Admin</option>
                  <option value="photographer">Photographer</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <Button 
                onClick={() => addMemberMutation.mutate()} 
                disabled={!newMemberIdentifier || addMemberMutation.isPending}
                className="h-9"
              >
                {addMemberMutation.isPending ? <Spinner size="sm" /> : 'Add'}
              </Button>
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            <h4 className="text-xs font-bold uppercase text-gray-400 sticky top-0 bg-[#0a0a0f] py-1 z-10">
              Current Members ({clubMembers.length})
            </h4>
            
            {loadingMembers ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : clubMembers.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">No members yet.</div>
            ) : (
              <div className="space-y-2">
                {clubMembers.map((m: any) => (
                  <div key={m.userId} className="flex items-center justify-between bg-[#111118]/40 p-3 rounded-lg border border-[#1e1e2e]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs uppercase overflow-hidden">
                        {m.user.avatarUrl ? <img src={m.user.avatarUrl} alt="" className="w-full h-full object-cover" /> : m.user.displayName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-200">{m.user.displayName}</p>
                        <p className="text-xs text-gray-500">@{m.user.username}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <select 
                        value={m.role}
                        onChange={(e) => updateMemberRoleMutation.mutate({ userId: m.userId, role: e.target.value })}
                        className="bg-[#0a0a0f] border border-[#1e1e2e] text-xs text-gray-300 rounded px-2 py-1 focus:border-[#6366f1]/50 outline-none"
                      >
                        <option value="admin">Admin</option>
                        <option value="photographer">Photographer</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button 
                        onClick={() => removeMemberMutation.mutate(m.userId)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Remove member"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
        </div>
      </Modal>

    </div>
  );
}

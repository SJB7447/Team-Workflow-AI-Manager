
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  Plus, Calendar, AlertCircle, CheckCircle2, 
  Clock, Trash2, Users, BarChart3, AlertTriangle,
  Download, FileText, ExternalLink, Settings, 
  Lock, Sparkles, X, Pencil, Calculator, Smartphone, Share, Paperclip,
  Image as ImageIcon, RefreshCw, Database, UserPlus, ShieldCheck, Wifi, WifiOff, FileSpreadsheet, FileUp, ShieldAlert, UserCheck,
  Moon, Sun, ChevronDown, Mail, Phone, ArrowRight, Timer
} from 'lucide-react';

import { Task, Requirement, MeetingLog, TeamMember, TaskStatus } from './types';
import * as geminiService from './services/geminiService';

// --- Supabase Initialization ---
const SUPABASE_URL = 'https://nedtvbnodkdmofhvhpbm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_H3BVdjIEBss5tSAu-oD0Pg_CixIDHV-';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function App() {
  const [currentTab, setCurrentTab] = useState<'workflow' | 'schedule' | 'requirements' | 'meetings'>('workflow');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Data State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [meetings, setMeetings] = useState<MeetingLog[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Modals & Form States
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isReqFormOpen, setIsReqFormOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [isMeetingFormOpen, setIsMeetingFormOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<MeetingLog | null>(null);
  const [adminModeOpen, setAdminModeOpen] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string, type: 'task' | 'req' | 'meeting' | 'member', title: string } | null>(null);
  
  const [newMember, setNewMember] = useState({ name: '', role: '', email: '', phone: '' });

  const [aiSummaryModal, setAiSummaryModal] = useState({ isOpen: false, loading: false, content: '' });
  const [aiProgressModal, setAiProgressModal] = useState<{
    isOpen: boolean; taskId: string | null; taskTitle: string; deadline: string; description: string; result: { percentage: number; reasoning: string } | null; loading: boolean;
  }>({ isOpen: false, taskId: null, taskTitle: '', deadline: '', description: '', result: null, loading: false });

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // --- Theme Controller ---
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (isDarkMode) {
      root.classList.add('dark');
      body.classList.add('dark', 'bg-slate-950');
      body.classList.remove('bg-slate-50');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark', 'bg-slate-950');
      body.classList.add('bg-slate-50');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // --- Field Mappers ---
  const mapTaskFromDB = (t: any): Task => ({
    id: t.id, 
    title: t.title, 
    assignee: t.assignee || '', 
    role: t.role || '',
    description: t.description || '', 
    status: (t.status as TaskStatus) || 'todo', 
    priority: (t.priority as any) || 'medium',
    deadline: t.deadline || '', 
    progress: t.progress || 0, 
    issue: t.issue || '',
    createdAt: Number(t.created_at)
  });

  const mapReqFromDB = (r: any): Requirement => ({
    id: r.id, title: r.title, category: (r.category as any) || 'requirement', content: r.content || '', link: r.link || '',
    attachmentName: r.attachment_name, attachmentType: r.attachment_type,
    attachmentData: r.attachment_data, createdAt: Number(r.created_at)
  });

  const mapMeetingFromDB = (m: any): MeetingLog => ({
    id: m.id, title: m.title, date: m.date || '', attendees: m.attendees || '', content: m.content || '',
    attachmentName: m.attachment_name, attachmentType: m.attachment_type,
    attachmentData: m.attachment_data, createdAt: Number(m.created_at)
  });

  // --- Data Fetching ---
  const fetchData = useCallback(async () => {
    try {
      const [tRes, rRes, mRes, tmRes] = await Promise.all([
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('requirements').select('*').order('created_at', { ascending: false }),
        supabase.from('meetings').select('*').order('created_at', { ascending: false }),
        supabase.from('team_members').select('*').order('name', { ascending: true })
      ]);

      if (tRes.data) setTasks(tRes.data.map(mapTaskFromDB));
      if (rRes.data) setRequirements(rRes.data.map(mapReqFromDB));
      if (mRes.data) setMeetings(mRes.data.map(mapMeetingFromDB));
      if (tmRes.data) setTeamMembers(tmRes.data);
    } catch (err) {
      console.error("동기화 실패:", err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    };
    init();

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [fetchData]);

  // --- Save Logic ---
  const handleAutoSave = async (op: () => Promise<any>, successCallback?: () => void) => {
    setSaveStatus('saving');
    try {
      const { error } = await op();
      if (error) throw error;
      setSaveStatus('saved');
      if (successCallback) successCallback();
      await fetchData();
    } catch (err: any) {
      console.error("저장 오류:", err);
      setSaveStatus('error');
      alert(`저장 실패: ${err.message || "서버 통신 오류"}`);
    }
  };

  // --- Team Member Management ---
  const handleAddTeamMember = async () => {
    if (!newMember.name.trim() || !newMember.role.trim()) {
      alert("이름과 직함은 필수입니다.");
      return;
    }
    const nm = { 
      id: crypto.randomUUID(), 
      name: newMember.name.trim(), 
      role: newMember.role.trim(),
      email: newMember.email.trim() || null,
      phone: newMember.phone.trim() || null
    };
    await handleAutoSave(
      () => supabase.from('team_members').insert([nm]),
      () => {
        setNewMember({ name: '', role: '', email: '', phone: '' });
      }
    );
  };

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice: any) => {
        if (choice.outcome === 'accepted') setDeferredPrompt(null);
      });
    } else {
      alert("이미 설치되어 있거나, 현재 브라우저에서 설치 기능을 지원하지 않습니다.\n브라우저 설정 메뉴의 '앱 설치' 또는 '홈 화면에 추가'를 확인해 주세요.");
    }
  };

  const stats = useMemo(() => ({
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'done').length,
    issues: tasks.filter(t => t.issue).length,
    avg: tasks.length ? Math.round(tasks.reduce((a,t) => a + t.progress, 0) / tasks.length) : 0
  }), [tasks]);

  // Helper for D-Day calculation
  const getDDay = (deadline: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(deadline);
    target.setHours(0, 0, 0, 0);
    const diff = target.getTime() - today.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return { text: 'Today', color: 'bg-red-500 text-white' };
    if (days < 0) return { text: `Expired (${Math.abs(days)})`, color: 'bg-slate-400 text-white' };
    if (days <= 3) return { text: `D-${days}`, color: 'bg-orange-500 text-white animate-pulse' };
    return { text: `D-${days}`, color: 'bg-indigo-500 text-white' };
  };

  const formatDate = (dateValue: string | number) => {
    return new Date(dateValue).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  return (
    <div className="min-h-screen transition-colors duration-300">
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b dark:border-slate-800 sticky top-0 z-40 px-4 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg relative">
            <ShieldCheck className="w-5 h-5 text-white"/>
            <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 bg-green-500 animate-pulse`} />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base leading-none">Secure Workflow</h1>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">DB: SUPABASE CLOUD</p>
          </div>
        </div>

        <nav className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {(['workflow','schedule','requirements','meetings'] as const).map(tab => (
            <button key={tab} onClick={() => setCurrentTab(tab)} className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${currentTab === tab ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              {tab === 'workflow' ? '작업' : tab === 'schedule' ? '일정' : tab === 'requirements' ? '자료' : '회의'}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all active:scale-90" title="테마 전환">
            {isDarkMode ? <Sun className="w-5 h-5 text-yellow-500"/> : <Moon className="w-5 h-5"/>}
          </button>
          <button onClick={handleInstallClick} className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all active:scale-90" title="앱 설치">
            <Smartphone className="w-5 h-5"/>
          </button>
          <button onClick={() => setAiSummaryModal({isOpen:true, loading:false, content: ''})} className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-lg transition-all" title="AI 보고서">
            <Sparkles className="w-5 h-5"/>
          </button>
          <button onClick={() => setAdminModeOpen(true)} className="p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all" title="관리자 설정">
            <Settings className="w-5 h-5"/>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-8">
        {currentTab === 'workflow' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="평균 진행률" value={`${stats.avg}%`} icon={<BarChart3 className="w-4 h-4 text-indigo-500"/>} progress={stats.avg} />
              <StatCard label="완료 작업" value={`${stats.completed}/${stats.total}`} icon={<CheckCircle2 className="w-4 h-4 text-green-500"/>} />
              <StatCard label="이슈 발생" value={`${stats.issues}건`} icon={<AlertTriangle className={`w-4 h-4 ${stats.issues ? 'text-red-500' : 'text-slate-200 dark:text-slate-700'}`}/>} />
              <button onClick={() => { setEditingTask(null); setIsTaskFormOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl flex flex-col items-center justify-center p-4 shadow-lg active:scale-95 transition-all group">
                <Plus className="w-6 h-6 mb-1 group-hover:rotate-90 transition-transform"/>
                <span className="text-xs font-bold">새 작업 추가</span>
              </button>
            </div>
            <div className="grid gap-4">
              {tasks.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-slate-900 border-2 border-dashed dark:border-slate-800 rounded-3xl text-slate-400 dark:text-slate-600 font-bold transition-colors">등록된 작업이 없습니다.</div>
              ) : (
                tasks.map(t => (
                  <TaskItem 
                    key={t.id} task={t} 
                    onEdit={() => { setEditingTask(t); setIsTaskFormOpen(true); }}
                    onDelete={() => setDeleteTarget({id:t.id, type:'task', title:t.title})}
                    onAIAnalyze={() => setAiProgressModal({isOpen:true, taskId:t.id, taskTitle:t.title, deadline:t.deadline, description:t.description, result:null, loading:false})}
                    onUpdateField={async (f,v) => {
                      const updatedValue = { [f]: v };
                      await handleAutoSave(
                        () => supabase.from('tasks').update(updatedValue).eq('id', t.id),
                        () => setTasks(prev => prev.map(task => task.id === t.id ? { ...task, ...updatedValue } : task))
                      );
                    }}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {currentTab === 'schedule' && (
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border dark:border-slate-800 shadow-sm animate-in zoom-in transition-all">
            <h2 className="text-xl font-black mb-8 flex items-center gap-3 text-slate-800 dark:text-slate-100">
              <Calendar className="w-6 h-6 text-indigo-500"/> 프로젝트 타임라인
            </h2>
            <div className="relative border-l-4 border-slate-100 dark:border-slate-800 pl-10 space-y-10">
              {tasks.filter(t => t.deadline).length === 0 ? (
                <div className="text-slate-400 dark:text-slate-600 font-bold italic py-10">마감 기한이 설정된 작업이 없습니다.</div>
              ) : (
                [...tasks]
                  .filter(t => t.deadline)
                  .sort((a,b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                  .map(t => {
                    const dday = getDDay(t.deadline);
                    return (
                      <div key={t.id} className="relative group">
                        <div className="absolute -left-[54px] top-1 w-6 h-6 rounded-full border-4 border-white dark:border-slate-900 shadow bg-indigo-500 group-hover:scale-125 transition-all" />
                        
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <span className={`px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${dday.color}`}>
                            {dday.text}
                          </span>
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatDate(t.createdAt)}</span>
                            <ArrowRight className="w-3.5 h-3.5 mx-1" />
                            <span className="text-indigo-600 dark:text-indigo-400">{formatDate(t.deadline)}</span>
                          </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-2xl border border-transparent group-hover:bg-white dark:group-hover:bg-slate-800 group-hover:border-indigo-100 dark:group-hover:border-indigo-900/50 group-hover:shadow-xl transition-all">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg mb-1">{t.title}</h4>
                              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="font-bold">{t.assignee}</span>
                                <span className="text-slate-200 dark:text-slate-700">|</span>
                                <span className="uppercase font-black text-[10px] tracking-widest">{t.status}</span>
                                <span className="text-slate-200 dark:text-slate-700">|</span>
                                <span className={`uppercase font-black text-[10px] tracking-widest ${t.priority === 'high' ? 'text-red-500' : 'text-slate-400'}`}>
                                  {t.priority}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{t.progress}%</div>
                              <div className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">Progress</div>
                            </div>
                          </div>
                          <div className="mt-4 w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full transition-all duration-1000 ease-out" style={{ width: `${t.progress}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}

        {currentTab === 'requirements' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 transition-colors">프로젝트 자료실</h2>
              <button onClick={() => { setEditingReq(null); setIsReqFormOpen(true); }} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md">
                <Plus className="w-4 h-4"/> 자료 등록
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {requirements.length === 0 ? (
                <div className="col-span-full text-center py-24 bg-white dark:bg-slate-900 border-2 border-dashed dark:border-slate-800 rounded-3xl text-slate-400 dark:text-slate-600 font-bold transition-colors">자료가 없습니다.</div>
              ) : (
                requirements.map(r => (
                  <RequirementCard key={r.id} req={r} onEdit={() => {setEditingReq(r); setIsReqFormOpen(true);}} onDelete={() => setDeleteTarget({id:r.id, type:'req', title:r.title})} />
                ))
              )}
            </div>
          </div>
        )}

        {currentTab === 'meetings' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 transition-colors">회의록 보관소</h2>
              <button onClick={() => { setEditingMeeting(null); setIsMeetingFormOpen(true); }} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md">
                <Plus className="w-4 h-4"/> 회의록 작성
              </button>
            </div>
            <div className="space-y-4">
              {meetings.length === 0 ? (
                <div className="text-center py-24 bg-white dark:bg-slate-900 border-2 border-dashed dark:border-slate-800 rounded-3xl text-slate-400 dark:text-slate-600 font-bold transition-colors">기록된 회의가 없습니다.</div>
              ) : (
                meetings.map(m => (
                  <MeetingCard key={m.id} meeting={m} onEdit={() => {setEditingMeeting(m); setIsMeetingFormOpen(true);}} onDelete={() => setDeleteTarget({id:m.id, type:'meeting', title:m.title})} />
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* --- Task Form --- */}
      {isTaskFormOpen && (
        <TaskForm 
          task={editingTask} members={teamMembers} onClose={() => setIsTaskFormOpen(false)} 
          onSave={async (data: any) => {
            const id = editingTask?.id || crypto.randomUUID();
            const payload = { 
              id, 
              title: data.title, 
              assignee: data.assignee || null, 
              role: data.role || null, 
              description: data.description || null, 
              deadline: data.deadline || null,
              status: editingTask?.status || 'todo', 
              priority: data.priority || 'medium',
              progress: editingTask?.progress || 0, 
              issue: data.issue || editingTask?.issue || '', 
              created_at: editingTask?.createdAt || Date.now() 
            };
            await handleAutoSave(
              () => supabase.from('tasks').upsert([payload]), 
              () => setIsTaskFormOpen(false)
            );
          }} 
        />
      )}

      {/* --- Requirement Form --- */}
      {isReqFormOpen && (
        <GenericForm 
          title={editingReq ? "자료 수정" : "보안 자료 등록"} 
          onClose={() => setIsReqFormOpen(false)}
          onSave={async (data: any) => {
            const id = editingReq?.id || crypto.randomUUID();
            const payload = { 
              id, title: data.title, category: data.category, content: data.content, link: data.link,
              attachment_name: data.attachmentName, attachment_type: data.attachmentType, attachment_data: data.attachmentData,
              created_at: editingReq?.createdAt || Date.now() 
            };
            await handleAutoSave(() => supabase.from('requirements').upsert([payload]), () => setIsReqFormOpen(false));
          }}
          initialData={editingReq}
          fields={[
            {name: 'title', label: '자료 제목', type: 'text', required: true},
            {name: 'category', label: '카테고리', type: 'select', options: ['requirement', 'guideline', 'reference']},
            {name: 'content', label: '요약 내용', type: 'textarea'},
            {name: 'link', label: '참조 링크', type: 'text'},
            {name: 'attachment', label: '이미지/문서 첨부', type: 'file'}
          ]}
        />
      )}

      {/* --- Meeting Form --- */}
      {isMeetingFormOpen && (
        <GenericForm 
          title={editingMeeting ? "회의록 수정" : "신규 회의록 작성"} 
          onClose={() => setIsMeetingFormOpen(false)}
          onSave={async (data: any) => {
            const id = editingMeeting?.id || crypto.randomUUID();
            const payload = { 
              id, title: data.title, date: data.date, attendees: data.attendees, content: data.content,
              attachment_name: data.attachmentName, attachment_type: data.attachmentType, attachment_data: data.attachmentData,
              created_at: editingMeeting?.createdAt || Date.now() 
            };
            await handleAutoSave(() => supabase.from('meetings').upsert([payload]), () => setIsMeetingFormOpen(false));
          }}
          initialData={editingMeeting}
          fields={[
            {name: 'title', label: '회의 주제', type: 'text', required: true},
            {name: 'date', label: '회의 일시', type: 'date', required: true},
            {name: 'attendees', label: '참석자 명단', type: 'text'},
            {name: 'content', label: '결정 사항', type: 'textarea'},
            {name: 'attachment', label: '첨부 자료', type: 'file'}
          ]}
        />
      )}

      {/* Admin Mode */}
      {adminModeOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border dark:border-slate-800 transition-all">
            <div className="p-6 bg-slate-800 dark:bg-slate-950 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2"><Settings className="w-5 h-5"/> 시스템 관리 도구</h3>
              <button onClick={() => {setAdminModeOpen(false); setIsAdminUnlocked(false)}}><X className="w-5 h-5"/></button>
            </div>
            <div className="p-8 text-center">
              {!isAdminUnlocked ? (
                <div className="animate-in zoom-in duration-300">
                  <Lock className="w-16 h-16 text-slate-200 dark:text-slate-700 mx-auto mb-6" />
                  <input type="password" placeholder="PASSWORD" className="w-full border-b-2 border-slate-100 dark:border-slate-800 bg-transparent outline-none p-4 text-center text-3xl mb-8 tracking-[0.5em] focus:border-indigo-500 dark:text-white" autoFocus onKeyDown={e => {if(e.key==='Enter' && (e.target as any).value==='1234') setIsAdminUnlocked(true)}} />
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Default: 1234</p>
                </div>
              ) : (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                  <button onClick={() => {
                        const backupData = { version: "2.4.0", timestamp: new Date().toISOString(), data: { tasks, requirements, meetings, teamMembers } };
                        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = `Full_Project_Backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
                      }} className="w-full flex items-center justify-center gap-3 p-5 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-700 shadow-xl transition-all active:scale-95">
                      <Database className="w-6 h-6"/> 시스템 전체 데이터 백업
                    </button>
                  
                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />
                  
                  <div className="space-y-4 text-left">
                    <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1"><UserPlus className="w-4 h-4"/> 구성원 신규 등록</h4>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <input className="bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white rounded-xl p-3 text-sm outline-none transition-all" placeholder="이름" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} />
                        <input className="bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white rounded-xl p-3 text-sm outline-none transition-all" placeholder="직함" value={newMember.role} onChange={e => setNewMember({...newMember, role: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input className="bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white rounded-xl p-3 text-xs outline-none transition-all" placeholder="이메일" value={newMember.email} onChange={e => setNewMember({...newMember, email: e.target.value})} />
                        <input className="bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white rounded-xl p-3 text-xs outline-none transition-all" placeholder="전화번호" value={newMember.phone} onChange={e => setNewMember({...newMember, phone: e.target.value})} />
                      </div>
                    </div>
                    <button onClick={handleAddTeamMember} className="w-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 py-4 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2">
                      <UserCheck className="w-4 h-4"/> 보안 명단 등록
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto custom-scrollbar border dark:border-slate-800 rounded-2xl p-2 space-y-2 bg-slate-50 dark:bg-slate-950">
                    {teamMembers.map(m => (
                      <div key={m.id} className="p-3 bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 flex justify-between items-center group">
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{m.name}</span>
                            <span className="text-[10px] text-slate-400">({m.role})</span>
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5">{m.email} / {m.phone}</div>
                        </div>
                        <button onClick={() => setDeleteTarget({id: m.id, type: 'member', title: m.name})} className="text-slate-200 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Status Bar */}
      <div className={`fixed bottom-6 left-6 right-6 sm:left-auto flex items-center gap-3 px-6 py-3.5 rounded-full shadow-2xl border transition-all duration-700 z-50 backdrop-blur-2xl ${saveStatus==='saved'?'bg-white/90 dark:bg-slate-900/90 border-green-100 dark:border-green-900/30 text-green-600 dark:text-green-400':'bg-indigo-50/90 dark:bg-indigo-900/40 border-indigo-100 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'}`}>
        {saveStatus==='saving' ? <RefreshCw className="w-4 h-4 animate-spin"/> : <ShieldCheck className="w-4 h-4"/>}
        <span className="text-[11px] font-black uppercase tracking-widest">{saveStatus==='saving'?'실시간 동기화 중...':'데이터 보안 보관됨'}</span>
      </div>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border dark:border-slate-800 transition-colors animate-in zoom-in duration-300">
            <div className="bg-red-50 dark:bg-red-900/20 text-red-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><Trash2 className="w-10 h-10"/></div>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">영구 삭제 확인</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 font-medium leading-relaxed">"{deleteTarget.title}" 데이터는 삭제 후 복구할 수 없습니다.</p>
            <div className="flex gap-4">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-bold transition-colors">취소</button>
              <button onClick={async () => {
                const table = deleteTarget.type === 'task' ? 'tasks' : deleteTarget.type === 'req' ? 'requirements' : deleteTarget.type === 'meeting' ? 'meetings' : 'team_members';
                await handleAutoSave(() => supabase.from(table).delete().eq('id', deleteTarget.id));
                setDeleteTarget(null);
              }} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg">삭제 확정</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Internal Helper Components ---

function StatCard({ label, value, icon, progress }: any) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border dark:border-slate-800 shadow-sm flex flex-col justify-between transition-all duration-300 group hover:shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase transition-colors">{label}</span>
        <div className="group-hover:scale-110 transition-transform">{icon}</div>
      </div>
      <div>
        <div className="text-3xl font-black text-slate-800 dark:text-slate-100 transition-colors tracking-tight">{value}</div>
        {progress !== undefined && (
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden transition-colors">
            <div className="bg-indigo-500 h-full transition-all duration-1000 ease-out" style={{width: `${progress}%`}} />
          </div>
        )}
      </div>
    </div>
  );
}

function TaskItem({ task, onEdit, onDelete, onAIAnalyze, onUpdateField }: any) {
  const statusColors: any = { 
    todo: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700', 
    'in-progress': 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/50', 
    review: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-900/50', 
    done: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/50' 
  };
  
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 p-7 flex flex-col lg:flex-row gap-8 shadow-sm transition-all duration-300 hover:shadow-2xl hover:border-indigo-100 dark:hover:border-indigo-900/40">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-4">
          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border tracking-widest ${statusColors[task.status]}`}>{task.status}</span>
          <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 flex items-center ml-auto transition-colors"><Calendar className="w-3.5 h-3.5 mr-1.5"/> {task.deadline}</span>
        </div>
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xl mb-1.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{task.title}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-bold transition-colors">{task.assignee} <span className="text-slate-200 dark:text-slate-800 mx-1.5">|</span> {task.role}</p>
        <div className="mt-5 space-y-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-h-48 overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-950/50 p-5 rounded-2xl border dark:border-slate-800 whitespace-pre-wrap transition-colors">
            {task.description || '상세 업무 설명이 없습니다.'}
          </div>
        </div>
      </div>

      <div className="lg:w-56 space-y-5 pt-5 lg:pt-0 border-t lg:border-t-0 lg:border-l lg:pl-8 border-slate-100 dark:border-slate-800 transition-colors">
        <div className="flex justify-between items-center text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase transition-colors">
          <span>진척도 관리</span>
          <button onClick={onAIAnalyze} className="text-indigo-500 dark:text-indigo-400 hover:scale-110 transition-all flex items-center gap-1.5 group font-black"><Calculator className="w-3.5 h-3.5 group-hover:rotate-12"/> AI 진단</button>
        </div>
        <div className="space-y-3">
          <input type="range" className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full accent-indigo-500 cursor-pointer transition-colors" value={task.progress} onChange={e => onUpdateField('progress', parseInt(e.target.value))} />
          <div className="flex justify-between items-center">
            <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 transition-colors">{task.progress}%</span>
            <select className="bg-slate-50 dark:bg-slate-800 text-[9px] font-black rounded-lg p-2 dark:text-slate-200 outline-none transition-all hover:ring-2 hover:ring-indigo-100 dark:hover:ring-indigo-900/30" value={task.status} onChange={e => onUpdateField('status', e.target.value)}>
              <option value="todo">TODO</option><option value="in-progress">DOING</option><option value="review">REVIEW</option><option value="done">DONE</option>
            </select>
          </div>
        </div>
      </div>

      <div className="lg:w-72 flex flex-col gap-3">
        <div className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-1 px-1 flex justify-between items-center transition-colors">
          <span>실시간 장애 리포트</span>
          {task.issue && <AlertTriangle className="w-3 h-3 text-red-400" />}
        </div>
        <textarea className="flex-1 bg-slate-50 dark:bg-slate-950/50 dark:text-slate-300 border dark:border-slate-800/50 rounded-2xl p-5 text-xs leading-relaxed resize-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 outline-none transition-all" placeholder="발견된 장애나 리스크를 기록하세요..." value={task.issue} onChange={e => onUpdateField('issue', e.target.value)} />
        <div className="flex justify-end gap-2 transition-colors">
          <button onClick={onEdit} className="p-3 text-slate-300 dark:text-slate-700 hover:text-indigo-500 transition-all active:scale-90" title="수정"><Pencil className="w-5 h-5"/></button>
          <button onClick={onDelete} className="p-3 text-slate-300 dark:text-slate-700 hover:text-red-500 transition-all active:scale-90" title="삭제"><Trash2 className="w-5 h-5"/></button>
        </div>
      </div>
    </div>
  );
}

function RequirementCard({ req, onEdit, onDelete }: any) {
  const handleDownload = () => {
    if (!req.attachmentData) return;
    const link = document.createElement("a");
    link.href = req.attachmentData;
    link.download = req.attachmentName || "download";
    link.click();
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 shadow-sm h-[360px] flex flex-col overflow-hidden transition-all duration-300 group hover:shadow-2xl hover:border-indigo-100 dark:hover:border-indigo-900/40">
      <div className="h-36 bg-slate-100 dark:bg-slate-800 relative flex items-center justify-center border-b dark:border-slate-800 transition-colors">
        {req.attachmentType === 'image' && req.attachmentData ? (
          <img src={req.attachmentData} alt={req.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
        ) : (
          <Paperclip className="w-12 h-12 opacity-10 dark:opacity-5 transition-transform group-hover:scale-125" />
        )}
        <div className="absolute top-4 left-4"><span className="bg-white/95 dark:bg-slate-900/95 px-3 py-1 rounded-full text-[9px] font-black text-indigo-700 dark:text-indigo-400 shadow-sm uppercase transition-colors tracking-widest">{req.category}</span></div>
      </div>
      <div className="p-7 flex-1 flex flex-col min-h-0 transition-colors">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 line-clamp-1 mb-2.5 text-base transition-colors">{req.title}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2 flex-1 overflow-y-auto custom-scrollbar mb-3 leading-relaxed transition-colors">{req.content}</p>
        {req.attachmentName && (
          <div className="mb-4 p-2.5 bg-slate-50 dark:bg-slate-950/50 rounded-xl flex items-center gap-3 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 border dark:border-slate-800 shadow-sm transition-colors">
            <FileText className="w-4 h-4" />
            <span className="truncate flex-1">{req.attachmentName}</span>
            <button onClick={handleDownload} className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded transition-colors"><Download className="w-4 h-4" /></button>
          </div>
        )}
        <div className="mt-auto pt-5 border-t dark:border-slate-800 flex justify-between items-center transition-colors">
           {req.link ? (
             <a href={req.link} target="_blank" rel="noopener noreferrer" className="text-indigo-500 dark:text-indigo-400 hover:scale-125 transition-transform transition-colors"><ExternalLink className="w-5 h-5"/></a>
           ) : <div className="w-5 h-5 opacity-0"/>}
           <div className="flex gap-2 ml-auto transition-colors">
             <button onClick={onEdit} className="p-2 text-slate-200 dark:text-slate-800 hover:text-indigo-500 transition-all active:scale-90"><Pencil className="w-5 h-5"/></button>
             <button onClick={onDelete} className="p-2 text-slate-200 dark:text-slate-800 hover:text-red-500 transition-all active:scale-90"><Trash2 className="w-5 h-5"/></button>
           </div>
        </div>
      </div>
    </div>
  );
}

function MeetingCard({ meeting, onEdit, onDelete }: any) {
  const handleDownload = () => {
    if (!meeting.attachmentData) return;
    const link = document.createElement("a");
    link.href = meeting.attachmentData;
    link.download = meeting.attachmentName || "download";
    link.click();
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-7 rounded-3xl border dark:border-slate-800 shadow-sm flex gap-8 transition-all duration-300 group hover:shadow-2xl hover:border-indigo-100 dark:hover:border-indigo-900/40">
      <div className="w-24 h-24 shrink-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex flex-col items-center justify-center border border-indigo-100 dark:border-indigo-900/50 group-hover:bg-indigo-600 dark:group-hover:bg-indigo-500 transition-all duration-500 shadow-inner">
        <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 group-hover:text-white transition-colors">{new Date(meeting.date).getDate() || '??'}</div>
        <div className="text-[10px] font-black text-indigo-400 dark:text-indigo-200 uppercase tracking-widest group-hover:text-indigo-100 transition-colors">{new Date(meeting.date).toLocaleString('ko-KR', { month: 'short' })}</div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col transition-colors">
        <div className="flex justify-between items-start mb-1 transition-colors">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">{meeting.title}</h3>
          <div className="flex gap-1 transition-colors">
            <button onClick={onEdit} className="p-2 text-slate-200 dark:text-slate-800 hover:text-indigo-500 transition-all active:scale-90"><Pencil className="w-5 h-5"/></button>
            <button onClick={onDelete} className="p-2 text-slate-200 dark:text-slate-800 hover:text-red-500 transition-all active:scale-90"><Trash2 className="w-5 h-5"/></button>
          </div>
        </div>
        <p className="text-[11px] text-indigo-500 dark:text-indigo-400 font-bold mb-4 tracking-tight transition-colors">참여 명단: {meeting.attendees}</p>
        <div className="text-xs text-slate-400 dark:text-slate-500 line-clamp-3 bg-slate-50/50 dark:bg-slate-950/50 p-4 rounded-2xl border dark:border-slate-800 transition-colors leading-relaxed flex-1">{meeting.content}</div>
        {meeting.attachmentName && (
          <div className="mt-4 p-2.5 bg-slate-50 dark:bg-slate-950/50 rounded-xl flex items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 border dark:border-slate-800 w-fit shadow-sm transition-colors">
            {meeting.attachmentType === 'image' ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            <span className="truncate max-w-[200px]">{meeting.attachmentName}</span>
            <button onClick={handleDownload} className="ml-1 p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-all active:scale-90"><Download className="w-4 h-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function GenericForm({ title, onClose, onSave, fields, initialData }: any) {
  const [formData, setFormData] = useState<any>(initialData || {});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { alert("최대 5MB 파일만 가능합니다."); return; }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, attachmentName: file.name, attachmentType: file.type.startsWith('image/') ? 'image' : 'file', attachmentData: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-md z-[100] flex items-center justify-center p-4 transition-colors">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border dark:border-slate-800 animate-in zoom-in duration-300 transition-colors">
        <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 transition-colors">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="hover:rotate-90 transition-transform"><X className="w-6 h-6 text-slate-400"/></button>
        </div>
        <form onSubmit={e=>{e.preventDefault(); onSave(formData)}} className="p-8 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar transition-colors">
          {fields.map((f:any) => (
            <div key={f.name}>
              <label className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-1.5 block transition-colors">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea className="w-full bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white rounded-xl p-4 text-sm h-36 outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/20 transition-all transition-colors" value={formData[f.name] || ''} onChange={e=>setFormData({...formData, [f.name]:e.target.value})} required={f.required} />
              ) : f.type === 'select' ? (
                <select className="w-full bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/20 transition-all font-bold transition-colors" value={formData[f.name] || f.options[0]} onChange={e=>setFormData({...formData, [f.name]:e.target.value})}>
                  {f.options.map((o:string)=> <option key={o} value={o}>{o.toUpperCase()}</option>)}
                </select>
              ) : f.type === 'file' ? (
                <div className="space-y-3 transition-colors">
                   <div onClick={() => fileInputRef.current?.click()} className="w-full h-28 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors group">
                    <FileUp className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2 group-hover:scale-110 transition-transform transition-colors" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest transition-colors">파일 선택</span>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
                  </div>
                  {formData.attachmentName && (
                    <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border dark:border-indigo-900/50 transition-all shadow-sm transition-colors">
                      <div className="flex items-center gap-3 transition-colors">
                        {formData.attachmentType === 'image' ? <ImageIcon className="w-5 h-5 text-indigo-500" /> : <FileText className="w-5 h-5 text-indigo-500" />}
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 truncate max-w-[250px] transition-colors">{formData.attachmentName}</span>
                      </div>
                      <button type="button" onClick={() => setFormData({...formData, attachmentName: null, attachmentData: null, attachmentType: null})} className="text-red-400 hover:scale-110 transition-transform transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                  )}
                </div>
              ) : (
                <input type={f.type} className="w-full bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/20 transition-all transition-colors" value={formData[f.name] || ''} onChange={e=>setFormData({...formData, [f.name]:e.target.value})} required={f.required} />
              )}
            </div>
          ))}
          <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all active:scale-[0.98] mt-4 transition-colors">데이터 저장</button>
        </form>
      </div>
    </div>
  );
}

function TaskForm({ task, members, onClose, onSave }: any) {
  const [formData, setFormData] = useState<any>(task || { title: '', assignee: '', role: '', description: '', deadline: '', priority: 'medium' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-md z-[100] flex items-center justify-center p-4 transition-colors">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border dark:border-slate-800 animate-in zoom-in duration-300 transition-colors">
        <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 transition-colors">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 transition-colors">{task ? '워크플로우 수정' : '신규 작업 명세 등록'}</h3>
          <button onClick={onClose} className="hover:rotate-90 transition-transform transition-colors"><X className="w-6 h-6 text-slate-400"/></button>
        </div>
        <form onSubmit={e=>{e.preventDefault(); onSave(formData)}} className="p-8 space-y-5 max-h-[85vh] overflow-y-auto custom-scrollbar transition-colors">
          <div>
            <label className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-1.5 block transition-colors">작업 명칭</label>
            <input className="w-full bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white rounded-xl p-4 text-lg font-black outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/20 transition-all transition-colors" placeholder="제목" value={formData.title} onChange={e=>setFormData({...formData, title:e.target.value})} required />
          </div>
          
          <div className="grid grid-cols-2 gap-4 transition-colors">
            <div>
              <label className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-1.5 block transition-colors">담당자 배정</label>
              <select className="w-full bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white p-4 rounded-xl text-sm font-bold outline-none transition-all transition-colors" value={formData.assignee} onChange={e=>{
                const m = members.find((x:any)=>x.name===e.target.value);
                setFormData({...formData, assignee:e.target.value, role: m?.role || ''});
              }} required>
                <option value="">선택</option>
                {members.map((m:any)=><option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-1.5 block transition-colors">역할 (자동)</label>
              <input className="w-full bg-slate-100 dark:bg-slate-950 border dark:border-slate-800 p-4 rounded-xl text-sm text-slate-400 dark:text-slate-600 outline-none font-bold transition-colors" value={formData.role} readOnly />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 transition-colors">
            <div>
              <label className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-1.5 block transition-colors">마감 기한</label>
              <input type="date" className="w-full bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white p-4 rounded-xl text-sm outline-none transition-all font-bold transition-colors" value={formData.deadline} onChange={e=>setFormData({...formData, deadline:e.target.value})} required />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-1.5 block transition-colors">우선순위</label>
              <select className="w-full bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white p-4 rounded-xl text-sm font-black outline-none transition-all transition-colors" value={formData.priority} onChange={e=>setFormData({...formData, priority:e.target.value})}>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mb-1.5 block transition-colors">상세 지침</label>
            <textarea className="w-full bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 dark:text-white rounded-xl p-4 text-sm h-36 outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/20 transition-all leading-relaxed transition-colors" placeholder="상세 내용 작성" value={formData.description} onChange={e=>setFormData({...formData, description:e.target.value})} />
          </div>

          <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all active:scale-[0.98] mt-4 transition-colors">워크플로우 저장</button>
        </form>
      </div>
    </div>
  );
}


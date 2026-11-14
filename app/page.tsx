"use client";

import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import ReactMarkdown from 'react-markdown';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("websites");
  const [sites, setSites] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- WEBSITES STATE ---
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileStats, setFileStats] = useState<{ name: string, size: string, count: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualDomain, setManualDomain] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // --- EMAILS STATE ---
  const [drafts, setDrafts] = useState<any[]>([]);
  const [isSendingNew, setIsSendingNew] = useState(false);
  const [showSendToNewModal, setShowSendToNewModal] = useState(false);
  const [isSendingFollowUps, setIsSendingFollowUps] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState({ name: "", subject: "", body: "" });
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [viewingEmail, setViewingEmail] = useState<any | null>(null);

  // --- AI CHAT STATE ---
  const [aiChats, setAiChats] = useState<{ id: string, title: string, messages: { role: 'user' | 'assistant', content: string }[] }[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, chatId: string } | null>(null);
  const [aiInput, setAiInput] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const aiChatEndRef = useRef<HTMLDivElement>(null);

  // --- INBOX STATE ---
  const [inbox, setInbox] = useState<any[]>([]);
  const [activeThread, setActiveThread] = useState<any>(null); 
  const activeThreadRef = useRef<any>(null);
  const activeTabRef = useRef<string>("websites");
  const inboxRef = useRef<any[]>([]);
  const isSyncingRef = useRef(false); 
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [replyText, setReplyText] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [isReplying, setIsReplying] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // --- NOTIFICATION PANEL STATE ---
  const [showNotifications, setShowNotifications] = useState(false);
  
  // --- BOTTOM RIGHT TOAST STATE ---
  const [messageToast, setMessageToast] = useState<{ domain: string, body: string, threadId: string } | null>(null);
  
  // --- SYSTEM NOTIFICATIONS STATE ---
  const [systemNotifications, setSystemNotifications] = useState<any[]>([]);
  const seenNotifIdsRef = useRef<string[]>([]);

  // --- SETTINGS STATE ---
  const [settings, setSettings] = useState({
    anthropicApiKey: "", msClientId: "", msClientSecret: "", msTenantId: "", msSenderEmail: "", defaultTemplateId: "",
    followUpLimit: "1", 
    followUpDelayValue: "3", 
    followUpDelayUnit: "days",
    followUpPrompt: "Write a short, polite 2-sentence follow-up to a cold email sent a few days ago about a guest post. Do not sound desperate. Keep it under 30 words.",
    autoFollowUpEnabled: "false"
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // --- MODAL STATES ---
  const [editingSite, setEditingSite] = useState<any | null>(null);
  const [deletingSite, setDeletingSite] = useState<any | null>(null);
  const [bulkDeletePrompt, setBulkDeletePrompt] = useState<string[] | null>(null);
  const [scrapePrompt, setScrapePrompt] = useState<{ ids: string[], hasExistingEmail: boolean } | null>(null);
  const [showMakeEligibleModal, setShowMakeEligibleModal] = useState(false);

  // --- PROGRESS STATE ---
  const [showProgress, setShowProgress] = useState(false);
  const [progressStats, setProgressStats] = useState({ total: 0, done: 0, found: 0 });
  const [currentAction, setCurrentAction] = useState("");
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [isStopped, setIsStopped] = useState(false);

  // --- TOAST STATE ---
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- TAB MEMORY ---
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const savedTab = localStorage.getItem("cadence_activeTab");
    if (savedTab) setActiveTab(savedTab);
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (hasLoaded) localStorage.setItem("cadence_activeTab", activeTab);
  }, [activeTab, hasLoaded]);

  // --- AI CHAT MEMORY ---
  useEffect(() => {
    const savedChats = localStorage.getItem("cadence_ai_chats");
    if (savedChats) {
      const parsed = JSON.parse(savedChats);
      setAiChats(parsed);
      if (parsed.length > 0) setActiveChatId(parsed[0].id);
    } else {
      const initial = [{ id: Date.now().toString(), title: "New Chat", messages: [] }];
      setAiChats(initial);
      setActiveChatId(initial[0].id);
    }
  }, []);

  useEffect(() => {
    if (aiChats.length > 0) localStorage.setItem("cadence_ai_chats", JSON.stringify(aiChats));
  }, [aiChats]);

  const displaySites = sites.filter(s => s.status !== 'PROCESSING');
  const isAllSelected = displaySites.length > 0 && displaySites.every(s => selectedSites.includes(s.id));

  const unreadSystemCount = systemNotifications.filter(n => !n.isRead).length;
  const unreadThreads = inbox.filter(thread => 
    thread.replies.some((r: any) => !r.isFromUs && !r.isRead)
  );

  // Keep refs updated
  useEffect(() => { activeThreadRef.current = activeThread; }, [activeThread]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { inboxRef.current = inbox; }, [inbox]);

  // Auto scroll
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread, activeThread?.replies?.length]);

  useEffect(() => {
    if (aiChatEndRef.current) aiChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [aiChats, activeChatId]);

  // --- GLOBAL REAL-TIME NOTIFICATIONS POLLING ---
  useEffect(() => {
    const notifInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setSystemNotifications(data);
          
          // Trigger toasts ONLY for new notifications
          const unreadNotifs = data.filter((n: any) => !n.isRead);
          unreadNotifs.forEach((notif: any) => {
            if (!seenNotifIdsRef.current.includes(notif.id)) {
              showToast(notif.message, notif.type === 'error' ? 'error' : 'success');
              seenNotifIdsRef.current.push(notif.id);
            }
          });
        }
      } catch (e) {}
    }, 5000);
    return () => clearInterval(notifInterval);
  }, []);

  // --- GLOBAL REAL-TIME INBOX POLLING ---
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      try { await fetch("/api/sync", { method: "POST" }); } catch (e) {}
      isSyncingRef.current = false;
    }, 10000);

    const uiInterval = setInterval(() => {
      fetchInbox();
    }, 5000);

    return () => {
      clearInterval(syncInterval);
      clearInterval(uiInterval);
    };
  }, []);

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/sites');
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSites(Array.isArray(data) ? data : []);
      if (batchIds.length === 0) {
        const processing = data.filter((s: any) => s.status === 'PROCESSING');
        if (processing.length > 0) setBatchIds(processing.map((s: any) => s.id));
      }
      return data;
    } catch (error) { setSites([]); return []; }
  };

  const fetchDrafts = async () => {
    try {
      const res = await fetch('/api/drafts');
      if (res.ok) setDrafts(await res.json());
    } catch (error) {}
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) setTemplates(await res.json());
    } catch (error) {}
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({
          ...prev,
          ...data,
          followUpDelayValue: data.followUpDelayValue || "3",
          followUpDelayUnit: data.followUpDelayUnit || "days",
        }));
      }
    } catch (error) {}
  };

  const fetchInbox = async () => {
    try {
      const res = await fetch('/api/inbox');
      if (res.ok) {
        const data = await res.json();
        const currentActive = activeThreadRef.current;
        const currentInbox = inboxRef.current;
        const isViewingInbox = activeTabRef.current === 'responded';

        if (currentInbox.length > 0) {
          for (const thread of data) {
            const oldThread = currentInbox.find(t => t.id === thread.id);
            const unreadReplies = thread.replies.filter((r: any) => !r.isFromUs && !r.isRead);
            if (unreadReplies.length > 0) {
              let hasNew = false;
              if (!oldThread) hasNew = true; 
              else {
                const oldReplyIds = oldThread.replies.map((r: any) => r.id);
                hasNew = unreadReplies.some((r: any) => !oldReplyIds.includes(r.id));
              }

              if (hasNew) {
                const latest = unreadReplies[unreadReplies.length - 1];
                const isCurrentlyViewingThread = isViewingInbox && currentActive && currentActive.id === thread.id;
                
                if (!isCurrentlyViewingThread) {
                   setMessageToast({ domain: thread.website.domain, body: latest.body, threadId: thread.id });
                } else {
                   fetch("/api/inbox/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emailId: thread.id }) }).catch(() => {});
                }
                break; 
              }
            }
          }
        }

        const mappedData = data.map((thread: any) => {
          if (isViewingInbox && currentActive && thread.id === currentActive.id) {
             return { ...thread, replies: thread.replies.map((r: any) => ({...r, isRead: true})) };
          }
          return thread;
        });

        setInbox(mappedData);
        let unread = 0;
        mappedData.forEach((thread: any) => thread.replies.forEach((r: any) => { if (!r.isFromUs && !r.isRead) unread++; }));
        setUnreadCount(unread);

        if (currentActive) {
          const updated = mappedData.find((t: any) => t.id === currentActive.id);
          if (updated) setActiveThread(updated);
        }
      }
    } catch (error) {}
  };

  useEffect(() => {
    fetchSites();
    fetchSettings();
    fetchInbox(); 
    fetchTemplates(); 
    if (activeTab === 'emails') fetchDrafts();
    
    const hasProcessing = sites.some(s => s.status === 'PROCESSING');
    let interval: NodeJS.Timeout;
    
    if (hasProcessing && !isStopped) {
      interval = setInterval(async () => {
        const updated = await fetchSites();
        if (batchIds.length > 0) {
          const trackingSites = updated.filter((s: any) => batchIds.includes(s.id));
          const processingSites = trackingSites.filter((s: any) => s.status === 'PROCESSING');
          const doneSites = trackingSites.filter((s: any) => s.status === 'EMAIL_FOUND' || s.status === 'NO_EMAIL');
          const foundSites = trackingSites.filter((s: any) => s.status === 'EMAIL_FOUND');

          const activeSite = processingSites.find((s: any) => s.progressMessage && s.progressMessage !== 'Queued...' && s.progressMessage !== 'Starting...' && s.progressMessage !== 'Queued for scraping...');
          if (activeSite) setCurrentAction("Scraping " + activeSite.domain + ": " + activeSite.progressMessage);
          else if (processingSites.length > 0) setCurrentAction("Scraping " + processingSites[0].domain + ": " + processingSites[0].progressMessage);
          else if (doneSites.length > 0) setCurrentAction("Finalizing...");

          setProgressStats({ total: batchIds.length, done: doneSites.length, found: foundSites.length });
        }
        if (!updated.some((s: any) => s.status === 'PROCESSING')) clearInterval(interval);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [sites.length, sites.some(s => s.status === 'PROCESSING'), batchIds, isStopped, activeTab]);

  const toggleSite = (id: string) => setSelectedSites(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const toggleAllSites = () => isAllSelected ? setSelectedSites([]) : setSelectedSites(displaySites.map(s => s.id));

  const handleThreadClick = async (thread: any) => {
    try {
      await fetch("/api/inbox/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emailId: thread.id }) });
    } catch (e) {}

    setActiveThread(thread);
    setActiveTab('responded');
    setShowNotifications(false); 
    setMessageToast(null); 
    setInbox(prev => prev.map(t => t.id === thread.id ? { ...t, replies: t.replies.map((r: any) => ({...r, isRead: true})) } : t));
    
    const unreadInThread = thread.replies.filter((r: any) => !r.isFromUs && !r.isRead).length;
    setUnreadCount(prev => Math.max(0, prev - unreadInThread));
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications', { method: 'POST' });
    setSystemNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setInbox(prev => prev.map(t => ({ ...t, replies: t.replies.map((r: any) => ({ ...r, isRead: true })) })));
    setUnreadCount(0);
    setShowNotifications(false);
  };

  const handleClearAllNotifications = async () => {
    await fetch('/api/notifications', { method: 'DELETE' });
    setSystemNotifications([]);
    setUnreadCount(0); 
    setInbox(prev => prev.map(t => ({ ...t, replies: t.replies.map((r: any) => ({ ...r, isRead: true })) })));
  };

  const handleDeleteChat = (chatId: string) => {
    const remaining = aiChats.filter(c => c.id !== chatId);
    if (remaining.length === 0) {
      const newChat = { id: Date.now().toString(), title: "New Chat", messages: [] };
      setAiChats([newChat]);
      setActiveChatId(newChat.id);
    } else {
      setAiChats(remaining);
      if (activeChatId === chatId) setActiveChatId(remaining[0].id);
    }
    setContextMenu(null);
  };

  const handleDeleteAllChats = () => {
    const newChat = { id: Date.now().toString(), title: "New Chat", messages: [] };
    setAiChats([newChat]);
    setActiveChatId(newChat.id);
    setContextMenu(null);
  };

  const handleSendAiMessage = async () => {
    if (!aiInput.trim() || isAiTyping || !activeChatId) return;
    const userMsg = { role: 'user' as const, content: aiInput.trim() };
    
    const activeChat = aiChats.find(c => c.id === activeChatId);
    if (!activeChat) return;
    const updatedMessages = [...activeChat.messages, userMsg];

    setAiChats(prev => prev.map(chat => {
      if (chat.id === activeChatId) {
        const title = chat.messages.length === 0 ? aiInput.trim().substring(0, 30) + "..." : chat.title;
        return { ...chat, title, messages: updatedMessages };
      }
      return chat;
    }));
    
    setAiInput("");
    setIsAiTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages })
      });
      const data = await res.json();
      if (data.reply) {
        setAiChats(prev => prev.map(chat => {
          if (chat.id === activeChatId) return { ...chat, messages: [...chat.messages, { role: 'assistant', content: data.reply }] };
          return chat;
        }));
      } else {
        showToast(data.error || "AI failed to respond", "error");
      }
    } catch (e) {
      showToast("Error connecting to AI", "error");
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      showToast("Settings saved!", "success");
      fetchTemplates();
    } catch (error) { showToast("Failed to save settings.", "error"); } finally { setIsSavingSettings(false); }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplate.name || !newTemplate.subject || !newTemplate.body) return;
    const payload = { ...newTemplate, id: editingTemplateId };
    await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setNewTemplate({ name: "", subject: "", body: "" }); setEditingTemplateId(null); setIsCreatingTemplate(false); fetchTemplates(); 
    showToast(editingTemplateId ? "Template updated!" : "Template saved!", "success");
  };

  const handleDeleteTemplate = async (id: string) => {
    await fetch("/api/templates?id=" + id, { method: "DELETE" });
    fetchTemplates(); showToast("Template deleted", "success");
  };

  const handleDeleteDraft = async () => {
    if (!deletingDraftId) return;
    const idToDelete = deletingDraftId;
    setDrafts(prev => prev.filter(d => d.id !== idToDelete));
    setDeletingDraftId(null);
    showToast("Draft deleted", "success");
    try {
      await fetch("/api/drafts?id=" + idToDelete, { method: "DELETE" });
      fetchSites(); 
    } catch (error) { showToast("Failed to delete draft", "error"); fetchDrafts(); }
  };

  const handleMakeEligibleClick = () => { if (selectedSites.length > 0) setShowMakeEligibleModal(true); };

  const confirmMakeEligible = async () => {
    setShowMakeEligibleModal(false);
    try {
      await fetch("/api/sites/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedSites, status: "EMAIL_FOUND" }) });
      showToast(selectedSites.length + " sites marked as eligible.", "success");
      setSelectedSites([]); fetchSites();
    } catch (error) { showToast("Failed to update statuses.", "error"); }
  };

  const handleSendToNew = async () => {
    if (!settings.defaultTemplateId) { setShowSendToNewModal(false); return showToast("Please set a Default Template in Settings first.", "error"); }
    setShowSendToNewModal(false); setIsSendingNew(true);
    try {
      const res = await fetch("/api/send-new", { method: "POST" });
      const data = await res.json();
      if (data.success) { showToast("Successfully sent " + data.count + " emails!", "success"); fetchDrafts(); fetchSites(); } 
      else showToast(data.error || "Failed to send", "error");
    } catch (error) { showToast("Error sending emails", "error"); } finally { setIsSendingNew(false); }
  };

  const handleRunFollowUps = async () => {
    setShowFollowUpModal(false); setIsSendingFollowUps(true);
    try {
      const res = await fetch("/api/follow-up", { method: "POST" });
      const data = await res.json();
      if (data.success) { showToast("Successfully sent " + data.count + " follow-ups!", "success"); fetchDrafts(); fetchSites(); } 
      else showToast(data.error || "Failed to send follow-ups", "error");
    } catch (error) { showToast("Error sending follow-ups", "error"); } finally { setIsSendingFollowUps(false); }
  };

  const handleSyncInbox = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) { showToast("Synced " + data.count + " new replies!", "success"); fetchInbox(); fetchSites(); } 
      else showToast(data.error || "Failed to sync", "error");
    } catch (error) { showToast("Error syncing inbox", "error"); } finally { setIsSyncing(false); }
  };

  const handleSendReply = async () => {
    if (!activeThread || !replyText) return;
    setIsReplying(true);
    const formData = new FormData();
    formData.append("emailId", activeThread.id);
    formData.append("body", replyText);
    if (replyFile) formData.append("file", replyFile);
    try {
      const res = await fetch("/api/reply", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) { showToast("Reply sent!", "success"); setReplyText(""); setReplyFile(null); fetchInbox(); } 
      else showToast(data.error, "error");
    } catch (e) { showToast("Failed to send reply", "error"); } finally { setIsReplying(false); }
  };

  const processFile = (file: File) => {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const sizeKB = (file.size / 1024).toFixed(1);
    const displaySize = file.size > 1024 * 1024 ? sizeMB + " MB" : sizeKB + " KB";
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const validRows = results.data.filter((row: any) => {
          const val = row.url || row.website || row.domain || Object.values(row)[0];
          return val && typeof val === 'string';
        });
        setPendingFile(file); setFileStats({ name: file.name, size: displaySize, count: validRows.length });
      }
    });
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); };
  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) processFile(e.target.files[0]); if (fileInputRef.current) fileInputRef.current.value = ""; };
  const cancelUpload = () => { setPendingFile(null); setFileStats(null); };

  const startScrapeFromFile = async () => {
    if (!pendingFile) return;
    setIsUploading(true);
    const formData = new FormData(); formData.append("file", pendingFile);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        cancelUpload(); setBatchIds(data.ids); setShowProgress(true); setIsStopped(false);
        setProgressStats({ total: data.total, done: 0, found: 0 }); setCurrentAction("Starting batch of " + data.total + " websites..."); fetchSites();
      } else showToast(data.error || "Upload failed", "error");
    } catch (error) { showToast("Failed to upload CSV", "error"); } finally { setIsUploading(false); }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault(); if (!manualDomain) return; setIsAdding(true);
    try {
      const res = await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: manualDomain, email: manualEmail }) });
      if (res.ok) { setShowAddModal(false); setManualDomain(""); setManualEmail(""); showToast("Website added!", "success"); fetchSites(); } 
      else { const err = await res.json(); showToast(err.error, "error"); }
    } finally { setIsAdding(false); }
  };

  const initiateScrape = (ids: string[]) => {
    if (ids.length === 0) return;
    const hasExistingEmail = sites.filter(s => ids.includes(s.id) && s.email).length > 0;
    if (hasExistingEmail) setScrapePrompt({ ids, hasExistingEmail: true }); else runScrape(ids);
  };

  const runScrape = async (ids: string[]) => {
    setScrapePrompt(null); setBatchIds(ids); setIsStopped(false);
    setSites(prev => prev.map(s => ids.includes(s.id) ? { ...s, status: 'PROCESSING', progressMessage: 'Starting...' } : s));
    setShowProgress(true); setProgressStats({ total: ids.length, done: 0, found: 0 }); setCurrentAction("Starting scrape for " + ids.length + " websites...");
    await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ websiteIds: ids }) });
  };

  const stopScrape = async () => {
    setIsStopped(true); setCurrentAction("Stopping... please wait.");
    await fetch("/api/scrape/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ websiteIds: batchIds }) });
    fetchSites(); setCurrentAction("Scraping paused by user.");
  };

  const resumeScrape = async () => {
    const remainingIds = sites.filter(s => batchIds.includes(s.id) && s.status === 'NEW').map(s => s.id);
    if (remainingIds.length === 0) { setIsStopped(false); return; }
    setIsStopped(false); setCurrentAction("Resuming scrape...");
    setSites(prev => prev.map(s => remainingIds.includes(s.id) ? { ...s, status: 'PROCESSING', progressMessage: 'Starting...' } : s));
    await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ websiteIds: remainingIds }) });
  };

  const confirmDelete = async () => {
    if (!deletingSite) return;
    await fetch("/api/sites?id=" + deletingSite.id, { method: "DELETE" });
    setDeletingSite(null); setSelectedSites(prev => prev.filter(id => id !== deletingSite.id)); fetchSites();
  };

  const confirmBulkDelete = async () => {
    if (!bulkDeletePrompt) return;
    await Promise.all(bulkDeletePrompt.map(id => fetch("/api/sites?id=" + id, { method: "DELETE" })));
    setBulkDeletePrompt(null); setSelectedSites([]); fetchSites();
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/sites", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingSite) });
    setEditingSite(null); fetchSites();
  };

  const progressPercent = progressStats.total === 0 ? 0 : Math.round((progressStats.done / progressStats.total) * 100);
  const isFinished = progressStats.done >= progressStats.total && progressStats.total > 0;
  const isSingleSite = batchIds.length === 1;
  const singleSite = sites.find(s => batchIds.includes(s.id));

  const renderAttachments = (attachmentsJson: string | null | undefined, isFromUs: boolean) => {
    if (!attachmentsJson) return null;
    try {
      const attachments = JSON.parse(attachmentsJson);
      if (!Array.isArray(attachments) || attachments.length === 0) return null;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          {attachments.map((att: any, i: number) => {
            const dataUrl = `data:${att.type};base64,${att.data}`;
            if (att.type.startsWith('image/')) {
              return <img key={i} src={dataUrl} alt={att.name} style={{ maxWidth: '100%', borderRadius: '8px', border: isFromUs ? '1px solid rgba(0,0,0,0.1)' : '1px solid var(--border-subtle)' }} />;
            } else {
              return (
                <a key={i} href={dataUrl} download={att.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: isFromUs ? 'rgba(0,0,0,0.05)' : '#F3F4F6', borderRadius: '6px', textDecoration: 'none', color: isFromUs ? '#000' : '#111', fontSize: '12px', fontWeight: 500 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  {att.name}
                </a>
              );
            }
          })}
        </div>
      );
    } catch (e) { return null; }
  };

  return (
    <div className="app-container">
      {toast && (
        <div style={{ position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#FFF', padding: '12px 24px', borderRadius: '8px', fontWeight: 500, fontSize: '13.5px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 9999, animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)', letterSpacing: '-0.01em' }}>{toast.message}</div>
      )}

      {messageToast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#fff', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid var(--border-subtle)', zIndex: 9999, display: 'flex', gap: '16px', padding: '16px', width: '340px', animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)', cursor: 'pointer' }} onClick={() => { const thread = inbox.find(t => t.id === messageToast.threadId); if (thread) handleThreadClick(thread); setMessageToast(null); }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#84CC16', color: '#000', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0, fontSize: '16px' }}>{messageToast.domain.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#111', display: 'flex', justifyContent: 'space-between' }}><span>{messageToast.domain}</span><span style={{ fontSize: '11px', color: '#84CC16', background: '#F0FDF4', padding: '2px 6px', borderRadius: '4px' }}>New Message</span></div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '4px' }}>{messageToast.body}</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setMessageToast(null); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      <aside className="sidebar">
        <div className="brand-logo"><img src="/logo.png" alt="Cadence Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', filter: 'drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.15))' }} /></div>
        <nav style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className={"nav-item " + (activeTab === 'websites' ? 'active' : '')} onClick={() => setActiveTab('websites')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span>Websites</span>
          </div>
          <div className={"nav-item " + (activeTab === 'emails' ? 'active' : '')} onClick={() => setActiveTab('emails')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><span>Outbox</span>
          </div>
          <div className={"nav-item " + (activeTab === 'responded' ? 'active' : '')} onClick={() => setActiveTab('responded')} style={{ position: 'relative' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            <span>Inbox</span>
            {unreadCount > 0 && (
              <div style={{ position: 'absolute', top: '4px', right: '14px', background: '#EF4444', color: '#FFF', borderRadius: '50%', minWidth: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', padding: '0 4px' }}>
                {unreadCount}
              </div>
            )}
          </div>
          <div className={"nav-item " + (activeTab === 'scraper' ? 'active' : '')} onClick={() => setActiveTab('scraper')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg><span>Scraper</span>
          </div>
          <div className={"nav-item " + (activeTab === 'ai' ? 'active' : '')} onClick={() => setActiveTab('ai')}>
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.1 12"/><path d="M12 12 21.9 12"/><path d="M12 12 12 21.9"/><path d="M12 12 12 2.1"/></svg><span>AI Assistant</span>
          </div>
          <div className={"nav-item " + (activeTab === 'settings' ? 'active' : '')} onClick={() => setActiveTab('settings')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>Settings</span>
          </div>
          <div className="nav-item" style={{ marginTop: 'auto', color: '#EF4444' }} onClick={handleLogout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Logout</span>
          </div>
        </nav>
      </aside>

      <div className="main-wrapper">
        <header className="top-header">
          <div className="header-top">
            <div className="header-tabs">
              <div className={"header-tab " + (activeTab === 'websites' ? 'active' : '')} onClick={() => setActiveTab('websites')}>Websites</div>
              <div className={"header-tab " + (activeTab === 'emails' ? 'active' : '')} onClick={() => setActiveTab('emails')}>Outbox</div>
              <div className={"header-tab " + (activeTab === 'responded' ? 'active' : '')} onClick={() => setActiveTab('responded')}>Inbox</div>
              <div className={"header-tab " + (activeTab === 'scraper' ? 'active' : '')} onClick={() => setActiveTab('scraper')}>Scraper</div>
              <div className={"header-tab " + (activeTab === 'ai' ? 'active' : '')} onClick={() => setActiveTab('ai')}>AI Assistant</div>
              <div className={"header-tab " + (activeTab === 'settings' ? 'active' : '')} onClick={() => setActiveTab('settings')}>Settings</div>
            </div>
            
            <div className="header-actions">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div className="bell-btn" style={{ cursor: 'pointer', width: '38px', height: '38px', padding: '0', background: '#fff', color: '#000', border: '1px solid #E5E7EB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }} onClick={async () => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications && unreadSystemCount > 0) {
                    await fetch('/api/notifications', { method: 'POST' });
                    setSystemNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                  }
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  {(unreadCount + unreadSystemCount) > 0 && (
                    <div style={{ position: 'absolute', top: '2px', right: '2px', background: '#EF4444', color: '#FFF', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold' }}>{unreadCount + unreadSystemCount}</div>
                  )}
                </div>

                {showNotifications && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setShowNotifications(false)} />
                    <div style={{ position: 'absolute', top: '45px', right: '0', width: '400px', background: '#fff', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid var(--border-subtle)', zIndex: 100, overflow: 'hidden' }}>
                      <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        Notifications
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <button onClick={handleMarkAllRead} style={{ fontSize: '12px', fontWeight: 500, color: 'var(--blue-action)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                            Mark all read
                          </button>
                          <button onClick={handleClearAllNotifications} style={{ fontSize: '12px', fontWeight: 500, color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                            Clear all
                          </button>
                        </div>
                      </div>
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {systemNotifications.length === 0 && unreadThreads.length === 0 ? (
                          <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>No new notifications</div>
                        ) : (
                          <>
                            {systemNotifications.length > 0 && (
                              <>
                                <div style={{ padding: '8px 16px', background: '#F9FAFB', fontSize: '11px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Alerts</div>
                                {systemNotifications.slice(0, 10).map(n => (
                                  <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ fontSize: '13px', color: '#111', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: n.type === 'error' ? '#EF4444' : '#10B981', flexShrink: 0 }} />
                                      {n.message}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '14px', fontWeight: 500 }}>
                                      {new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                            
                            {unreadThreads.length > 0 && (
                              <>
                                <div style={{ padding: '8px 16px', background: '#F9FAFB', fontSize: '11px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unread Messages</div>
                                {unreadThreads.map(thread => {
                                  const lastUnread = thread.replies.filter((r: any) => !r.isFromUs && !r.isRead).pop();
                                  return (
                                    <div key={thread.id} onClick={() => handleThreadClick(thread)} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#84CC16', color: '#FFF', display: 'grid', placeItems: 'center', fontWeight: 600, flexShrink: 0 }}>{thread.website.domain.charAt(0).toUpperCase()}</div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}><span style={{ fontWeight: 600, fontSize: '13px', color: '#111' }}>{thread.website.domain}</span></div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastUnread?.body || "New reply"}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {activeTab === 'websites' && selectedSites.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', animation: 'fadeIn 0.2s ease' }}>
                  <button className="btn-black" style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }} onClick={() => setBulkDeletePrompt(selectedSites)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> DELETE ({selectedSites.length})</button>
                  <button className="btn-black" style={{ background: '#fff', color: '#000', border: '1px solid #E5E7EB' }} onClick={handleMakeEligibleClick}>MAKE ELIGIBLE</button>
                  <button className="btn-black" style={{ background: '#84CC16', color: '#FFF' }} onClick={() => initiateScrape(selectedSites)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg> RUN SCRAPER ({selectedSites.length})</button>
                </div>
              )}
              {activeTab === 'websites' && (
                <button className="btn-black" style={{ background: '#fff', color: '#000', border: '1px solid #E5E7EB' }} onClick={() => setShowAddModal(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg> ADD WEBSITE</button>
              )}
              {activeTab === 'responded' && (
                <button className="btn-black" onClick={handleSyncInbox} disabled={isSyncing}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg> {isSyncing ? "SYNCING..." : "SYNC INBOX"}
                </button>
              )}
              <input type="file" accept=".csv" ref={fileInputRef} onChange={onFileSelect} style={{ display: 'none' }} />
              <button className="btn-black" onClick={() => fileInputRef.current?.click()} style={{ display: activeTab === 'settings' || activeTab === 'ai' ? 'none' : 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg> IMPORT CSV</button>
            </div>
          </div>
        </header>

        <main className="content-area">
          
          {activeTab === 'websites' && (
            <>
              {displaySites.length === 0 ? (
                <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} style={{ background: isDragging ? '#F0FDF4' : '#fff', border: "2px dashed " + (isDragging ? '#84CC16' : '#E5E7EB'), borderRadius: '12px', padding: '60px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', height: '400px' }}>
                  {!fileStats ? (
                    <>
                      <div style={{ width: '64px', height: '64px', background: '#F3F4F6', borderRadius: '50%', display: 'grid', placeItems: 'center', marginBottom: '20px' }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
                      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Welcome to Cadence</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>Click or drag and drop your CSV to start finding emails.</p>
                      <div style={{ display: 'flex', gap: '12px' }}><button className="btn-black" onClick={() => fileInputRef.current?.click()}>Select File</button><button className="btn-black" style={{ background: '#fff', color: '#000', border: '1px solid #E5E7EB' }} onClick={() => setShowAddModal(true)}>Add Manually</button></div>
                    </>
                  ) : (
                    <div style={{ animation: 'fadeIn 0.3s ease', width: '400px', background: '#F9FAFB', padding: '32px', borderRadius: '12px', border: '1px solid #E5E7EB', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><span style={{ fontSize: '16px', fontWeight: 600 }}>{fileStats.name}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}><div><strong>{fileStats.size}</strong></div><div>•</div><div><strong style={{ color: '#10B981' }}>{fileStats.count}</strong> Websites Found</div></div>
                      <div style={{ display: 'flex', gap: '12px' }}><button onClick={cancelUpload} style={{ flex: 1, padding: '10px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: '6px', fontWeight: 600, fontSize: '13px' }}>Cancel</button><button onClick={startScrapeFromFile} disabled={isUploading} className="btn-black" style={{ flex: 2, justifyContent: 'center' }}>{isUploading ? "STARTING..." : "START SCRAPING (" + fileStats.count + ")"}</button></div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="card"><table>
                  <thead><tr><th style={{ width: '40px' }}><input type="checkbox" className="checkbox" checked={isAllSelected} onChange={toggleAllSites} /></th><th>Domain</th><th>Email Found</th><th>Price</th><th>Status</th><th>Date Added</th><th style={{ width: '120px', textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {displaySites.map((site) => (
                      <tr key={site.id} style={{ background: selectedSites.includes(site.id) ? '#F9FAFB' : 'transparent' }}>
                        <td><input type="checkbox" className="checkbox" checked={selectedSites.includes(site.id)} onChange={() => toggleSite(site.id)} /></td>
                        <td style={{ fontWeight: 500 }}>{site.domain}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{site.email || <span style={{ fontStyle: 'italic' }}>-</span>}</td>
                        <td style={{ fontWeight: 600, color: '#111' }}>{site.price || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>-</span>}</td>
                        <td><span className={"tag " + (site.status === 'EMAIL_FOUND' ? 'tag-green' : site.status === 'SENT' ? 'tag-blue' : site.status === 'REPLIED' ? 'tag-purple' : site.status === 'NO_EMAIL' ? 'tag-red' : 'tag-gray')}>{site.status.replace('_', ' ')}</span></td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(site.createdAt).toLocaleDateString()}</td>
                        <td style={{ textAlign: 'right' }}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button onClick={() => initiateScrape([site.id])} title="Run Scraper" style={{ color: '#3B82F6' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></button>
                          <button onClick={() => setEditingSite(site)} title="Edit" style={{ color: 'var(--text-muted)' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                          <button onClick={() => setDeletingSite(site)} title="Delete" style={{ color: '#EF4444' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </>
          )}

          {activeTab === 'emails' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="card" style={{ padding: '24px', height: 'fit-content' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>1-Click Outreach</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>Send your default template to all newly discovered leads.</p>
                  {settings.defaultTemplateId ? (
                    <button className="btn-black" style={{ width: '100%', justifyContent: 'center', background: '#84CC16', color: '#FFF', padding: '16px' }} onClick={() => setShowSendToNewModal(true)} disabled={isSendingNew}>{isSendingNew ? "GENERATING & SENDING..." : "SEND TO NEW LEADS"}</button>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '16px', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FECACA' }}><p style={{ fontSize: '13px', color: '#EF4444', marginBottom: '12px' }}>No default template set.</p><button className="btn-black" style={{ width: '100%', justifyContent: 'center', background: '#fff', color: '#000', border: '1px solid #E5E7EB' }} onClick={() => setActiveTab('settings')}>Go to Settings</button></div>
                  )}
                </div>
                <div className="card" style={{ padding: '24px', height: 'fit-content' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Follow-Up Engine</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>Send AI nudges to leads who haven't replied.</p>
                  <button className="btn-black" style={{ width: '100%', justifyContent: 'center', background: '#111', color: '#FFF', padding: '16px' }} onClick={() => setShowFollowUpModal(true)} disabled={isSendingFollowUps}>{isSendingFollowUps ? "SENDING FOLLOW-UPS..." : "RUN FOLLOW-UPS"}</button>
                </div>
                <div className="card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><h3 style={{ fontSize: '16px', fontWeight: 600 }}>Templates</h3><button onClick={() => { setIsCreatingTemplate(!isCreatingTemplate); setEditingTemplateId(null); setNewTemplate({ name: "", subject: "", body: "" }); }} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--blue-action)' }}>+ NEW</button></div>
                  {isCreatingTemplate ? (
                    <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input type="text" placeholder="Template Name" value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value})} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontSize: '12px' }} />
                      <input type="text" placeholder="Subject" value={newTemplate.subject} onChange={e => setNewTemplate({...newTemplate, subject: e.target.value})} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontSize: '12px' }} />
                      <textarea placeholder="Body" value={newTemplate.body} onChange={e => setNewTemplate({...newTemplate, body: e.target.value})} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontSize: '12px', height: '60px', resize: 'none' }} />
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button type="button" onClick={() => { setIsCreatingTemplate(false); setEditingTemplateId(null); setNewTemplate({ name: "", subject: "", body: "" }); }} className="btn-black" style={{ flex: 1, padding: '8px', fontSize: '12px', justifyContent: 'center', background: '#fff', color: '#000', border: '1px solid var(--border-strong)' }}>CANCEL</button>
                        <button type="submit" className="btn-black" style={{ flex: 1, padding: '8px', fontSize: '12px', justifyContent: 'center' }}>{editingTemplateId ? "UPDATE TEMPLATE" : "SAVE TEMPLATE"}</button>
                      </div>
                    </form>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {templates.map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#F9FAFB', padding: '10px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                          <span style={{ fontWeight: 500 }}>{t.name}</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => { setNewTemplate({ name: t.name, subject: t.subject, body: t.body }); setEditingTemplateId(t.id); setIsCreatingTemplate(true); }} style={{ color: '#3B82F6', display: 'flex', alignItems: 'center' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                            <button onClick={() => handleDeleteTemplate(t.id)} style={{ color: '#EF4444', display: 'flex', alignItems: 'center' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="card">
                <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}><h3 style={{ fontSize: '16px', fontWeight: 600 }}>Sent History</h3></div>
                <table>
                  <thead><tr><th>Domain</th><th>Subject</th><th>Status</th><th>Follow-ups</th><th style={{ width: '80px', textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {drafts.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No emails sent yet.</td></tr>
                    ) : (
                      drafts.map((draft) => (
                        <tr key={draft.id} onClick={() => setViewingEmail(draft)} style={{ cursor: 'pointer' }}>
                          <td style={{ fontWeight: 500 }}>{draft.website?.domain}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{draft.subject}</td>
                          <td>{draft.replies?.length > 0 ? <span className="tag tag-green">Replied</span> : draft.isOpened ? <span className="tag tag-purple">Opened</span> : <span className="tag tag-blue">Sent</span>}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{draft.followUpCount} sent</td>
                          <td style={{ textAlign: 'right' }}><button onClick={(e) => { e.stopPropagation(); setDeletingDraftId(draft.id); }} style={{ color: '#EF4444' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'responded' && (
            <div className="card" style={{ display: 'flex', height: 'calc(100vh - 160px)', overflow: 'hidden' }}>
              
              <div style={{ width: '260px', borderRight: '1px solid var(--border-subtle)', overflowY: 'auto', background: '#fff' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', background: '#fff' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Inbox</h3>
                </div>
                {inbox.map(thread => {
                  const lastReply = thread.replies[thread.replies.length - 1];
                  const unreadInThread = thread.replies.filter((r: any) => !r.isFromUs && !r.isRead).length;
                  const hasUnread = unreadInThread > 0;
                  
                  return (
                    <div key={thread.id} onClick={() => handleThreadClick(thread)} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: activeThread?.id === thread.id ? '#F0FDF4' : 'transparent', borderLeft: activeThread?.id === thread.id ? '3px solid #84CC16' : '3px solid transparent' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: hasUnread ? '#111' : 'var(--text-muted)' }}>{thread.website.domain}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(lastReply.receivedAt).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: hasUnread ? '#111' : 'var(--text-muted)', fontWeight: hasUnread ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '6px' }}>
                        {lastReply.isFromUs ? 'You: ' : ''}{lastReply.body}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{thread.replies.length + 1} messages</span>
                        {hasUnread && (
                          <div style={{ background: '#EF4444', color: '#FFF', borderRadius: '50%', minWidth: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', fontSize: '10px', fontWeight: 'bold' }}>
                            {unreadInThread}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {inbox.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No replies yet. Click "Sync Inbox" to fetch.</div>}
              </div>

              {activeThread ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#84CC16', color: '#FFF', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{activeThread.website.domain.charAt(0).toUpperCase()}</div>
                    <div><div style={{ fontWeight: 600, fontSize: '16px' }}>{activeThread.website.domain}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{activeThread.website.email}</div></div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#F8F9FB' }}>
                    <div style={{ alignSelf: 'flex-end', maxWidth: '70%' }}>
                      <div style={{ background: '#000', color: '#fff', padding: '12px 16px', borderRadius: '16px 16px 4px 16px', fontSize: '13px', lineHeight: 1.5 }}>
                        <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '4px', fontWeight: 600 }}>You originally sent:</div>{activeThread.body}
                      </div>
                    </div>
                    {activeThread.replies.map((reply: any) => (
                      <div key={reply.id} style={{ alignSelf: reply.isFromUs ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                        <div style={{ background: reply.isFromUs ? '#84CC16' : '#fff', color: reply.isFromUs ? '#FFF' : '#333', padding: '12px 16px', borderRadius: reply.isFromUs ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize: '13px', lineHeight: 1.5, border: reply.isFromUs ? 'none' : '1px solid var(--border-subtle)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                          {reply.body}{renderAttachments(reply.attachments, reply.isFromUs)}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', textAlign: reply.isFromUs ? 'right' : 'left' }}>{new Date(reply.receivedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', background: '#fff', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <label style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg><input type="file" style={{ display: 'none' }} onChange={(e) => setReplyFile(e.target.files?.[0] || null)} /></label>
                    {replyFile && <span style={{ fontSize: '11px', color: '#166534', background: '#D1FAE5', padding: '4px 8px', borderRadius: '4px' }}>{replyFile.name}</span>}
                    <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSendReply(); }} placeholder="Type your reply..." style={{ flex: 1, padding: '12px 16px', borderRadius: '24px', border: '1px solid var(--border-strong)', fontSize: '14px', outline: 'none' }} />
                    <button onClick={handleSendReply} disabled={isReplying || !replyText} style={{ background: '#84CC16', color: '#FFF', width: '44px', height: '44px', borderRadius: '50%', display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: '#F8F9FB', color: 'var(--text-muted)' }}>Select a conversation to view</div>
              )}
            </div>
          )}

          {activeTab === 'scraper' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
              <div className="card" style={{ padding: '32px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> Scraper Engine</h2>
                {batchIds.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px' }}><h3 style={{ fontSize: '20px', fontWeight: 600 }}>{isStopped ? "Scraping Paused" : isFinished ? "Scraping Complete" : "Scraping in Progress..."}</h3><span style={{ fontSize: '28px', fontWeight: 800, color: '#111' }}>{progressPercent}%</span></div>
                    <div style={{ width: '100%', height: '12px', background: '#E5E7EB', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}><div style={{ height: '100%', width: progressPercent + "%", background: isStopped ? '#EF4444' : '#84CC16', borderRadius: '10px', transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }} /></div>
                    <div style={{ height: '24px', marginBottom: '32px', fontSize: '14px', color: '#6B7280', fontWeight: 500 }}>{isStopped ? "Paused by user. You can resume this batch anytime." : !isFinished ? currentAction : "All tasks completed successfully."}</div>
                    <div style={{ display: 'flex', gap: '32px', fontSize: '15px', color: '#4B5563', marginBottom: '32px', borderTop: '1px solid #E5E7EB', paddingTop: '24px' }}>
                      {isSingleSite ? (
                        <div style={{ fontWeight: 500 }}>{isFinished ? (singleSite?.email ? <span style={{ color: '#166534', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg> Email Found: {singleSite.email}</span> : <span style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg> No Email Found</span>) : <span style={{ color: '#6B7280' }}>Searching for contact email...</span>}</div>
                      ) : (
                        <><div><strong style={{ color: '#111', fontSize: '20px' }}>{progressStats.total}</strong> <br/>Total Sites</div><div><strong style={{ color: '#111', fontSize: '20px' }}>{progressStats.done}</strong> <br/>Scraped</div><div style={{ color: '#166534' }}><strong style={{ fontSize: '20px' }}>{progressStats.found}</strong> <br/>Emails Found</div></>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      {isStopped ? (
                        <><button onClick={() => setBatchIds([])} style={{ flex: 1, padding: '14px', fontSize: '14px', fontWeight: 600, background: '#fff', border: '1px solid var(--border-strong)', borderRadius: '6px', cursor: 'pointer' }}>Clear</button><button onClick={resumeScrape} className="btn-black" style={{ flex: 2, justifyContent: 'center', padding: '14px', fontSize: '14px', cursor: 'pointer' }}>Resume Scraping</button></>
                      ) : isFinished ? (
                        <button className="btn-black" style={{ width: '100%', justifyContent: 'center', background: '#000', color: '#FFF', padding: '14px', fontSize: '14px', cursor: 'pointer' }} onClick={() => { setBatchIds([]); setActiveTab('websites'); }}>View Results</button>
                      ) : (
                        <><button onClick={stopScrape} style={{ flex: 1, padding: '14px', fontSize: '14px', fontWeight: 600, background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '6px', transition: 'all 0.2s', cursor: 'pointer' }}>Stop Scraping</button><button className="btn-black" style={{ flex: 2, justifyContent: 'center', background: '#F3F4F6', color: '#9CA3AF', cursor: 'not-allowed', padding: '14px', fontSize: '14px' }} disabled>Running in background...</button></>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '60px 20px', textAlign: 'center', background: '#F9FAFB', borderRadius: '12px', border: '1px dashed #E5E7EB' }}>
                    <div style={{ width: '64px', height: '64px', background: '#F3F4F6', borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111', marginBottom: '8px' }}>No Active Scraping</h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>Import a CSV or run the scraper from the Websites tab to see progress here.</p>
                    <button className="btn-black" onClick={() => setActiveTab('websites')} style={{ margin: '0 auto' }}>Go to Websites</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div style={{ display: 'flex', height: 'calc(100vh - 160px)', gap: '16px' }}>
              <div className="card" style={{ width: '260px', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }} onClick={() => setContextMenu(null)}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '8px' }}>
                  <button className="btn-black" style={{ flex: 1, justifyContent: 'center', padding: '8px' }} onClick={() => {
                    const newChat = { id: Date.now().toString(), title: "New Chat", messages: [] };
                    setAiChats([newChat, ...aiChats]);
                    setActiveChatId(newChat.id);
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><path d="M12 5v14M5 12h14"/></svg>
                    NEW
                  </button>
                  <button className="btn-black" style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', padding: '8px' }} onClick={handleDeleteAllChats} title="Delete All">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {aiChats.map(chat => (
                    <div 
                      key={chat.id} 
                      onClick={() => setActiveChatId(chat.id)} 
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, chatId: chat.id }); }}
                      style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: activeChatId === chat.id ? '#F0FDF4' : 'transparent', borderLeft: activeChatId === chat.id ? '3px solid #84CC16' : '3px solid transparent' }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chat.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{chat.messages.length} messages</div>
                    </div>
                  ))}
                </div>

                {contextMenu && (
                  <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 9999, padding: '4px', minWidth: '120px' }} onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => handleDeleteChat(contextMenu.chatId)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '13px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#FEF2F2'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      Delete Chat
                    </button>
                  </div>
                )}
              </div>

              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', background: '#fff' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{aiChats.find(c => c.id === activeChatId)?.title || "AI Assistant"}</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Linked to your CRM database. Ask about budgets, replies, etc.</p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#F8F9FB' }}>
                  {(!activeChatId || aiChats.find(c => c.id === activeChatId)?.messages.length === 0) ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2, margin: '0 auto 16px' }}><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.1 12"/><path d="M12 12 21.9 12"/><path d="M12 12 12 21.9"/><path d="M12 12 12 2.1"/></svg>
                      <p style={{ fontSize: '15px', fontWeight: 500 }}>How can I help you today?</p>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
                        {["What is the budget test.com asked for?", "Who agreed to a guest post?", "Summarize my active conversations."].map(q => (
                          <button key={q} onClick={() => setAiInput(q)} style={{ background: '#fff', border: '1px solid var(--border-subtle)', padding: '8px 12px', borderRadius: '16px', fontSize: '12px', cursor: 'pointer', color: '#333' }}>{q}</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    aiChats.find(c => c.id === activeChatId)?.messages.map((msg, i) => (
                      <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                        <div style={{ background: msg.role === 'user' ? '#000' : '#fff', color: msg.role === 'user' ? '#fff' : '#333', padding: '12px 16px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize: '14px', lineHeight: 1.6, border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                          {msg.role === 'user' ? (
                            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                          ) : (
                            <div className="markdown-body">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {isAiTyping && (
                    <div style={{ alignSelf: 'flex-start', background: '#fff', padding: '12px 16px', borderRadius: '16px 16px 16px 4px', border: '1px solid var(--border-subtle)', fontSize: '14px', color: '#666', display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span className="dot" style={{ width: '6px', height: '6px', background: '#999', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both' }}></span>
                      <span className="dot" style={{ width: '6px', height: '6px', background: '#999', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}></span>
                      <span className="dot" style={{ width: '6px', height: '6px', background: '#999', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}></span>
                    </div>
                  )}
                  <div ref={aiChatEndRef} />
                </div>

                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', background: '#fff', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    value={aiInput} 
                    onChange={e => setAiInput(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter') handleSendAiMessage(); }} 
                    placeholder="Ask about your campaigns..." 
                    style={{ flex: 1, padding: '14px 20px', borderRadius: '24px', border: '1px solid var(--border-strong)', fontSize: '14px', outline: 'none', background: '#F9FAFB' }} 
                  />
                  <button onClick={handleSendAiMessage} disabled={!aiInput.trim() || isAiTyping} style={{ background: '#84CC16', color: '#FFF', width: '44px', height: '44px', borderRadius: '50%', display: 'grid', placeItems: 'center', border: 'none', cursor: isAiTyping || !aiInput.trim() ? 'not-allowed' : 'pointer', opacity: isAiTyping || !aiInput.trim() ? 0.5 : 1 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
              <div className="card" style={{ padding: '32px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>AI Configuration</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>Manage your Claude API keys.</p>
                <form onSubmit={handleSettingsSave}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Anthropic (Claude) API Key</label>
                    <input type="text" value={settings.anthropicApiKey} onChange={e => setSettings({...settings, anthropicApiKey: e.target.value})} placeholder="sk-ant-..." style={{ width: '100%', padding: '10px', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Default Template</label>
                    <select value={settings.defaultTemplateId || ''} onChange={e => setSettings({...settings, defaultTemplateId: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontSize: '13px' }}>
                      <option value="">-- None --</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '32px 0 16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>Follow-Up Rules</h3>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Max Follow-ups</label>
                      <input type="number" value={settings.followUpLimit} onChange={e => setSettings({...settings, followUpLimit: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '13px' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Wait Time</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="number" value={settings.followUpDelayValue} onChange={e => setSettings({...settings, followUpDelayValue: e.target.value})} style={{ width: '50%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '13px' }} />
                        <select value={settings.followUpDelayUnit} onChange={e => setSettings({...settings, followUpDelayUnit: e.target.value})} style={{ width: '50%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '13px' }}>
                          <option value="minutes">Minutes</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>AI Follow-Up Prompt</label>
                    <textarea value={settings.followUpPrompt} onChange={e => setSettings({...settings, followUpPrompt: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '13px', height: '60px', resize: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', background: '#F9FAFB', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <input type="checkbox" checked={settings.autoFollowUpEnabled === "true"} onChange={e => setSettings({...settings, autoFollowUpEnabled: e.target.checked ? "true" : "false"})} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>Enable Automatic Follow-ups</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>The system will automatically run follow-ups in the background every hour.</div>
                    </div>
                  </div>
                  <button type="submit" disabled={isSavingSettings} className="btn-black" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>{isSavingSettings ? "SAVING..." : "SAVE AI SETTINGS"}</button>
                </form>
              </div>
              <div className="card" style={{ padding: '32px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Microsoft 365</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>Connect your sending mailbox.</p>
                <form onSubmit={handleSettingsSave}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Sender Email (GoDaddy Email)</label>
                    <input type="email" value={settings.msSenderEmail || ''} onChange={e => setSettings({...settings, msSenderEmail: e.target.value})} placeholder="e.g. hello@yourdomain.com" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Client ID</label>
                    <input type="text" value={settings.msClientId} onChange={e => setSettings({...settings, msClientId: e.target.value})} placeholder="Application (client) ID" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Client Secret</label>
                    <input type="text" value={settings.msClientSecret} onChange={e => setSettings({...settings, msClientSecret: e.target.value})} placeholder="Client Secret Value" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Tenant ID</label>
                    <input type="text" value={settings.msTenantId} onChange={e => setSettings({...settings, msTenantId: e.target.value})} placeholder="Directory (tenant) ID" style={{ width: '100%', padding: '10px', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <button type="submit" disabled={isSavingSettings} className="btn-black" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>{isSavingSettings ? "SAVING..." : "SAVE MS 365 SETTINGS"}</button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

            {/* --- CSV UPLOAD PREVIEW MODAL (When sites already exist) --- */}
      {fileStats && displaySites.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 150, backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ padding: '32px', width: '400px', background: '#fff', textAlign: 'center', animation: 'fadeIn 0.2s ease', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <span style={{ fontSize: '16px', fontWeight: 600 }}>{fileStats.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
              <div><strong>{fileStats.size}</strong></div><div>•</div><div><strong style={{ color: '#10B981' }}>{fileStats.count}</strong> Websites Found</div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={cancelUpload} style={{ flex: 1, padding: '10px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={startScrapeFromFile} disabled={isUploading} className="btn-black" style={{ flex: 2, justifyContent: 'center', cursor: 'pointer' }}>
                {isUploading ? "STARTING..." : "START SCRAPING (" + fileStats.count + ")"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- RUN FOLLOW UPS MODAL --- */}
      {showFollowUpModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ padding: '32px', width: '420px', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FEF3C7', color: '#D97706', display: 'grid', placeItems: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em' }}>Run Follow-Ups</h3>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>This will generate AI follow-ups for emails sent more than <strong>{settings.followUpDelayValue} {settings.followUpDelayUnit} ago</strong> that haven't received a reply. Max <strong>{settings.followUpLimit} follow-ups</strong> per email. Proceed?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowFollowUpModal(false)} style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: '1px solid var(--border-strong)', background: '#fff' }}>Cancel</button>
              <button onClick={handleRunFollowUps} style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', background: '#111', color: '#FFF' }}>Confirm & Send</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MAKE ELIGIBLE MODAL --- */}
      {showMakeEligibleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ padding: '24px', width: '420px', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F0FDF4', color: '#166534', display: 'grid', placeItems: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em' }}>Make Eligible</h3>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>Are you sure you want to mark <strong>{selectedSites.length}</strong> websites as eligible for sending? This will reset their status to "Email Found" so they can be targeted by the 1-Click Outreach.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowMakeEligibleModal(false)} style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: '1px solid var(--border-strong)', background: '#fff' }}>Cancel</button>
              <button onClick={confirmMakeEligible} style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', background: '#111', color: '#FFF' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* --- SEND TO NEW LEADS MODAL --- */}
      {showSendToNewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ padding: '32px', width: '420px', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F0FDF4', color: '#166534', display: 'grid', placeItems: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em' }}>Start Outreach</h3>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>This will generate personalized subject lines and send your default template to all <strong>NEW</strong> leads that haven't been contacted yet. Proceed?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowSendToNewModal(false)} style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: '1px solid var(--border-strong)', background: '#fff' }}>Cancel</button>
              <button onClick={handleSendToNew} style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', background: '#111', color: '#FFF' }}>Confirm & Send</button>
            </div>
          </div>
        </div>
      )}

      {/* --- DELETE DRAFT MODAL --- */}
      {deletingDraftId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ padding: '24px', width: '380px', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FEE2E2', color: '#EF4444', display: 'grid', placeItems: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Delete Draft</h3>
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>Are you sure you want to delete this draft? This action cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setDeletingDraftId(null)} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '6px', border: '1px solid var(--border-strong)' }}>Cancel</button>
              <button onClick={handleDeleteDraft} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', background: '#EF4444', color: '#FFF' }}>Delete Draft</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MANUAL ADD MODAL --- */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ padding: '24px', width: '400px', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Add Website Manually</h3>
            <form onSubmit={handleManualAdd}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Domain</label>
              <input type="text" value={manualDomain} onChange={(e) => setManualDomain(e.target.value)} placeholder="e.g. techcrunch.com" required style={{ width: '100%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: '6px', marginBottom: '16px' }} />
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Email (Optional)</label>
              <input type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="e.g. editor@techcrunch.com" style={{ width: '100%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: '6px', marginBottom: '24px' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '6px', border: '1px solid var(--border-strong)' }}>Cancel</button>
                <button type="submit" disabled={isAdding} className="btn-black">{isAdding ? "ADDING..." : "Add Website"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- HORIZONTAL PROGRESS MODAL --- */}
      {showProgress && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 200, backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ position: 'relative', padding: '32px 40px', width: '650px', background: '#fff', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', animation: 'fadeIn 0.3s ease' }}>
            <button onClick={() => setShowProgress(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px' }}><h2 style={{ fontSize: '22px', fontWeight: 700 }}>{isStopped ? "Scraping Paused" : isFinished ? "Scraping Complete" : "Scraping in Progress..."}</h2><span style={{ fontSize: '24px', fontWeight: 800, color: '#111', paddingRight: '30px' }}>{progressPercent}%</span></div>
            <div style={{ width: '100%', height: '8px', background: '#E5E7EB', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}><div style={{ height: '100%', width: progressPercent + "%", background: isStopped ? '#EF4444' : '#84CC16', borderRadius: '10px', transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }} /></div>
            <div style={{ height: '20px', marginBottom: '24px', fontSize: '13px', color: '#6B7280', textAlign: 'left', fontWeight: 500 }}>{isStopped ? "Paused by user. You can resume this batch anytime." : !isFinished ? currentAction : "All tasks completed successfully."}</div>
            <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#4B5563', marginBottom: '32px', borderTop: '1px solid #E5E7EB', paddingTop: '20px' }}>
              {isSingleSite ? (
                <div style={{ fontWeight: 500 }}>{isFinished ? (singleSite?.email ? <span style={{ color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg> Email Found: {singleSite.email}</span> : <span style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: '6px' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg> No Email Found</span>) : <span style={{ color: '#6B7280' }}>Searching for contact email...</span>}</div>
              ) : (
                <><div><strong style={{ color: '#111' }}>{progressStats.total}</strong> Total Sites</div><div><strong style={{ color: '#111' }}>{progressStats.done}</strong> Scraped</div><div style={{ color: '#166534' }}><strong>{progressStats.found}</strong> Emails Found</div></>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {isStopped ? (
                <><button onClick={() => { setShowProgress(false); setBatchIds([]); }} style={{ flex: 1, padding: '14px', fontSize: '14px', fontWeight: 600, background: '#fff', border: '1px solid var(--border-strong)', borderRadius: '6px' }}>Close</button><button onClick={resumeScrape} className="btn-black" style={{ flex: 2, justifyContent: 'center', padding: '14px', fontSize: '14px' }}>Resume Scraping</button></>
              ) : isFinished ? (
                <button className="btn-black" style={{ width: '100%', justifyContent: 'center', background: '#000', color: '#FFF', padding: '14px', fontSize: '14px' }} onClick={() => { setShowProgress(false); setBatchIds([]); setActiveTab('websites'); }}>View Results</button>
              ) : (
                <><button onClick={stopScrape} style={{ flex: 1, padding: '14px', fontSize: '14px', fontWeight: 600, background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '6px', transition: 'all 0.2s' }}>Stop Scraping</button><button onClick={() => setShowProgress(false)} className="btn-black" style={{ flex: 1, justifyContent: 'center', background: '#111', color: '#FFF', padding: '14px', fontSize: '14px' }}>Run in Background</button></>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingSite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ padding: '24px', width: '400px', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Edit Website</h3>
            <form onSubmit={handleEditSave}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Domain</label>
              <input type="text" value={editingSite.domain} onChange={(e) => setEditingSite({...editingSite, domain: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: '6px', marginBottom: '16px' }} />
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Email</label>
              <input type="text" value={editingSite.email || ''} onChange={(e) => setEditingSite({...editingSite, email: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: '6px', marginBottom: '16px' }} />
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Status</label>
              <select value={editingSite.status} onChange={(e) => setEditingSite({...editingSite, status: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: '6px', marginBottom: '24px' }}>
                <option value="NEW">New</option><option value="EMAIL_FOUND">Email Found</option><option value="NO_EMAIL">No Email</option><option value="SENT">Sent</option><option value="REPLIED">Replied</option>
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setEditingSite(null)} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 500 }}>Cancel</button>
                <button type="submit" className="btn-black">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SINGLE DELETE MODAL */}
      {deletingSite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ padding: '24px', width: '380px', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FEE2E2', color: '#EF4444', display: 'grid', placeItems: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Delete Website</h3>
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>Are you sure you want to delete <strong>{deletingSite.domain}</strong>? This action cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setDeletingSite(null)} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '6px', border: '1px solid var(--border-strong)' }}>Cancel</button>
              <button onClick={confirmDelete} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', background: '#EF4444', color: '#FFF' }}>Delete Website</button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE MODAL */}
      {bulkDeletePrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ padding: '24px', width: '400px', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FEE2E2', color: '#EF4444', display: 'grid', placeItems: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Delete {bulkDeletePrompt.length} Websites</h3>
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>Are you sure you want to delete the selected <strong>{bulkDeletePrompt.length}</strong> websites? This action cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setBulkDeletePrompt(null)} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '6px', border: '1px solid var(--border-strong)' }}>Cancel</button>
              <button onClick={confirmBulkDelete} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', background: '#EF4444', color: '#FFF' }}>Delete All</button>
            </div>
          </div>
        </div>
      )}

      {/* RE-SCRAPE CONFIRMATION MODAL */}
      {scrapePrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
          <div className="card" style={{ padding: '24px', width: '420px', background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FEF3C7', color: '#D97706', display: 'grid', placeItems: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg></div>
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Emails Already Found</h3>
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>One or more of the selected websites already have an email address saved. Do you want to re-scrape them and overwrite the existing data, or skip them?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => { const newOnly = scrapePrompt.ids.filter(id => !sites.find(s => s.id === id)?.email); if (newOnly.length === 0) { setScrapePrompt(null); showToast("All selected sites already have emails.", "error"); } else { runScrape(newOnly); } }} style={{ padding: '10px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: '1px solid var(--border-strong)', background: '#F9FAFB' }}>Skip Existing & Scrape New</button>
              <button onClick={() => runScrape(scrapePrompt.ids)} style={{ padding: '10px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', background: '#000', color: '#FFF' }}>Re-scrape Everything (Overwrite)</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => setScrapePrompt(null)} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes slideDown { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: none; } }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
        
        table th, table td { border-right: 1px solid #E5E7EB; }
        table th:last-child, table td:last-child { border-right: none; }
        .tag-green { background: #84CC16; color: #ffffff; }
        .tag-red { background: #EF4444; color: #ffffff; }

        .header-top { align-items: center !important; }
        .header-tabs { display: flex !important; align-items: flex-end !important; height: 100% !important; }
        .header-tab { padding-bottom: 6px !important; padding-top: 2px !important; margin: 0 !important; height: auto !important; font-size: 14px !important; }
        .header-actions { display: flex !important; align-items: center !important; gap: 12px !important; }
        .header-actions .btn-black { height: 38px !important; padding: 0 16px !important; display: flex !important; align-items: center !important; justify-content: center !important; border-radius: 6px !important; font-size: 13px !important; }
        .header-actions .btn-black svg { width: 16px !important; height: 16px !important; margin-right: 6px !important; }
        
        .btn-black, .bell-btn { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important; cursor: pointer !important; }
        .btn-black:hover:not(:disabled), .bell-btn:hover { transform: translateY(-2px) !important; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05) !important; filter: brightness(0.95) !important; }
        .btn-black:active:not(:disabled), .bell-btn:active { transform: translateY(0) !important; box-shadow: none !important; }

        .markdown-body p { margin-bottom: 12px; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body ul { list-style-type: disc; padding-left: 20px; margin-bottom: 12px; }
        .markdown-body ol { list-style-type: decimal; padding-left: 20px; margin-bottom: 12px; }
        .markdown-body li { margin-bottom: 4px; }
        .markdown-body strong { font-weight: 600; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 { font-weight: 600; margin-top: 16px; margin-bottom: 8px; }
        .markdown-body code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 13px; }
      `}</style>
    </div>
  );
}

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  getDocs, 
  query, 
  where, 
  setDoc, 
  doc, 
  getDoc, 
  deleteDoc, 
  writeBatch
} from 'firebase/firestore';
import { db, membersCollection } from './firebase';
import { AllianceMember, Rank, AllianceStats, AllianceConfig } from './types';
import { 
  Users, 
  Plus, 
  Copy, 
  Trash2, 
  AlertTriangle, 
  Zap, 
  Trophy,
  Camera,
  Search,
  FilterX,
  Edit2,
  LayoutGrid,
  ListOrdered,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Swords,
  CheckSquare,
  Square,
  ArrowRightCircle,
  RotateCcw,
  Target,
  AlertOctagon,
  History,
  Info,
  LineChart,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Settings2,
  BarChart2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

type FilterType = 'all' | 'lowPower' | 'lowLevel' | 'atRisk' | 'lowDuelScore' | 'criticalDuelScore';
type ViewMode = 'rank' | 'power_ranking' | 'duel_ranking' | 'progress' | 'duel_progress';
type DuelSubMode = 'daily' | 'weekly';
type Theme = 'light' | 'dark';

interface WeeklyScore {
  name: string;
  totalScore: number;
  yesterdayScore: number;
  daysCount: number;
  level: number;
  rank: Rank;
  lastDate: string;
}

interface ProgressData {
  id: string; 
  name: string;
  rank: Rank; 
  dataPoints: Record<string, { power: number; level: number; duelScore: number }>; 
  totalGrowth: number;
  totalDuelScore: number; // Sum of scores in range
  startPower: number;
  endPower: number;
}

const App: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [members, setMembers] = useState<AllianceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  
  const [editingMember, setEditingMember] = useState<AllianceMember | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('rank');
  const [duelSubMode, setDuelSubMode] = useState<DuelSubMode>('daily');
  const [weeklyData, setWeeklyData] = useState<WeeklyScore[]>([]);
  const [progressData, setProgressData] = useState<ProgressData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [weeklyDateRange, setWeeklyDateRange] = useState<{start: string, end: string} | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'dark';
  });
  
  // Progress Date Range
  const [progressStartDate, setProgressStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6); // Default 1 week
    return d.toISOString().split('T')[0];
  });
  const [progressEndDate, setProgressEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [progressDateList, setProgressDateList] = useState<string[]>([]);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copyTargetDate, setCopyTargetDate] = useState<string>('');

  const [expandedRanks, setExpandedRanks] = useState<Record<Rank, boolean>>({
    [Rank.R3]: true,
    [Rank.R2]: true,
    [Rank.R1]: true
  });

  const [config, setConfig] = useState<AllianceConfig>({
    logo: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/ultra-ball.png",
    allianceName: "[VEBA] ATAMBİR"
  });
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Single Member Form
  const [formName, setFormName] = useState('');
  const [formNameImage, setFormNameImage] = useState<string | null>(null);
  const [formPower, setFormPower] = useState('');
  const [formLevel, setFormLevel] = useState(20);
  const [formRank, setFormRank] = useState<Rank>(Rank.R1);
  const [formTeam1Power, setFormTeam1Power] = useState('');
  const [formDuelScore, setFormDuelScore] = useState('');

  // Bulk Edit Form
  const [bulkFormPower, setBulkFormPower] = useState('');
  const [bulkFormLevel, setBulkFormLevel] = useState('');
  const [bulkFormTeam1Power, setBulkFormTeam1Power] = useState('');
  const [bulkFormDuelScore, setBulkFormDuelScore] = useState('');

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Reset selection when date changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedDate, viewMode]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleRankGroup = (rank: Rank) => {
    setExpandedRanks(prev => ({ ...prev, [rank]: !prev[rank] }));
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    // Determine the current list based on view mode
    let currentList: {id: string}[] = filteredMembers;
    if (viewMode === 'progress' || viewMode === 'duel_progress') {
       currentList = filteredProgressData.map(d => ({id: d.id}));
    }

    if (selectedIds.size === currentList.length && currentList.length > 0) {
      setSelectedIds(new Set());
    } else {
      const newSet = new Set<string>();
      currentList.forEach(m => newSet.add(m.id));
      setSelectedIds(newSet);
    }
  };

  const fetchConfig = async () => {
    try {
      const configDoc = await getDoc(doc(db, "alliance_settings", "global_config"));
      if (configDoc.exists()) {
        const data = configDoc.data() as AllianceConfig;
        if (data.logo) setConfig(prev => ({ ...prev, logo: data.logo }));
      }
    } catch (error) {}
  };

  const fetchMembers = async (date: string) => {
    setLoading(true);
    try {
      const q = query(membersCollection, where("date", "==", date));
      const querySnapshot = await getDocs(q);
      const fetchedMembers: AllianceMember[] = [];
      querySnapshot.forEach((doc) => {
        fetchedMembers.push({ id: doc.id, ...doc.data() } as AllianceMember);
      });
      setMembers(fetchedMembers);
    } catch (error) {
      console.error("Error fetching members:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProgressData = async () => {
    setProgressLoading(true);
    try {
      // 1. Generate Date List for Column Headers
      const start = new Date(progressStartDate);
      const end = new Date(progressEndDate);
      const dateList: string[] = [];
      
      const loopDate = new Date(start);
      while(loopDate <= end) {
        dateList.push(loopDate.toISOString().split('T')[0]);
        loopDate.setDate(loopDate.getDate() + 1);
        if (dateList.length > 31) break; 
      }
      setProgressDateList(dateList);

      // 2. Fetch Data (Range Query)
      const q = query(
        membersCollection, 
        where("date", ">=", progressStartDate), 
        where("date", "<=", progressEndDate)
      );
      
      const querySnapshot = await getDocs(q);
      const rawData: (AllianceMember & {id: string})[] = [];
      querySnapshot.forEach(doc => rawData.push({ id: doc.id, ...doc.data() } as AllianceMember));

      // 3. Aggregate by Name
      const aggregation: Record<string, ProgressData> = {};

      rawData.forEach(m => {
        if (!aggregation[m.name]) {
          aggregation[m.name] = {
            id: m.id, 
            name: m.name,
            rank: m.rank,
            dataPoints: {},
            totalGrowth: 0,
            totalDuelScore: 0,
            startPower: 0,
            endPower: 0
          };
        }
        
        if (m.date >= (Object.keys(aggregation[m.name].dataPoints).sort().pop() || '')) {
             aggregation[m.name].rank = m.rank;
             aggregation[m.name].id = m.id; 
        }

        aggregation[m.name].dataPoints[m.date] = {
          power: m.power,
          level: m.level,
          duelScore: m.duelScore || 0
        };
      });

      // 4. Calculate Stats
      Object.values(aggregation).forEach(item => {
        const dates = Object.keys(item.dataPoints).sort();
        let scoreSum = 0;
        
        dates.forEach(d => {
            scoreSum += item.dataPoints[d].duelScore || 0;
        });
        
        if (dates.length > 0) {
          const firstDate = dates[0];
          const lastDate = dates[dates.length - 1];
          item.startPower = item.dataPoints[firstDate].power;
          item.endPower = item.dataPoints[lastDate].power;
          item.totalGrowth = item.endPower - item.startPower;
        }
        item.totalDuelScore = scoreSum;
      });

      // Sort based on view mode (if duel progress, sort by total score, else by power growth/end power)
      // For now default sort by end power for general progress, but we can switch dynamically if needed.
      // Let's sort based on context:
      const sorted = Object.values(aggregation).sort((a, b) => {
         if (viewMode === 'duel_progress') {
             return b.totalDuelScore - a.totalDuelScore;
         }
         return b.endPower - a.endPower;
      });
      
      setProgressData(sorted);

    } catch (error) {
      console.error("Progress fetch error:", error);
    } finally {
      setProgressLoading(false);
    }
  };

  const fetchWeeklyData = async () => {
    setWeeklyLoading(true);
    try {
      const current = new Date(`${selectedDate}T12:00:00`);
      const dateList: string[] = [];
      const dayOfWeek = current.getDay(); 
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      let startDateStr = '';
      for (let i = 0; i <= daysSinceMonday; i++) {
        const d = new Date(current);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dateList.push(dateStr);
        if (i === daysSinceMonday) startDateStr = dateStr;
      }

      setWeeklyDateRange({ start: startDateStr, end: selectedDate });
      const yesterday = new Date(current);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const q = query(membersCollection, where("date", "in", dateList));
      const querySnapshot = await getDocs(q);
      
      const aggregation: Record<string, WeeklyScore> = {};

      querySnapshot.forEach(doc => {
        const m = doc.data() as AllianceMember;
        const name = m.name;
        
        if (!aggregation[name]) {
          aggregation[name] = { 
            name: name, 
            totalScore: 0, 
            yesterdayScore: 0,
            daysCount: 0, 
            level: m.level, 
            rank: m.rank,
            lastDate: m.date
          };
        }
        aggregation[name].totalScore += Number(m.duelScore || 0);
        aggregation[name].daysCount += 1;
        if (m.date === yesterdayStr) {
          aggregation[name].yesterdayScore = Number(m.duelScore || 0);
        }
        if (m.date === selectedDate || m.date > aggregation[name].lastDate) {
          aggregation[name].level = m.level;
          aggregation[name].rank = m.rank;
          aggregation[name].lastDate = m.date;
        }
      });

      const sorted = Object.values(aggregation).sort((a, b) => b.totalScore - a.totalScore);
      setWeeklyData(sorted);
    } catch (error) {
      console.error("Weekly fetch error:", error);
    } finally {
      setWeeklyLoading(false);
    }
  };

  const refreshData = async () => {
    if (viewMode === 'progress' || viewMode === 'duel_progress') {
      await fetchProgressData();
    } else {
      await fetchMembers(selectedDate);
      if (viewMode === 'duel_ranking' && duelSubMode === 'weekly') {
        await fetchWeeklyData();
      }
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchMembers(selectedDate);
    setActiveFilter('all'); 
  }, [selectedDate]);

  useEffect(() => {
    if (viewMode === 'duel_ranking' && duelSubMode === 'weekly') {
      fetchWeeklyData();
    }
    if (viewMode === 'progress' || viewMode === 'duel_progress') {
      fetchProgressData();
    }
  }, [viewMode, duelSubMode, selectedDate, progressStartDate, progressEndDate]);

  const stats = useMemo<AllianceStats>(() => {
    const lowPower = members.filter(m => m.power < 10).length;
    const lowLevel = members.filter(m => m.level < 20).length;
    const atRisk = members.filter(m => m.power < 10 || m.level < 20 || m.team1Power < 3).length;
    return {
      totalMembers: members.length, lowPowerCount: lowPower, lowLevelCount: lowLevel, totalAtRisk: atRisk
    };
  }, [members]);

  const lowDuelCount = useMemo(() => {
    return members.filter(m => (m.duelScore || 0) < 2000000).length;
  }, [members]);

  const criticalDuelCount = useMemo(() => {
    return members.filter(m => (m.duelScore || 0) < 1000000).length;
  }, [members]);

  const filteredMembers = useMemo(() => {
    let result = [...members];
    if (searchQuery.trim()) {
      const queryStr = searchQuery.toLowerCase();
      result = result.filter(m => m.name.toLowerCase().includes(queryStr));
    }
    
    if (activeFilter === 'criticalDuelScore') {
      result = result.filter(m => (m.duelScore || 0) < 1000000);
    } else if (activeFilter === 'lowDuelScore') {
      result = result.filter(m => (m.duelScore || 0) < 2000000);
    } else {
      switch (activeFilter) {
        case 'lowPower': result = result.filter(m => m.power < 10); break;
        case 'lowLevel': result = result.filter(m => m.level < 20); break;
        case 'atRisk': result = result.filter(m => m.power < 10 || m.level < 20 || m.team1Power < 3); break;
      }
    }

    if (viewMode === 'duel_ranking') {
      result.sort((a, b) => (b.duelScore || 0) - (a.duelScore || 0));
    } else {
      result.sort((a, b) => b.power - a.power);
    }
    
    return result;
  }, [members, activeFilter, searchQuery, viewMode]);

  const filteredProgressData = useMemo(() => {
    let result = [...progressData];
    if (searchQuery.trim()) {
      const queryStr = searchQuery.toLowerCase();
      result = result.filter(m => m.name.toLowerCase().includes(queryStr));
    }
    
    // Sort logic adjustment for view modes
    if (viewMode === 'duel_progress') {
         result.sort((a, b) => b.totalDuelScore - a.totalDuelScore);
    } else {
         result.sort((a, b) => b.endPower - a.endPower);
    }

    return result;
  }, [progressData, searchQuery, viewMode]);

  const handleCopyYesterday = async () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().split('T')[0];
    setLoading(true);
    try {
      const q = query(membersCollection, where("date", "==", yesterday));
      const querySnapshot = await getDocs(q);
      const batchPromises = querySnapshot.docs.map(async (d) => {
        const data = d.data() as AllianceMember;
        const safeName = (data.name || 'uye').replace(/\s+/g, '_');
        const newId = `${selectedDate}_${safeName}_${Math.random().toString(36).substr(2, 5)}`;
        const newMember: AllianceMember = { ...data, id: newId, date: selectedDate, duelScore: 0, updatedAt: Date.now() };
        return setDoc(doc(db, "alliance_members", newId), newMember);
      });
      await Promise.all(batchPromises);
      await refreshData();
      alert("Üye listesi kopyalandı. Düello puanları sıfırlandı.");
    } catch (error) { alert("Hata!"); } finally { setLoading(false); }
  };

  const handleBulkCopy = async () => {
    if (!copyTargetDate) return alert("Lütfen hedef tarih seçin.");
    if (selectedIds.size === 0) return alert("Lütfen üye seçin.");
    if (!confirm(`${selectedIds.size} üyeyi ${copyTargetDate} tarihine kopyalamak istiyor musunuz?`)) return;

    setLoading(true);
    try {
      let idsToCopy = Array.from(selectedIds);
      const batchBatch = []; 
      for (const id of idsToCopy) {
         batchBatch.push(getDoc(doc(db, "alliance_members", id)));
      }
      const snapshots = await Promise.all(batchBatch);
      
      const setPromises = snapshots.map(async (snap) => {
         if (snap.exists()) {
             const data = snap.data() as AllianceMember;
             const safeName = (data.name || 'uye').replace(/\s+/g, '_');
             const newId = `${copyTargetDate}_${safeName}_${Math.random().toString(36).substr(2, 5)}`;
             const newMember: AllianceMember = { ...data, id: newId, date: copyTargetDate, updatedAt: Date.now() };
             return setDoc(doc(db, "alliance_members", newId), newMember);
         }
      });
      
      await Promise.all(setPromises);

      await refreshData();
      alert("Seçili üyeler kopyalandı.");
      setSelectedIds(new Set()); 
    } catch (error) {
      console.error(error);
      alert("Kopyalama sırasında hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(`${selectedIds.size} üyenin verilerini güncellemek üzeresiniz. Emin misiniz?`)) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      // Create update object with only populated fields
      const updates: any = { updatedAt: Date.now() };
      
      if (bulkFormPower !== '') updates.power = parseFloat(bulkFormPower);
      if (bulkFormLevel !== '') updates.level = parseInt(bulkFormLevel);
      if (bulkFormTeam1Power !== '') updates.team1Power = parseFloat(bulkFormTeam1Power);
      if (bulkFormDuelScore !== '') {
          const cleanScore = bulkFormDuelScore.replace(/,/g, '');
          updates.duelScore = parseInt(cleanScore) || 0;
      }

      // Check if there's anything to update
      if (Object.keys(updates).length <= 1) { // 1 because updatedAt is always there
         alert("Güncellenecek veri girmediniz.");
         setLoading(false);
         return;
      }

      selectedIds.forEach(id => {
        const ref = doc(db, "alliance_members", id);
        batch.update(ref, updates);
      });

      await batch.commit();
      await refreshData();
      
      setIsBulkEditModalOpen(false);
      setBulkFormPower('');
      setBulkFormLevel('');
      setBulkFormTeam1Power('');
      setBulkFormDuelScore('');
      
      alert("Toplu güncelleme başarılı.");
    } catch (error) {
      console.error(error);
      alert("Güncelleme hatası.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetDailyScores = async () => {
    if (!confirm(`Şu anki tarihteki (${selectedDate}) TÜM üyelerin düello puanlarını 0 olarak sıfırlamak istiyor musunuz?`)) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      members.forEach(m => {
        const ref = doc(db, "alliance_members", m.id);
        batch.update(ref, { duelScore: 0 });
      });
      await batch.commit();
      await refreshData();
      alert("Düello puanları sıfırlandı.");
    } catch (error) {
      console.error(error);
      alert("Sıfırlama başarısız.");
    } finally {
      setLoading(false);
    }
  };

  const handleCleanDuplicates = async () => {
    if (!confirm(`Seçili tarihteki (${selectedDate}) mükerrer (aynı isimli) kayıtları temizlemek istiyor musunuz?`)) return;
    setLoading(true);
    try {
      const q = query(membersCollection, where("date", "==", selectedDate));
      const snapshot = await getDocs(q);
      const seenNames = new Set<string>();
      const idsToDelete: string[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as AllianceMember;
        const name = (data.name || "").trim().toLowerCase();
        if (seenNames.has(name)) {
          idsToDelete.push(doc.id);
        } else {
          seenNames.add(name);
        }
      });
      if (idsToDelete.length === 0) {
        alert("Mükerrer kayıt bulunamadı.");
        setLoading(false);
        return;
      }
      const batch = writeBatch(db);
      idsToDelete.forEach(id => {
        batch.delete(doc(db, "alliance_members", id));
      });
      await batch.commit();
      await refreshData();
      alert(`${idsToDelete.length} adet mükerrer kayıt silindi.`);
    } catch (error) {
      console.error(error);
      alert("Temizleme işlemi sırasında hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const powerVal = parseFloat(formPower);
    const team1PowerVal = parseFloat(formTeam1Power);
    const cleanDuelScore = formDuelScore.replace(/,/g, '');
    const duelScoreVal = parseInt(cleanDuelScore) || 0;
    
    const safeName = (formName || 'uye').replace(/\s+/g, '_');
    const memberId = editingMember ? editingMember.id : `${selectedDate}_${safeName}_${Date.now()}`;
    const newMember: AllianceMember = {
      id: memberId, date: selectedDate, name: formName, nameImage: formNameImage ?? null,
      power: powerVal, level: formLevel, rank: formRank, team1Power: team1PowerVal, 
      duelScore: duelScoreVal, updatedAt: Date.now()
    };
    try {
      await setDoc(doc(db, "alliance_members", memberId), newMember);
      await refreshData();
      closeModal();
    } catch (error) { alert("Kaydedilemedi."); }
  };

  const handleDeleteMember = async (id: string) => {
    if (!confirm("Emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, "alliance_members", id));
      setMembers(prev => prev.filter(m => m.id !== id));
      const newSet = new Set(selectedIds);
      newSet.delete(id);
      setSelectedIds(newSet);
      if (viewMode === 'duel_ranking' && duelSubMode === 'weekly') {
        await fetchWeeklyData();
      }
    } catch (error) { alert("Hata!"); }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        await setDoc(doc(db, "alliance_settings", "global_config"), { logo: base64 }, { merge: true });
        setConfig(prev => ({ ...prev, logo: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const openModal = (member?: AllianceMember) => {
    if (member) {
      setEditingMember(member); setFormName(member.name); setFormNameImage(member.nameImage ?? null);
      setFormPower(member.power.toString()); setFormLevel(member.level); setFormRank(member.rank);
      setFormTeam1Power(member.team1Power.toString()); 
      setFormDuelScore(member.duelScore ? member.duelScore.toLocaleString() : '');
    } else {
      setEditingMember(null); setFormName(''); setFormNameImage(null);
      setFormPower(''); setFormLevel(20); setFormRank(Rank.R1); setFormTeam1Power(''); setFormDuelScore('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingMember(null); };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setFormNameImage(base64);
        const base64Data = base64.split(',')[1];
        if (base64Data) {
          try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: { parts: [{ inlineData: { mimeType: file.type, data: base64Data } }, { text: "Extract name from game screenshot." }] }
            });
            const detectedName = response.text?.trim();
            if (detectedName) setFormName(detectedName);
          } catch (e) {}
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const groupedByRank = {
    [Rank.R3]: filteredMembers.filter(m => m.rank === Rank.R3),
    [Rank.R2]: filteredMembers.filter(m => m.rank === Rank.R2),
    [Rank.R1]: filteredMembers.filter(m => m.rank === Rank.R1),
  };

  const themeClasses = {
    bg: theme === 'dark' ? 'bg-[#0a0f1d] text-slate-100' : 'bg-slate-50 text-slate-900',
    header: theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200',
    card: theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm',
    input: theme === 'dark' ? 'bg-slate-800/40 border-slate-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-900',
    tableHeader: theme === 'dark' ? 'bg-slate-800/50 text-slate-400' : 'bg-slate-100 text-slate-500',
    tableRow: theme === 'dark' ? 'border-slate-800/50 hover:bg-slate-800/30' : 'border-slate-100 hover:bg-slate-50',
    modal: theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200',
  };

  return (
    <div className={`min-h-screen pb-20 transition-colors duration-300 ${themeClasses.bg} selection:bg-amber-500/30`}>
      <header className={`${themeClasses.header} backdrop-blur-md border-b sticky top-0 z-40 shadow-xl`}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div onClick={() => logoInputRef.current?.click()} className="group relative cursor-pointer bg-slate-800 p-0.5 rounded-full border border-amber-500/30 w-12 h-12 flex items-center justify-center transition-all hover:border-amber-400">
              <img src={config.logo || "https://cdn-icons-png.flaticon.com/512/864/864685.png"} className="w-9 h-9 object-contain" alt="Logo" />
              <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={handleLogoChange} />
            </div>
            <div>
              <h1 className={`text-lg font-black title-font leading-none ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{config.allianceName}</h1>
              <p className="text-[10px] font-bold text-amber-500 tracking-widest uppercase mt-1">Strateji Masası</p>
            </div>
          </div>

          <div className="flex-1 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input 
              type="text" placeholder="Oyuncu ara..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full ${themeClasses.input} border rounded-lg py-2 pl-9 pr-4 outline-none focus:border-amber-500/50 transition-all text-xs`}
            />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className={`p-2 rounded border ${theme === 'dark' ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'} transition-all`}>
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            
            {/* Conditional Date Pickers based on View Mode */}
            {viewMode === 'progress' || viewMode === 'duel_progress' ? (
              <div className="flex items-center gap-1 bg-slate-500/10 p-1 rounded border border-slate-500/20">
                <input type="date" value={progressStartDate} onChange={(e) => setProgressStartDate(e.target.value)} className={`${themeClasses.input} border rounded px-2 py-1 text-[10px] outline-none w-24`} />
                <span className="text-slate-500 text-[10px]">-</span>
                <input type="date" value={progressEndDate} onChange={(e) => setProgressEndDate(e.target.value)} className={`${themeClasses.input} border rounded px-2 py-1 text-[10px] outline-none w-24`} />
              </div>
            ) : (
              <>
                 <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={`${themeClasses.input} border rounded px-3 py-1.5 text-xs outline-none`} />
                 <button onClick={handleCopyYesterday} className={`${themeClasses.input} hover:bg-slate-200 p-2 rounded border text-slate-500`} title="Dünden kopyala"><Copy className="w-3.5 h-3.5" /></button>
                 <button onClick={handleCleanDuplicates} className={`${themeClasses.input} hover:bg-rose-100 hover:text-rose-600 p-2 rounded border text-slate-500 transition-colors`} title="Mükerrer Kayıtları Temizle"><FilterX className="w-3.5 h-3.5" /></button>
                 <button onClick={() => openModal()} className="bg-amber-500 hover:bg-amber-400 text-slate-900 px-4 py-2 rounded font-black flex items-center gap-2 shadow-lg text-xs transition-transform active:scale-95">
                   <Plus className="w-4 h-4" /><span>Üye Ekle</span>
                 </button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 py-6">
        {viewMode !== 'progress' && viewMode !== 'duel_progress' && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
            <StatMini icon={<Users className="w-4 h-4" />} label="Toplam" value={stats.totalMembers} color="blue" active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} theme={theme} />
            <StatMini icon={<AlertOctagon className="w-4 h-4" />} label="Kritik (< 1M)" value={criticalDuelCount} color="red" active={activeFilter === 'criticalDuelScore'} onClick={() => setActiveFilter('criticalDuelScore')} theme={theme} />
            <StatMini icon={<Target className="w-4 h-4" />} label="Düşük (< 2M)" value={lowDuelCount} color="orange" active={activeFilter === 'lowDuelScore'} onClick={() => setActiveFilter('lowDuelScore')} theme={theme} />
            <StatMini icon={<Zap className="w-4 h-4" />} label="Düşük Güç" value={stats.lowPowerCount} color="amber" active={activeFilter === 'lowPower'} onClick={() => setActiveFilter('lowPower')} theme={theme} />
            <StatMini icon={<Trophy className="w-4 h-4" />} label="Düşük Sv." value={stats.lowLevelCount} color="purple" active={activeFilter === 'lowLevel'} onClick={() => setActiveFilter('lowLevel')} theme={theme} />
            <StatMini icon={<AlertTriangle className="w-4 h-4" />} label="Riskli" value={stats.totalAtRisk} color="rose" active={activeFilter === 'atRisk'} onClick={() => setActiveFilter('atRisk')} theme={theme} />
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className={`flex items-center gap-2 ${theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-200/50 border-slate-300'} p-1 rounded-lg border w-fit flex-wrap`}>
            <button onClick={() => setViewMode('rank')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'rank' ? 'bg-amber-500 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-900'}`}><LayoutGrid className="w-3 h-3 inline mr-1" /> Rütbe</button>
            <button onClick={() => setViewMode('power_ranking')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'power_ranking' ? 'bg-amber-500 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-900'}`}><ListOrdered className="w-3 h-3 inline mr-1" /> Güç</button>
            <button onClick={() => setViewMode('duel_ranking')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'duel_ranking' ? 'bg-amber-500 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-900'}`}><Swords className="w-3 h-3 inline mr-1" /> Düello</button>
            <button onClick={() => setViewMode('progress')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'progress' ? 'bg-amber-500 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-900'}`}><LineChart className="w-3 h-3 inline mr-1" /> Gelişim</button>
            <button onClick={() => setViewMode('duel_progress')} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'duel_progress' ? 'bg-amber-500 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-900'}`}><BarChart2 className="w-3 h-3 inline mr-1" /> VS Gelişim</button>
          </div>

          {viewMode === 'duel_ranking' && (
             <div className="flex items-center gap-2">
               <button onClick={handleResetDailyScores} className="px-3 py-1.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 text-[10px] font-black uppercase tracking-tight flex items-center gap-1 transition-all" title="Seçili gündeki tüm üyelerin düello puanlarını 0 yapar.">
                  <RotateCcw className="w-3 h-3" /> Günü Sıfırla
               </button>
               <div className={`flex items-center gap-1 ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-100'} p-1 rounded-md border border-slate-700/30`}>
                  <button onClick={() => setDuelSubMode('daily')} className={`px-3 py-1 rounded text-[9px] font-black uppercase tracking-tighter transition-all ${duelSubMode === 'daily' ? 'bg-slate-900 text-amber-500 shadow-sm' : 'text-slate-500'}`}>Günlük</button>
                  <button onClick={() => setDuelSubMode('weekly')} className={`px-3 py-1 rounded text-[9px] font-black uppercase tracking-tighter transition-all ${duelSubMode === 'weekly' ? 'bg-slate-900 text-amber-500 shadow-sm' : 'text-slate-500'}`}>Haftalık</button>
               </div>
             </div>
          )}
        </div>

        {viewMode === 'duel_ranking' && duelSubMode === 'weekly' && weeklyDateRange && (
          <div className="mb-4 flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-500/10 px-3 py-2 rounded-lg border border-slate-500/20">
             <Info className="w-4 h-4" />
             <span>Hesaplanan Aralık: <span className="text-amber-500">{weeklyDateRange.start} (Pazartesi)</span> - <span className="text-amber-500">{weeklyDateRange.end} (Seçili Gün)</span></span>
          </div>
        )}

        <div className={`${themeClasses.card} border rounded-xl overflow-hidden shadow-2xl transition-all relative`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className={`${themeClasses.tableHeader} border-b border-slate-700/50 text-[10px] font-black uppercase tracking-widest`}>
                  {viewMode === 'progress' || viewMode === 'duel_progress' ? (
                     <>
                      <th className="px-4 py-3 sticky left-0 z-10 bg-inherit border-r border-slate-700/30 w-8">
                         <button onClick={toggleSelectAll} className="text-amber-500 hover:text-amber-400">
                           {selectedIds.size > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                         </button>
                      </th>
                      <th className="px-4 py-3 sticky left-8 z-10 bg-inherit border-r border-slate-700/30 w-48">Üye</th>
                      {progressDateList.map(date => (
                        <th key={date} className="px-3 py-3 text-center min-w-[80px]">
                          {new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'numeric' })}
                        </th>
                      ))}
                      <th className="px-4 py-3 sticky right-0 z-10 bg-inherit border-l border-slate-700/30 text-center">
                        {viewMode === 'duel_progress' ? 'Toplam Puan' : 'Değişim'}
                      </th>
                     </>
                  ) : (
                    <>
                      <th className="px-4 py-3 w-8">
                        {viewMode !== 'duel_ranking' || duelSubMode === 'daily' ? (
                            <button onClick={toggleSelectAll} className="text-amber-500 hover:text-amber-400">
                              {selectedIds.size > 0 && selectedIds.size === filteredMembers.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </button>
                        ) : null}
                      </th>
                      <th className="px-4 py-3 w-16">Sıra</th>
                      <th className="px-4 py-3">Üye Bilgisi</th>
                      {viewMode !== 'duel_ranking' ? (
                        <>
                          <th className="px-4 py-3">Seviye</th>
                          <th className="px-4 py-3">Toplam Güç</th>
                          <th className="px-4 py-3">Takım 1</th>
                        </>
                      ) : (
                        <>
                          {duelSubMode === 'daily' ? (
                            <th className="px-4 py-3">Günlük Puan</th>
                          ) : (
                            <>
                              <th className="px-4 py-3">Dün</th>
                              <th className="px-4 py-3">Haftalık Toplam</th>
                            </>
                          )}
                          {duelSubMode === 'daily' ? (
                            <th className="px-4 py-3">Haftalık Toplam</th>
                          ) : null}
                          <th className="px-4 py-3">İstikrar</th>
                        </>
                      )}
                      <th className="px-4 py-3">Rütbe</th>
                      <th className="px-4 py-3 text-right">İşlemler</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {viewMode === 'progress' || viewMode === 'duel_progress' ? (
                   progressLoading ? (
                      <tr><td colSpan={progressDateList.length + 3} className="p-20 text-center"><div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-4"></div><p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Gelişim Verileri Analiz Ediliyor...</p></td></tr>
                   ) : (
                      filteredProgressData.map((item, idx) => (
                        viewMode === 'duel_progress' ? (
                            <DuelProgressRow
                                key={item.id}
                                item={item}
                                dates={progressDateList}
                                theme={theme}
                                selected={selectedIds.has(item.id)}
                                onToggleSelect={() => toggleSelection(item.id)}
                            />
                        ) : (
                            <ProgressRow 
                                key={item.id} 
                                item={item} 
                                dates={progressDateList} 
                                theme={theme} 
                                selected={selectedIds.has(item.id)}
                                onToggleSelect={() => toggleSelection(item.id)}
                            />
                        )
                      ))
                   )
                ) : (
                  viewMode === 'power_ranking' ? (
                    filteredMembers.map((m, idx) => (
                      <MemberRow 
                        key={m.id} member={m} rankIdx={idx + 1} theme={theme} onEdit={() => openModal(m)} onDelete={() => handleDeleteMember(m.id)} viewMode={viewMode}
                        selected={selectedIds.has(m.id)} onToggleSelect={() => toggleSelection(m.id)}
                      />
                    ))
                  ) : viewMode === 'duel_ranking' ? (
                    duelSubMode === 'daily' ? (
                      filteredMembers.map((m, idx) => (
                        <MemberRow 
                          key={m.id} member={m} rankIdx={idx + 1} theme={theme} onEdit={() => openModal(m)} onDelete={() => handleDeleteMember(m.id)} viewMode={viewMode}
                          selected={selectedIds.has(m.id)} onToggleSelect={() => toggleSelection(m.id)}
                        />
                      ))
                    ) : (
                      weeklyLoading ? (
                        <tr><td colSpan={8} className="p-20 text-center"><div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-4"></div><p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Haftalık Veriler Toplanıyor...</p></td></tr>
                      ) : (
                        weeklyData.map((w, idx) => (
                          <WeeklyRow key={w.name} data={w} rankIdx={idx + 1} theme={theme} />
                        ))
                      )
                    )
                  ) : (
                    ([Rank.R3, Rank.R2, Rank.R1] as Rank[]).map(rank => (
                      <React.Fragment key={rank}>
                        {groupedByRank[rank].length > 0 && (
                          <tr onClick={() => toggleRankGroup(rank)} className={`cursor-pointer transition-colors ${theme === 'dark' ? 'bg-slate-950/40 hover:bg-slate-900/60' : 'bg-slate-100/50 hover:bg-slate-200/50'}`}>
                            <td className="px-4 py-3 border-y border-slate-700/30"></td>
                            <td colSpan={7} className="px-4 py-3 border-y border-slate-700/30">
                              <div className="flex items-center gap-2">
                                {expandedRanks[rank] ? <ChevronDown className="w-3 h-3 text-amber-500" /> : <ChevronRight className="w-3 h-3 text-amber-500" />}
                                <span className="text-[9px] font-black text-amber-500/80 uppercase tracking-[0.2em]">Rütbe {rank} Grubu ({groupedByRank[rank].length})</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {expandedRanks[rank] && groupedByRank[rank].map((m, idx) => (
                          <MemberRow 
                            key={m.id} member={m} theme={theme} onEdit={() => openModal(m)} onDelete={() => handleDeleteMember(m.id)} viewMode={viewMode}
                            selected={selectedIds.has(m.id)} onToggleSelect={() => toggleSelection(m.id)}
                          />
                        ))}
                      </React.Fragment>
                    ))
                  )
                )}
                {!loading && filteredMembers.length === 0 && !weeklyLoading && !progressLoading && (
                  <tr><td colSpan={8} className="p-12 text-center text-slate-500 font-bold italic">Kayıt bulunamadı.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      
      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom duration-300">
          <div className="max-w-4xl mx-auto bg-amber-500 rounded-xl shadow-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-4">
             <div className="flex items-center gap-3 w-full sm:w-auto">
               <div className="bg-slate-900 text-white font-black text-xs px-3 py-1.5 rounded-lg shadow-sm whitespace-nowrap">
                 {selectedIds.size} Üye Seçildi
               </div>
               <button 
                  onClick={() => setIsBulkEditModalOpen(true)}
                  className="bg-white hover:bg-slate-100 text-slate-900 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-md active:scale-95"
               >
                 <Settings2 className="w-4 h-4" /> Seçilenleri Düzenle
               </button>
             </div>

             <div className="flex items-center gap-2 w-full sm:w-auto border-t sm:border-t-0 border-slate-900/10 pt-2 sm:pt-0">
               <span className="text-slate-900 text-[10px] font-bold uppercase hidden sm:block">Kopyalama:</span>
               <input 
                 type="date" 
                 value={copyTargetDate} 
                 onChange={(e) => setCopyTargetDate(e.target.value)} 
                 className="bg-white/90 text-slate-900 border-0 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 ring-slate-900/20 flex-1"
               />
               <button 
                 onClick={handleBulkCopy}
                 className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg active:scale-95 whitespace-nowrap"
               >
                 <ArrowRightCircle className="w-4 h-4" /> Kopyala
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Main Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className={`${themeClasses.modal} border rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in duration-200`}>
            <div className={`p-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'} flex justify-between items-center`}>
              <h3 className={`text-sm font-black uppercase tracking-wider ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{editingMember ? 'Düzenle' : 'Yeni Üye'}</h3>
              <button onClick={closeModal} className="text-slate-500 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSaveMember} className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">İsim</label>
                <div className="flex items-center gap-2">
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className={`flex-1 ${themeClasses.input} border rounded p-2 text-xs outline-none focus:border-amber-500`} />
                  <label className="cursor-pointer bg-slate-800 p-2 rounded border border-slate-700 hover:border-amber-500 transition-colors" title="Ekran görüntüsünden isim tara">
                    <Camera className="w-4 h-4 text-slate-400" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniInput label="Toplam Güç (M)" value={formPower} onChange={setFormPower} theme={theme} />
                <div>
                   <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Düello Puanı</label>
                   <input 
                     type="text" 
                     value={formDuelScore} 
                     onChange={(e) => setFormDuelScore(e.target.value)} 
                     className={`w-full ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-900'} border rounded p-2 text-xs outline-none focus:border-amber-500 transition-all font-mono`}
                     placeholder="12,155,328"
                   />
                   <p className="text-[9px] text-slate-500 mt-1 italic">Virgüllü sayı yapıştırabilirsiniz.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniInput label="Takım 1 (M)" value={formTeam1Power} onChange={setFormTeam1Power} theme={theme} />
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Seviye</label>
                  <select value={formLevel} onChange={(e) => setFormLevel(parseInt(e.target.value))} className={`w-full ${themeClasses.input} border rounded p-2 text-xs outline-none`}>
                    {Array.from({length: 17}, (_, i) => i + 14).map(l => <option key={l} value={l}>Sv.{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Rütbe</label>
                <select value={formRank} onChange={(e) => setFormRank(e.target.value as Rank)} className={`w-full ${themeClasses.input} border rounded p-2 text-xs outline-none`}>
                  <option value={Rank.R3}>R3</option><option value={Rank.R2}>R2</option><option value={Rank.R1}>R1</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-amber-500 text-slate-900 font-black py-3 rounded-lg text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">Kaydet</button>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {isBulkEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className={`${themeClasses.modal} border rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in duration-200`}>
             <div className={`p-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'} flex justify-between items-center bg-amber-500/10`}>
              <div className="flex items-center gap-2">
                 <Settings2 className="w-5 h-5 text-amber-500" />
                 <h3 className={`text-sm font-black uppercase tracking-wider ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Toplu Düzenle ({selectedIds.size})</h3>
              </div>
              <button onClick={() => setIsBulkEditModalOpen(false)} className="text-slate-500 hover:text-white">✕</button>
            </div>
            <div className="p-4 bg-amber-500/5 text-xs text-slate-500 font-bold border-b border-amber-500/10">
               ⚠️ Sadece doldurduğunuz alanlar güncellenecektir. Boş bıraktığınız alanlar eski değerinde kalır.
            </div>
            <form onSubmit={handleBulkUpdate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MiniInput label="Yeni Güç (M)" value={bulkFormPower} onChange={setBulkFormPower} theme={theme} />
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Yeni Seviye</label>
                  <select value={bulkFormLevel} onChange={(e) => setBulkFormLevel(e.target.value)} className={`w-full ${themeClasses.input} border rounded p-2 text-xs outline-none`}>
                    <option value="">Değiştirme</option>
                    {Array.from({length: 17}, (_, i) => i + 14).map(l => <option key={l} value={l}>Sv.{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniInput label="Takım 1 (M)" value={bulkFormTeam1Power} onChange={setBulkFormTeam1Power} theme={theme} />
                <div>
                   <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Düello Puanı</label>
                   <input 
                     type="text" 
                     value={bulkFormDuelScore} 
                     onChange={(e) => setBulkFormDuelScore(e.target.value)} 
                     className={`w-full ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-900'} border rounded p-2 text-xs outline-none focus:border-amber-500 transition-all font-mono`}
                     placeholder="Değiştirme"
                   />
                </div>
              </div>
              <button type="submit" className="w-full bg-amber-500 text-slate-900 font-black py-3 rounded-lg text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                {selectedIds.size} Üyeyi Güncelle
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

const ProgressRow: React.FC<{ item: ProgressData; dates: string[]; theme: string; selected: boolean; onToggleSelect: () => void }> = ({ item, dates, theme, selected, onToggleSelect }) => {
  return (
    <tr className={`border-b transition-colors group ${theme === 'dark' ? 'border-slate-800/50 hover:bg-slate-800/30' : 'border-slate-100 hover:bg-slate-50'}`}>
       <td className={`px-4 py-3 sticky left-0 z-10 border-r border-slate-700/30 w-8 ${theme === 'dark' ? 'bg-[#0b1221]' : 'bg-white'}`}>
          <button onClick={onToggleSelect} className="text-slate-500 hover:text-amber-500 transition-colors">
            {selected ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <Square className="w-4 h-4" />}
          </button>
       </td>
       <td className={`px-4 py-3 sticky left-8 z-10 border-r border-slate-700/30 w-48 ${theme === 'dark' ? 'bg-[#0b1221]' : 'bg-white'}`}>
         <div className="flex flex-col">
           <span className={`text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{item.name}</span>
           <span className={`text-[9px] font-black uppercase w-fit px-1 rounded mt-1 ${item.rank === Rank.R3 ? 'bg-rose-500/10 text-rose-500' : item.rank === Rank.R2 ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-400'}`}>{item.rank}</span>
         </div>
       </td>
       {dates.map((date, index) => {
         const data = item.dataPoints[date];
         let prevData = null;
         if (index > 0) {
            const prevDate = dates[index - 1];
            prevData = item.dataPoints[prevDate];
         }

         // Determining Power Color
         let powerClass = 'text-slate-400';
         if (data) {
             if (data.power < 10) {
                 powerClass = 'text-rose-600 font-black'; // Critical Power < 10M
             } else if (prevData) {
                 if (data.power > prevData.power) powerClass = 'text-emerald-500';
                 else if (data.power < prevData.power) powerClass = 'text-rose-500';
             }
         }

         // Determining Level Color
         const levelClass = (data && data.level < 20) ? 'text-rose-600 font-bold' : 'text-slate-500';

         return (
           <td key={date} className="px-3 py-3 text-center border-r border-slate-700/10">
             {data ? (
               <div className="flex flex-col items-center">
                 <span className={`text-xs font-black ${powerClass}`}>{data.power.toFixed(1)}M</span>
                 <span className={`text-[9px] ${levelClass}`}>Sv.{data.level}</span>
               </div>
             ) : (
               <span className="text-slate-700">-</span>
             )}
           </td>
         );
       })}
       <td className={`px-4 py-3 sticky right-0 z-10 border-l border-slate-700/30 text-center ${theme === 'dark' ? 'bg-[#0b1221]' : 'bg-white'}`}>
         <div className={`flex items-center justify-center gap-1 font-black text-xs ${item.totalGrowth > 0 ? 'text-emerald-500' : item.totalGrowth < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
            {item.totalGrowth > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : item.totalGrowth < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3 h-3" />}
            <span>{Math.abs(item.totalGrowth).toFixed(1)}M</span>
         </div>
       </td>
    </tr>
  );
};

const DuelProgressRow: React.FC<{ item: ProgressData; dates: string[]; theme: string; selected: boolean; onToggleSelect: () => void }> = ({ item, dates, theme, selected, onToggleSelect }) => {
    return (
      <tr className={`border-b transition-colors group ${theme === 'dark' ? 'border-slate-800/50 hover:bg-slate-800/30' : 'border-slate-100 hover:bg-slate-50'}`}>
         <td className={`px-4 py-3 sticky left-0 z-10 border-r border-slate-700/30 w-8 ${theme === 'dark' ? 'bg-[#0b1221]' : 'bg-white'}`}>
            <button onClick={onToggleSelect} className="text-slate-500 hover:text-amber-500 transition-colors">
              {selected ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <Square className="w-4 h-4" />}
            </button>
         </td>
         <td className={`px-4 py-3 sticky left-8 z-10 border-r border-slate-700/30 w-48 ${theme === 'dark' ? 'bg-[#0b1221]' : 'bg-white'}`}>
           <div className="flex flex-col">
             <span className={`text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{item.name}</span>
             <span className={`text-[9px] font-black uppercase w-fit px-1 rounded mt-1 ${item.rank === Rank.R3 ? 'bg-rose-500/10 text-rose-500' : item.rank === Rank.R2 ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-400'}`}>{item.rank}</span>
           </div>
         </td>
         {dates.map((date) => {
           const data = item.dataPoints[date];
           const score = data?.duelScore || 0;
           
           let scoreClass = 'text-slate-300';
           if (score === 0) scoreClass = 'text-slate-600';
           else if (score < 1000000) scoreClass = 'text-orange-500 font-bold';
           else if (score > 7200000) scoreClass = 'text-emerald-400 font-black';
           else scoreClass = 'text-amber-500';
  
           return (
             <td key={date} className="px-3 py-3 text-center border-r border-slate-700/10">
                <span className={`text-xs font-mono tracking-tight ${scoreClass}`}>
                    {score > 0 ? (score / 1000000).toFixed(2) + 'M' : '-'}
                </span>
             </td>
           );
         })}
         <td className={`px-4 py-3 sticky right-0 z-10 border-l border-slate-700/30 text-center ${theme === 'dark' ? 'bg-[#0b1221]' : 'bg-white'}`}>
           <div className="flex flex-col items-center justify-center">
              <span className="text-xs font-black text-amber-500 font-mono">
                {(item.totalDuelScore / 1000000).toFixed(1)}M
              </span>
              <div className="w-12 h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (item.totalDuelScore / (dates.length * 7200000)) * 100)}%` }}></div>
              </div>
           </div>
         </td>
      </tr>
    );
};

const StatMini = ({ icon, label, value, color, active, onClick, theme }: any) => {
  const colors: any = {
    blue: active ? 'bg-blue-500 text-white' : 'border-blue-500/20 text-blue-400',
    amber: active ? 'bg-amber-500 text-slate-900' : 'border-amber-500/20 text-amber-400',
    purple: active ? 'bg-purple-500 text-white' : 'border-purple-500/20 text-purple-400',
    rose: active ? 'bg-rose-500 text-white' : 'border-rose-500/20 text-rose-400',
    orange: active ? 'bg-orange-500 text-white' : 'border-orange-500/20 text-orange-400',
    red: active ? 'bg-red-600 text-white' : 'border-red-600/20 text-red-500'
  };
  return (
    <button onClick={onClick} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${active ? colors[color] : (theme === 'dark' ? 'bg-slate-900/40 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm')}`}>
      <div className={`p-1.5 rounded-lg ${theme === 'dark' ? 'bg-slate-950/50' : 'bg-slate-100'} ${active ? 'text-inherit' : colors[color]}`}>{icon}</div>
      <div className="text-left"><p className="text-[9px] font-black uppercase opacity-60 leading-none mb-1">{label}</p><p className="text-lg font-black leading-none">{value}</p></div>
    </button>
  );
};

const MemberRow = ({ member, rankIdx, theme, onEdit, onDelete, viewMode, selected, onToggleSelect }: any) => {
  const isAtRisk = member.power < 10 || member.level < 20 || member.team1Power < 3;
  const isLowDuel = (member.duelScore || 0) < 2000000;
  const isCriticalDuel = (member.duelScore || 0) < 1000000;
  const isDuelMode = viewMode === 'duel_ranking';
  
  return (
    <tr className={`border-b transition-colors group ${theme === 'dark' ? 'border-slate-800/50 hover:bg-slate-800/30' : 'border-slate-100 hover:bg-slate-50'} ${isAtRisk && !isDuelMode ? (theme === 'dark' ? 'bg-rose-500/[0.02]' : 'bg-rose-500/[0.05]') : ''}`}>
      <td className="px-4 py-2">
         {onToggleSelect && (
          <button onClick={onToggleSelect} className="text-slate-500 hover:text-amber-500 transition-colors">
            {selected ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <Square className="w-4 h-4" />}
          </button>
         )}
      </td>
      <td className="px-4 py-2 text-xs font-black font-mono">
        <div className="flex items-center gap-1">
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-black shadow-sm ${rankIdx === 1 ? 'bg-amber-500 text-slate-900 shadow-amber-500/30 animate-pulse' : rankIdx === 2 ? 'bg-slate-300 text-slate-900' : rankIdx === 3 ? 'bg-amber-800/80 text-white' : (theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600')}`}>
            {rankIdx || <ChevronRight className="w-3 h-3 opacity-20" />}
          </span>
        </div>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {member.nameImage ? <img src={member.nameImage} className="h-6 w-16 object-contain rounded bg-slate-950 p-0.5" /> : <span className={`text-xs font-bold transition-colors ${theme === 'dark' ? 'text-white group-hover:text-amber-400' : 'text-slate-900 group-hover:text-amber-600'}`}>{member.name}</span>}
          {isAtRisk && !isDuelMode && <AlertTriangle className="w-3 h-3 text-rose-500" />}
          {isCriticalDuel && isDuelMode && <AlertOctagon className="w-3 h-3 text-red-500" />}
          {isLowDuel && !isCriticalDuel && isDuelMode && <AlertTriangle className="w-3 h-3 text-orange-500" />}
        </div>
      </td>
      {!isDuelMode ? (
        <>
          <td className="px-4 py-2"><span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${member.level < 20 ? 'text-rose-500 border-rose-500/20' : 'text-green-500 border-green-500/20'}`}>Sv.{member.level}</span></td>
          <td className="px-4 py-2"><div className="flex items-center gap-1.5"><span className={`text-xs font-black ${member.power < 10 ? 'text-rose-400' : 'text-amber-400'}`}>{member.power.toFixed(1)}M</span></div></td>
          <td className="px-4 py-2"><span className={`text-xs font-black ${member.team1Power < 3 ? 'text-rose-400' : 'text-blue-400'}`}>{member.team1Power.toFixed(1)}M</span></td>
        </>
      ) : (
        <>
          <td className="px-4 py-2">
            <span className={`text-sm font-black font-mono tracking-tight ${isCriticalDuel ? 'text-red-500' : isLowDuel ? 'text-orange-500' : 'text-amber-500'}`}>
              {(member.duelScore || 0).toLocaleString()}
            </span>
          </td>
          {/* Daily mode column is empty here as we moved 'Weekly Total' to weekly submode, or we can leave it empty */}
          <td className="px-4 py-2"><span className="text-[10px] font-bold text-slate-500 italic">Puan Girişi Gerekli</span></td>
          <td className="px-4 py-2"><div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full ${isCriticalDuel ? 'bg-red-500' : isLowDuel ? 'bg-orange-500' : 'bg-amber-500'}`} style={{width: `${Math.min(100, ((member.duelScore || 0) / 7200000) * 100)}%`}}></div></div></td>
        </>
      )}
      <td className="px-4 py-2"><span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${member.rank === Rank.R3 ? 'bg-rose-500/10 text-rose-500' : member.rank === Rank.R2 ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-400'}`}>{member.rank}</span></td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1.5 hover:bg-amber-500/10 rounded text-slate-400 hover:text-amber-500 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="p-1.5 hover:bg-rose-500/10 rounded text-slate-400 hover:text-rose-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    </tr>
  );
};

const WeeklyRow = ({ data, rankIdx, theme }: any) => {
  const isLowYesterday = data.yesterdayScore < 2000000;
  const isCriticalYesterday = data.yesterdayScore < 1000000;

  return (
    <tr className={`border-b transition-colors group ${theme === 'dark' ? 'border-slate-800/50 hover:bg-slate-800/30' : 'border-slate-100 hover:bg-slate-50'}`}>
      <td className="px-4 py-3"></td>
      <td className="px-4 py-3">
        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-black shadow-lg ${rankIdx === 1 ? 'bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 rotate-12' : rankIdx === 2 ? 'bg-slate-300 text-slate-900' : rankIdx === 3 ? 'bg-amber-800 text-white' : 'bg-slate-800 text-slate-500'}`}>
          {rankIdx}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className={`text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{data.name}</span>
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{data.daysCount} Günlük Veri</span>
        </div>
      </td>
      <td className="px-4 py-3"><span className="text-[10px] font-black text-slate-400">Sv.{data.level}</span></td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
           <span className={`text-xs font-black font-mono ${isCriticalYesterday ? 'text-red-500' : isLowYesterday ? 'text-orange-500' : 'text-slate-300'}`}>
             {data.yesterdayScore > 0 ? data.yesterdayScore.toLocaleString() : '-'}
           </span>
           {isCriticalYesterday && data.yesterdayScore > 0 && <AlertOctagon className="w-3 h-3 text-red-500" />}
           {isLowYesterday && !isCriticalYesterday && data.yesterdayScore > 0 && <AlertTriangle className="w-3 h-3 text-orange-500" />}
           {data.yesterdayScore === 0 && <History className="w-3 h-3 text-slate-600" />}
        </div>
      </td>
      <td className="px-4 py-3"><span className="text-sm font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded font-mono tracking-tight">{data.totalScore.toLocaleString()}</span></td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
            {Array.from({length: 7}).map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i < data.daysCount ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
            ))}
        </div>
      </td>
      <td className="px-4 py-3"><span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${data.rank === Rank.R3 ? 'bg-rose-500/10 text-rose-500' : data.rank === Rank.R2 ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-400'}`}>{data.rank}</span></td>
      <td className="px-4 py-3 text-right">
        {rankIdx === 1 && <Trophy className="w-4 h-4 text-amber-500 inline" />}
      </td>
    </tr>
  );
};

const MiniInput = ({ label, value, onChange, theme }: any) => (
  <div className="flex-1">
    <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">{label}</label>
    <input 
      type="number" step="0.1" value={value} onChange={(e) => onChange(e.target.value)} 
      className={`w-full ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-900'} border rounded p-2 text-xs outline-none focus:border-amber-500 transition-all`} 
      placeholder="0.0" 
    />
  </div>
);

export default App;

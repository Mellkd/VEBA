
import React, { useState, useEffect, useMemo, useRef } from 'react';
// Fix: Use standard firestore modular SDK to resolve "no exported member" errors.
import { 
  getDocs, 
  query, 
  where, 
  setDoc, 
  doc, 
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, membersCollection } from './firebase';
import { AllianceMember, Rank, AllianceStats, AllianceConfig } from './types';
import { 
  Users, 
  Plus, 
  Calendar, 
  Copy, 
  Trash2, 
  AlertTriangle, 
  Zap, 
  Trophy,
  Camera,
  Search,
  FilterX,
  Edit2,
  Settings,
  Image as ImageIcon
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

type FilterType = 'all' | 'lowPower' | 'lowLevel' | 'atRisk';

const App: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [members, setMembers] = useState<AllianceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<AllianceMember | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  
  // Alliance Config (Logo vb.)
  const [config, setConfig] = useState<AllianceConfig>({
    logo: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/ultra-ball.png",
    allianceName: "[VEBA] ATAMBİR"
  });
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formNameImage, setFormNameImage] = useState<string | null>(null);
  const [formPower, setFormPower] = useState('');
  const [formLevel, setFormLevel] = useState(20);
  const [formRank, setFormRank] = useState<Rank>(Rank.R1);
  const [formTeam1Power, setFormTeam1Power] = useState('');

  // Fetch Alliance Config (Global Logo)
  const fetchConfig = async () => {
    try {
      const configDoc = await getDoc(doc(db, "alliance_settings", "global_config"));
      if (configDoc.exists()) {
        const data = configDoc.data() as AllianceConfig;
        if (data.logo) setConfig(prev => ({ ...prev, logo: data.logo }));
      }
    } catch (error) {
      console.error("Config load error:", error);
    }
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

  useEffect(() => {
    fetchConfig();
    fetchMembers(selectedDate);
    setActiveFilter('all'); 
  }, [selectedDate]);

  const stats = useMemo<AllianceStats>(() => {
    const lowPower = members.filter(m => m.power < 10).length;
    const lowLevel = members.filter(m => m.level < 20).length;
    const atRisk = members.filter(m => m.power < 10 || m.level < 20 || m.team1Power < 3).length;
    return {
      totalMembers: members.length,
      lowPowerCount: lowPower,
      lowLevelCount: lowLevel,
      totalAtRisk: atRisk
    };
  }, [members]);

  const filteredMembers = useMemo(() => {
    switch (activeFilter) {
      case 'lowPower':
        return members.filter(m => m.power < 10);
      case 'lowLevel':
        return members.filter(m => m.level < 20);
      case 'atRisk':
        return members.filter(m => m.power < 10 || m.level < 20 || m.team1Power < 3);
      default:
        return members;
    }
  }, [members, activeFilter]);

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
        const newMember: AllianceMember = {
          ...data,
          id: newId,
          date: selectedDate,
          updatedAt: Date.now()
        };
        return setDoc(doc(db, "alliance_members", newId), newMember);
      });

      await Promise.all(batchPromises);
      await fetchMembers(selectedDate);
      alert("Dünkü veriler başarıyla bugüne aktarıldı.");
    } catch (error) {
      console.error("Error copying data:", error);
      alert("Veriler kopyalanamadı.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!formName && !formNameImage) || !formPower || !formTeam1Power) {
      alert("Lütfen zorunlu alanları doldurun.");
      return;
    }

    const powerVal = parseFloat(formPower);
    const team1PowerVal = parseFloat(formTeam1Power);

    if (isNaN(powerVal) || isNaN(team1PowerVal)) {
      alert("Lütfen geçerli sayısal değerler girin.");
      return;
    }

    const safeName = (formName || 'uye').replace(/\s+/g, '_');
    const memberId = editingMember ? editingMember.id : `${selectedDate}_${safeName}_${Date.now()}`;
    const newMember: AllianceMember = {
      id: memberId,
      date: selectedDate,
      name: formName,
      nameImage: formNameImage ?? null,
      power: powerVal,
      level: formLevel,
      rank: formRank,
      team1Power: team1PowerVal,
      updatedAt: Date.now()
    };

    try {
      await setDoc(doc(db, "alliance_members", memberId), newMember);
      await fetchMembers(selectedDate);
      closeModal();
    } catch (error) {
      console.error("Error saving:", error);
      alert("Kaydedilemedi.");
    }
  };

  const handleDeleteMember = async (id: string) => {
    if (!confirm("Bu üyeyi silmek istediğinize emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, "alliance_members", id));
      setMembers(prev => prev.filter(m => m.id !== id));
    } catch (error) {
      console.error("Delete error:", error);
      alert("Silme işlemi başarısız oldu.");
    }
  };

  // Logo Change Logic
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          await setDoc(doc(db, "alliance_settings", "global_config"), {
            logo: base64
          }, { merge: true });
          setConfig(prev => ({ ...prev, logo: base64 }));
          alert("Logo başarıyla güncellendi.");
        } catch (error) {
          alert("Logo kaydedilemedi.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const openModal = (member?: AllianceMember) => {
    if (member) {
      setEditingMember(member);
      setFormName(member.name);
      setFormNameImage(member.nameImage ?? null);
      setFormPower(member.power.toString());
      setFormLevel(member.level);
      setFormRank(member.rank);
      setFormTeam1Power(member.team1Power.toString());
    } else {
      setEditingMember(null);
      setFormName('');
      setFormNameImage(null);
      setFormPower('');
      setFormLevel(20);
      setFormRank(Rank.R1);
      setFormTeam1Power('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMember(null);
  };

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
            // Fix: Initialize GoogleGenAI right before use to ensure correct API key access.
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: {
                parts: [
                  { inlineData: { mimeType: file.type, data: base64Data } },
                  { text: "Extract ONLY the player name from this game screenshot. Return just the name string." }
                ]
              }
            });
            // Fix: Access .text property directly, it is not a method.
            const detectedName = response.text?.trim();
            if (detectedName) setFormName(detectedName);
          } catch (e) {}
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const groupedMembers = {
    [Rank.R3]: filteredMembers.filter(m => m.rank === Rank.R3),
    [Rank.R2]: filteredMembers.filter(m => m.rank === Rank.R2),
    [Rank.R1]: filteredMembers.filter(m => m.rank === Rank.R1),
  };

  const isHighlighted = (member: AllianceMember) => {
    return member.power < 10 || member.level < 20 || member.team1Power < 3;
  };

  return (
    <div className="min-h-screen pb-20 bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Logo Container - Click to Change */}
            <div 
              onClick={() => logoInputRef.current?.click()}
              className="group relative cursor-pointer bg-slate-800 p-0.5 rounded-full shadow-lg border-2 border-amber-500/50 overflow-hidden w-16 h-16 flex items-center justify-center transition-all hover:border-amber-400"
              title="Logoyu Değiştirmek İçin Tıkla"
            >
              <img 
                src={config.logo || "https://cdn-icons-png.flaticon.com/512/864/864685.png"} 
                className="w-12 h-12 object-contain transition-transform group-hover:scale-110" 
                alt="Alliance Logo" 
              />
              <div className="absolute inset-0 bg-amber-500/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <ImageIcon className="w-6 h-6 text-white" />
              </div>
              <input 
                type="file" 
                ref={logoInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleLogoChange} 
              />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white title-font">{config.allianceName}</h1>
              <p className="text-xs font-bold text-amber-500 tracking-widest uppercase">Üye Yönetim Paneli</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 pl-10 outline-none" />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <button onClick={handleCopyYesterday} className="bg-slate-800 hover:bg-slate-700 text-white p-2.5 rounded-lg border border-slate-700 flex items-center gap-2 transition-colors">
              <Copy className="w-4 h-4" /><span className="hidden sm:inline text-sm font-semibold">Dünkü Veriler</span>
            </button>
            <button onClick={() => openModal()} className="bg-amber-500 hover:bg-amber-400 text-slate-900 px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-lg transition-all active:scale-95">
              <Plus className="w-5 h-5" /><span className="hidden sm:inline">Üye Ekle</span>
            </button>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<Users className="w-6 h-6" />} label="Toplam Üye" value={stats.totalMembers} color="blue" onClick={() => setActiveFilter('all')} active={activeFilter === 'all'} />
          <StatCard icon={<Zap className="w-6 h-6" />} label="Düşük Güç (< 10M)" value={stats.lowPowerCount} color="amber" onClick={() => setActiveFilter('lowPower')} active={activeFilter === 'lowPower'} />
          <StatCard icon={<Trophy className="w-6 h-6" />} label="Düşük Sv. (< Sv.20)" value={stats.lowLevelCount} color="purple" onClick={() => setActiveFilter('lowLevel')} active={activeFilter === 'lowLevel'} />
          <StatCard icon={<AlertTriangle className="w-6 h-6" />} label="Kritik Durum" value={stats.totalAtRisk} color="rose" onClick={() => setActiveFilter('atRisk')} active={activeFilter === 'atRisk'} />
        </div>

        {activeFilter !== 'all' && (
          <div className="mb-6 flex items-center justify-between bg-slate-900/50 border border-slate-800 px-4 py-2 rounded-lg">
            <span className="text-sm text-slate-400">Filtre: <span className="text-white ml-1 font-bold">{activeFilter}</span> ({filteredMembers.length} sonuç)</span>
            <button onClick={() => setActiveFilter('all')} className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1"><FilterX className="w-3.5 h-3.5" />Filtreyi Temizle</button>
          </div>
        )}

        <div className="space-y-12">
          {([Rank.R3, Rank.R2, Rank.R1] as Rank[]).map(rank => (
            <div key={rank} className="space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
                <span className={`px-3 py-1 rounded text-xs font-black uppercase tracking-widest ${rank === Rank.R3 ? 'bg-rose-500/20 text-rose-500' : rank === Rank.R2 ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'}`}>RÜTBE {rank}</span>
                <span className="text-slate-500 text-sm font-medium">{groupedMembers[rank].length} Üye</span>
              </div>
              {loading ? (
                <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div></div>
              ) : groupedMembers[rank].length === 0 ? (
                <p className="text-slate-600 italic py-4">Üye bulunmuyor.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupedMembers[rank].map(member => (
                    <MemberCard 
                      key={member.id} 
                      member={member} 
                      onEdit={() => openModal(member)} 
                      onDelete={() => handleDeleteMember(member.id)}
                      highlight={isHighlighted(member)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Modal is unchanged except for styling consistency */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">{editingMember ? <Edit2 className="w-5 h-5 text-amber-500" /> : <Plus className="w-5 h-5 text-amber-500" />}{editingMember ? 'Üyeyi Düzenle' : 'Yeni Üye Ekle'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSaveMember} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-400 mb-1">Üye Adı</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-amber-500 outline-none" placeholder="İsim veya Arapça isim için resim yükleyin" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-400 mb-1">İsim Görseli (Arapça İsimler İçin)</label>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded border-2 border-dashed flex items-center justify-center bg-slate-800 overflow-hidden">
                    {formNameImage ? <img src={formNameImage} className="w-full h-full object-cover" /> : <Camera className="w-5 h-5 text-slate-600" />}
                  </div>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs text-slate-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Toplam Güç (M)" value={formPower} onChange={setFormPower} />
                <InputGroup label="Takım 1 Gücü (M)" value={formTeam1Power} onChange={setFormTeam1Power} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-400 mb-1">Seviye</label>
                  <select value={formLevel} onChange={(e) => setFormLevel(parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 outline-none">
                    {Array.from({length: 17}, (_, i) => i + 14).map(lv => <option key={lv} value={lv}>Sv.{lv}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-400 mb-1">Rütbe</label>
                  <select value={formRank} onChange={(e) => setFormRank(e.target.value as Rank)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 outline-none">
                    <option value={Rank.R3}>R3</option><option value={Rank.R2}>R2</option><option value={Rank.R1}>R1</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 bg-slate-800 text-slate-300 font-bold py-3 rounded-lg hover:bg-slate-700 transition-colors">Vazgeç</button>
                <button type="submit" className="flex-1 bg-amber-500 text-slate-900 font-bold py-3 rounded-lg shadow-lg hover:bg-amber-400 transition-colors">Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const InputGroup = ({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) => (
  <div>
    <label className="block text-sm font-semibold text-slate-400 mb-1">{label}</label>
    <input type="number" step="0.1" value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 outline-none" placeholder="0.0" />
  </div>
);

const StatCard = ({ icon, label, value, color, onClick, active }: any) => {
  const activeStyles = {
    blue: 'border-blue-500 bg-blue-500/20 text-blue-400',
    amber: 'border-amber-500 bg-amber-500/20 text-amber-400',
    purple: 'border-purple-500 bg-purple-500/20 text-purple-400',
    rose: 'border-rose-500 bg-rose-500/20 text-rose-400'
  };
  const baseStyles = 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700';

  return (
    <button onClick={onClick} className={`p-5 rounded-2xl border flex items-center gap-4 transition-all w-full text-left active:scale-95 ${active ? (activeStyles as any)[color] : baseStyles}`}>
      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">{icon}</div>
      <div><p className="text-[10px] font-bold uppercase tracking-wider">{label}</p><p className="text-2xl font-black">{value}</p></div>
    </button>
  );
};

const MemberCard = ({ member, onEdit, onDelete, highlight }: any) => {
  const isLowPower = member.power < 10;
  const isLowLevel = member.level < 20;
  const isLowTeam1 = member.team1Power < 3;

  return (
    <div className={`flex flex-col border rounded-xl overflow-hidden transition-all duration-300 ${highlight ? 'bg-slate-900 border-rose-500/50 shadow-lg shadow-rose-500/10' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}>
      <div className="p-5 flex-1">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            {member.nameImage ? <img src={member.nameImage} className="h-10 w-24 object-contain rounded border border-slate-700 bg-slate-950" /> : <h4 className="text-lg font-bold text-white max-w-[150px] truncate">{member.name || 'İsimsiz'}</h4>}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-black border ${member.level < 20 ? 'text-rose-500 border-rose-500/30' : 'text-green-500 border-green-500/30'}`}>Sv.{member.level}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-[10px] font-bold text-slate-500 uppercase">Toplam Güç</p><p className={`text-xl font-black ${isLowPower ? 'text-rose-500' : 'text-amber-400'}`}>{member.power.toFixed(1)}M</p></div>
          <div><p className="text-[10px] font-bold text-slate-500 uppercase">Takım 1</p><p className={`text-xl font-black ${isLowTeam1 ? 'text-rose-500' : 'text-blue-400'}`}>{member.team1Power.toFixed(1)}M</p></div>
        </div>
      </div>
      
      <div className="flex border-t border-slate-800 bg-slate-900/50">
        <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-slate-400 hover:text-amber-500 hover:bg-amber-500/5 transition-all border-r border-slate-800">
          <Edit2 className="w-4 h-4" /> Düzenle
        </button>
        <button onClick={onDelete} className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-slate-400 hover:text-rose-500 hover:bg-rose-500/5 transition-all">
          <Trash2 className="w-4 h-4" /> Sil
        </button>
      </div>
    </div>
  );
};

export default App;

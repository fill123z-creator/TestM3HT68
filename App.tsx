
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { STUDENT_DATA, ASSESSMENTS } from './constants';
import { ViewState, StudentInfo } from './types';

// 🔗 ฐานข้อมูลกลาง (ใช้ Public Key-Value Store สำหรับโปรเจกต์นี้)
const BUCKET_ID = 'htr_career_db_v2'; 
const KV_BASE_URL = `https://kvdb.io/6E9X6hYvY8p6n7m7Z8q2zB/`;
const REGISTRY_URL = `${KV_BASE_URL}${BUCKET_ID}_registry`;

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('home');
  const [consent, setConsent] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  
  // 1. ทะเบียนรายชื่อ (ซิงค์จากฐานข้อมูลกลาง)
  const [localRegistry, setLocalRegistry] = useState<Record<string, string[]>>(STUDENT_DATA);

  // 2. ข้อมูลนักเรียนที่กำลังใช้งาน
  const [studentInfo, setStudentInfo] = useState<StudentInfo>({ name: '', class: '' });
  
  // 3. คลังผลการประเมิน
  const [allResultsStore, setAllResultsStore] = useState<Record<string, Record<string, any[]>>>(() => {
    const saved = localStorage.getItem('career_assessment_store');
    return saved ? JSON.parse(saved) : {};
  });

  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [tempAnswers, setTempAnswers] = useState<any[]>([]);

  // รหัสลับของนักเรียนแต่ละคน (ใช้ b64 ของ ชื่อ-ชั้น)
  const studentCloudKey = useMemo(() => {
    if (!studentInfo.name || !studentInfo.class) return '';
    return btoa(encodeURIComponent(`${studentInfo.name.trim()}-${studentInfo.class.trim()}`)).replace(/=/g, '');
  }, [studentInfo]);
  
  const assessmentResults = useMemo(() => {
    const rawKey = `${studentInfo.name.trim()}-${studentInfo.class.trim()}`;
    return allResultsStore[rawKey] || {};
  }, [allResultsStore, studentInfo]);

  const currentAssessment = useMemo(() => currentKey ? (ASSESSMENTS as any)[currentKey] : null, [currentKey]);

  // --- 🛠️ ระบบจัดการฐานข้อมูลคลาวด์ ---

  // ดึงรายชื่อนักเรียนทั้งหมดจากเซิร์ฟเวอร์ (รวมที่คนอื่นเพิ่มไว้ด้วย)
  const syncGlobalRegistry = useCallback(async () => {
    setIsSyncing(true);
    try {
      const resp = await fetch(REGISTRY_URL);
      if (resp.ok) {
        const remoteData = await resp.json();
        // Merge รายชื่อ (ของเดิม + ของใหม่ที่ดึงมา)
        setLocalRegistry(prev => {
          const merged = { ...prev };
          Object.keys(remoteData).forEach(cls => {
            merged[cls] = Array.from(new Set([...(merged[cls] || []), ...remoteData[cls]]));
          });
          return merged;
        });
        setLastSync(new Date().toLocaleTimeString());
      }
    } catch (e) { console.warn("Cloud Registry Offline - Using local data"); }
    setIsSyncing(false);
  }, []);

  // บันทึกรายชื่อใหม่ลงฐานข้อมูลกลาง
  const saveToGlobalRegistry = async (updatedRegistry: any) => {
    setIsSyncing(true);
    try {
      await fetch(REGISTRY_URL, {
        method: 'POST',
        body: JSON.stringify(updatedRegistry)
      });
    } catch (e) { console.error("Failed to save registry to cloud"); }
    setIsSyncing(false);
  };

  // ดึงคะแนนเก่าของนักเรียนจากคลาวด์
  const fetchMyScores = async (cloudKey: string, rawNameKey: string) => {
    setIsSyncing(true);
    try {
      const resp = await fetch(`${KV_BASE_URL}${BUCKET_ID}_user_${cloudKey}`);
      if (resp.ok) {
        const cloudResults = await resp.json();
        setAllResultsStore(prev => ({
          ...prev,
          [rawNameKey]: cloudResults
        }));
      }
    } catch (e) { console.log("New user - No cloud data yet"); }
    setIsSyncing(false);
  };

  // บันทึกคะแนนใหม่ขึ้นคลาวด์
  const pushMyScores = async (cloudKey: string, results: any) => {
    setIsSyncing(true);
    try {
      await fetch(`${KV_BASE_URL}${BUCKET_ID}_user_${cloudKey}`, {
        method: 'POST',
        body: JSON.stringify(results)
      });
      setLastSync(new Date().toLocaleTimeString());
    } catch (e) { alert("บันทึกข้อมูลไม่สำเร็จ กรุณาเช็กอินเทอร์เน็ต"); }
    setIsSyncing(false);
  };

  // --- 🔄 Lifecycle ---

  useEffect(() => {
    syncGlobalRegistry();
    const lastUser = localStorage.getItem('career_last_user');
    if (lastUser) {
      const parsed = JSON.parse(lastUser);
      setStudentInfo(parsed);
      setConsent(true);
      const rawKey = `${parsed.name.trim()}-${parsed.class.trim()}`;
      fetchMyScores(btoa(encodeURIComponent(rawKey)).replace(/=/g, ''), rawKey);
    }
  }, [syncGlobalRegistry]);

  useEffect(() => {
    localStorage.setItem('career_assessment_store', JSON.stringify(allResultsStore));
  }, [allResultsStore]);

  // --- 🖱️ Event Handlers ---

  const handleCustomNameSubmit = async () => {
    const name = studentInfo.name.trim();
    if (!name || !studentInfo.class) return;
    
    // 1. อัปเดตรายชื่อในเครื่องและคลาวด์
    const newRegistry = { ...localRegistry };
    const list = newRegistry[studentInfo.class] || [];
    if (!list.includes(name)) {
      newRegistry[studentInfo.class] = [...list, name];
      setLocalRegistry(newRegistry);
      await saveToGlobalRegistry(newRegistry);
    }

    // 2. ตั้งค่า User และดึงข้อมูล
    const finalUser = { ...studentInfo, name };
    setStudentInfo(finalUser);
    localStorage.setItem('career_last_user', JSON.stringify(finalUser));
    
    const rawKey = `${name}-${studentInfo.class}`;
    await fetchMyScores(btoa(encodeURIComponent(rawKey)).replace(/=/g, ''), rawKey);
    setView('select');
  };

  const handleStartAssessment = async (key: string) => {
    if (assessmentResults[key]) { setView('results'); return; }
    
    // ก่อนเริ่ม ลองเช็ก Cloud อีกรอบกันพลาด
    const rawKey = `${studentInfo.name.trim()}-${studentInfo.class.trim()}`;
    await fetchMyScores(studentCloudKey, rawKey);

    setCurrentKey(key);
    setQuestionIdx(0);
    const ass = (ASSESSMENTS as any)[key];
    setTempAnswers(ass.type === 'readiness' 
      ? new Array(ass.questions.length).fill(null).map(() => ({ rank1: null, rank2: null, rank3: null }))
      : new Array(ass.questions.length).fill(null)
    );
    setView('assessment');
  };

  const handleNext = async () => {
    const curAns = tempAnswers[questionIdx];
    if (currentAssessment?.type === 'readiness') {
      if (curAns.rank1 === null || curAns.rank2 === null || curAns.rank3 === null) return alert('เลือกให้ครบ 3 อันดับ');
    } else if (curAns === null) return alert('กรุณาเลือกคำตอบ');

    if (questionIdx < currentAssessment!.questions.length - 1) {
      setQuestionIdx(idx => idx + 1);
    } else {
      const rawKey = `${studentInfo.name.trim()}-${studentInfo.class.trim()}`;
      const newStore = { ...(allResultsStore[rawKey] || {}), [currentKey!]: [...tempAnswers] };
      
      setAllResultsStore(prev => ({ ...prev, [rawKey]: newStore }));
      await pushMyScores(studentCloudKey, newStore);
      setView('results');
    }
  };

  // --- 🧮 การคำนวณผล (ฟังก์ชันเดิมที่แก้ไข Error แล้ว) ---
  const getGoalAnalysis = (ans: any[]) => {
    const v = ans.filter(a => typeof a === 'number');
    if (!v.length) return { score: 0, label: "-" };
    const s = parseFloat((v.reduce((sum, a) => sum + (5 - a), 0) / v.length).toFixed(2));
    return { score: s, label: s >= 4.21 ? "มากที่สุด" : s >= 3.41 ? "มาก" : s >= 2.61 ? "ปานกลาง" : s >= 1.81 ? "น้อย" : "น้อยที่สุด" };
  };

  const calcRIASCOres = (ans: any[]) => {
    const cats = ['R', 'I', 'A', 'S', 'E', 'C'];
    const s: Record<string, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
    ans.forEach((a, i) => s[cats[i % 6]] += (2 - (Number(a) || 0)));
    Object.keys(s).forEach(k => s[k] = parseFloat((s[k] / 18 * 10).toFixed(2)));
    return s;
  };

  const calcIntelligenceScores = (ans: any[]) => {
    const cats = ["ดนตรี", "กายเคลื่อนไหว", "ตรรกะคณิตศาสตร์", "ภาษา", "ภาพ-มิติสัมพันธ์", "มนุษยสัมพันธ์", "ธรรมชาติแวดล้อม", "เข้าใจตนเอง"];
    const s: Record<string, number> = {}; cats.forEach(c => s[c] = 0);
    ans.forEach((a, i) => s[cats[i % 8]] += (3 - (Number(a) || 0)));
    Object.keys(s).forEach(k => s[k] = parseFloat((s[k] / 30 * 10).toFixed(2)));
    return s;
  };

  const calcReadinessScores = (ans: any[]) => {
    const r = { Data: 0, Person: 0, Tool: 0 };
    ans.forEach(a => {
      if (a.rank1 === 0) r.Data += 2; else if (a.rank1 === 1) r.Person += 2; else if (a.rank1 === 2) r.Tool += 2;
      if (a.rank2 === 0) r.Data += 1; else if (a.rank2 === 1) r.Person += 1; else if (a.rank2 === 2) r.Tool += 1;
    });
    return { Data: parseFloat(((r.Data/36)*10).toFixed(2)), Person: parseFloat(((r.Person/36)*10).toFixed(2)), Tool: parseFloat(((r.Tool/36)*10).toFixed(2)) };
  };

  const calcEQScores = (ans: any[]) => {
    const assess = ASSESSMENTS.eq_assessment;
    const itmS = ans.map((a, i) => assess.group1!.includes(i + 1) ? (4 - Number(a)) : (Number(a) + 1));
    const res: any = {};
    Object.entries(assess.dimensions!).forEach(([dK, d]: [string, any]) => {
      res[dK] = { name: d.name, total: 0, subdimensions: {}, range: d.range };
      Object.entries(d.subdimensions).forEach(([sK, s]: [string, any]) => {
        const subT = (s.questions as number[]).reduce((sum, q) => sum + (itmS[q - 1] || 0), 0);
        res[dK].subdimensions[sK] = { name: s.name, score: subT, range: s.range, interpretation: subT < s.range[0] ? 'ต่ำกว่าเกณฑ์' : (subT > s.range[1] ? 'สูงกว่าเกณฑ์' : 'ปกติ') };
        res[dK].total += subT;
      });
      res[dK].interpretation = res[dK].total < d.range[0] ? 'ต่ำกว่าเกณฑ์' : (res[dK].total > d.range[1] ? 'สูงกว่าเกณฑ์' : 'ปกติ');
    });
    return res;
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 font-['Sarabun']">
      
      {/* ☁️ Cloud Sync Status Bar */}
      <div className="fixed bottom-6 right-6 z-50 no-print">
        <div className={`px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border transition-all duration-500 bg-white/90 backdrop-blur-xl ${isSyncing ? 'border-amber-400 scale-105' : 'border-emerald-100'}`}>
          <div className={`w-3 h-3 rounded-full ${isSyncing ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`}></div>
          <div className="text-left">
            <p className={`text-[10px] font-black uppercase tracking-widest ${isSyncing ? 'text-amber-600' : 'text-emerald-600'}`}>
              {isSyncing ? 'Database Synchronizing' : 'Cloud Database Online'}
            </p>
            <p className="text-[9px] text-slate-400 font-bold">Last saved: {lastSync || 'Just now'}</p>
          </div>
        </div>
      </div>

      {view === 'home' && (
        <div className="bg-white rounded-[3rem] shadow-2xl p-8 md:p-16 text-center fade-in relative overflow-hidden">
          <div className="text-7xl mb-6">🏛️</div>
          <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 to-purple-700 mb-4 tracking-tight">CAREER GUIDANCE HUB</h1>
          <p className="text-xl font-bold text-slate-600 mb-2">โรงเรียนหารเทารังสีประชาสรรค์</p>
          <div className="inline-flex items-center gap-2 bg-indigo-50 px-4 py-1.5 rounded-full mb-12">
            <span className="text-indigo-600 text-xs font-black uppercase tracking-tighter">Powered by Shared Central Cloud DB</span>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="p-8 bg-blue-50/50 rounded-3xl border border-blue-100 hover:bg-blue-50 transition-colors">
              <div className="text-4xl mb-4">🌍</div>
              <h3 className="font-bold text-blue-900 mb-1">ใช้ได้ทุกที่</h3>
              <p className="text-xs text-blue-700">ข้อมูลเชื่อมถึงกันหมด ทั้งโรงเรียนและที่บ้าน</p>
            </div>
            <div className="p-8 bg-purple-50/50 rounded-3xl border border-purple-100 hover:bg-purple-50 transition-colors">
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="font-bold text-purple-900 mb-1">บันทึกถาวร</h3>
              <p className="text-xs text-purple-700">ไม่ต้องสำรองไฟล์ ระบบจำชื่อและผลสอบคุณไว้ตลอดไป</p>
            </div>
            <div className="p-8 bg-emerald-50/50 rounded-3xl border border-emerald-100 hover:bg-emerald-50 transition-colors">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="font-bold text-emerald-900 mb-1">ระบบ Real-time</h3>
              <p className="text-xs text-emerald-700">รายชื่อที่เพิ่มใหม่จะปรากฏให้คนอื่นเห็นทันที</p>
            </div>
          </div>

          <div className="max-w-md mx-auto space-y-6">
            <label className="flex items-center space-x-3 cursor-pointer p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="w-6 h-6 rounded-lg accent-indigo-600" />
              <span className="text-sm font-bold text-slate-600">ยอมรับเงื่อนไขการใช้ฐานข้อมูลออนไลน์</span>
            </label>
            <button onClick={() => setView('info')} disabled={!consent} className="w-full bg-slate-900 text-white py-6 rounded-3xl font-black text-2xl hover:bg-indigo-600 shadow-2xl disabled:opacity-30 transition-all transform active:scale-95">เข้าสู่ระบบกลาง →</button>
          </div>
        </div>
      )}

      {(view === 'info' || view === 'customInfo') && (
        <div className="max-w-2xl mx-auto bg-white rounded-[2.5rem] shadow-2xl p-10 md:p-14 fade-in">
          <button onClick={() => setView('home')} className="mb-8 text-indigo-600 font-black flex items-center gap-2 hover:translate-x-1 transition-transform"> ← กลับหน้าหลัก </button>
          <h2 className="text-4xl font-black text-slate-800 mb-10 text-center">{view === 'info' ? 'Login' : 'Add New Student'}</h2>
          
          <div className="space-y-8">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">มัธยมศึกษาปีที่</label>
              <div className="grid grid-cols-5 gap-3">
                {Object.keys(localRegistry).sort().map(c => (
                  <button key={c} onClick={() => setStudentInfo({ ...studentInfo, class: c, name: '' })} className={`py-3 rounded-xl font-black transition-all ${studentInfo.class === c ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>{c}</button>
                ))}
              </div>
            </div>

            {view === 'info' ? (
              <>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">ค้นหารายชื่อนักเรียน</label>
                  <select disabled={!studentInfo.class} className="w-full px-6 py-5 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 appearance-none focus:border-indigo-600 outline-none transition-all disabled:opacity-30" value={studentInfo.name} onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })}>
                    <option value="">{studentInfo.class ? '🔍 เลือกชื่อของคุณ...' : 'กรุณาเลือกห้องก่อน'}</option>
                    {studentInfo.class && localRegistry[studentInfo.class].sort().map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button onClick={async () => {
                  const rawKey = `${studentInfo.name.trim()}-${studentInfo.class.trim()}`;
                  await fetchMyScores(btoa(encodeURIComponent(rawKey)).replace(/=/g, ''), rawKey);
                  localStorage.setItem('career_last_user', JSON.stringify(studentInfo));
                  setView('select');
                }} disabled={!studentInfo.name || isSyncing} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-xl shadow-xl disabled:opacity-30">
                  {isSyncing ? 'Checking Cloud...' : 'ยืนยันตัวตน →'}
                </button>
                <div className="text-center">
                  <button onClick={() => setView('customInfo')} className="text-indigo-600 font-bold text-sm hover:underline">➕ ไม่พบชื่อ? เพิ่มชื่อนักเรียนใหม่เข้าระบบคลาวด์</button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">กรอกชื่อ - นามสกุล (ภาษาไทย)</label>
                  <input type="text" placeholder="ระบุชื่อจริง และนามสกุล..." className="w-full px-6 py-5 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 focus:border-indigo-600 outline-none transition-all" value={studentInfo.name} onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })} />
                </div>
                <button onClick={handleCustomNameSubmit} disabled={!studentInfo.name.trim() || !studentInfo.class || isSyncing} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-xl shadow-xl disabled:opacity-30">บันทึกเข้าฐานข้อมูลกลาง →</button>
                <button onClick={() => setView('info')} className="w-full text-slate-400 font-bold py-2">ยกเลิก</button>
              </>
            )}
          </div>
        </div>
      )}

      {view === 'select' && (
        <div className="bg-white rounded-[3rem] shadow-2xl p-10 md:p-14 fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center mb-12 border-b border-slate-50 pb-10 gap-6">
            <div className="text-center md:text-left">
               <span className="text-[10px] font-black bg-indigo-100 text-indigo-600 px-3 py-1 rounded-lg uppercase tracking-widest">Active Session</span>
               <h2 className="text-4xl font-black text-slate-800 mt-2">{studentInfo.name}</h2>
               <p className="text-slate-400 font-bold">มัธยมศึกษาปีที่ {studentInfo.class} • โรงเรียนหารเทารังสีประชาสรรค์</p>
            </div>
            <div className="flex gap-4">
               <button onClick={syncGlobalRegistry} className="p-4 bg-slate-50 rounded-2xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all font-bold text-sm">🔄 Refresh Data</button>
               <button onClick={() => { localStorage.removeItem('career_last_user'); setView('home'); }} className="p-4 bg-rose-50 rounded-2xl text-rose-600 font-black text-sm uppercase tracking-widest hover:bg-rose-100 transition-all">Sign Out</button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Object.values(ASSESSMENTS).map(ass => {
              const done = !!assessmentResults[ass.key];
              return (
                <div key={ass.key} onClick={() => handleStartAssessment(ass.key)} className={`group p-8 rounded-[2.5rem] border-4 cursor-pointer transition-all duration-300 ${done ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-50 bg-white hover:border-indigo-600 hover:-translate-y-2 hover:shadow-2xl'}`}>
                  <div className="text-6xl mb-6 transition-transform group-hover:scale-110">{ass.icon}</div>
                  <h3 className="font-black text-2xl mb-2 text-slate-800 leading-tight">{ass.title}</h3>
                  <div className="flex items-center justify-between mt-8">
                    <span className="text-slate-300 font-black text-xs uppercase">{ass.questions.length} Questions</span>
                    <span className={`font-black px-6 py-2 rounded-2xl text-xs uppercase tracking-tighter ${done ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white group-hover:bg-indigo-600'}`}>
                      {done ? 'Completed ✓' : 'Start Task'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-16">
            <button onClick={() => setView('results')} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black text-2xl hover:bg-black transition-all shadow-2xl flex items-center justify-center gap-4">
              <span className="text-3xl">📊</span> ดูสรุปรายงานศักยภาพส่วนบุคคล
            </button>
          </div>
        </div>
      )}

      {/* View อื่นๆ (assessment, results) จะได้รับการปรับปรุง logic การซิงค์และคำนวณอัตโนมัติ */}
      {view === 'assessment' && currentAssessment && (
        <div className="max-w-4xl mx-auto bg-white rounded-[3rem] shadow-2xl p-10 md:p-14 fade-in">
          <div className="flex justify-between items-center mb-12">
            <button onClick={() => setView('select')} className="text-indigo-600 font-black hover:translate-x-1 transition-transform"> ← Back to Dashboard </button>
            <div className="bg-slate-900 text-white px-6 py-2 rounded-full font-black text-sm">
              Progress: {questionIdx + 1} / {currentAssessment.questions.length}
            </div>
          </div>
          
          <div className="w-full bg-slate-100 h-2 rounded-full mb-16 overflow-hidden">
            <div className="bg-indigo-600 h-full transition-all duration-500" style={{ width: `${((questionIdx + 1) / currentAssessment.questions.length) * 100}%` }}></div>
          </div>

          <div className="mb-16 min-h-[300px]">
            <h3 className="text-3xl md:text-4xl font-black text-slate-800 mb-12 leading-snug">{currentAssessment.questions[questionIdx]}</h3>
            
            {currentAssessment.type === 'readiness' ? (
              <div className="grid gap-6">
                {(currentAssessment.options[questionIdx] as string[]).map((opt, i) => (
                  <div key={i} className="p-8 bg-slate-50 rounded-3xl border-2 border-slate-100 flex flex-col md:flex-row items-center gap-6">
                    <p className="flex-1 font-bold text-slate-700 text-xl">{opt}</p>
                    <div className="flex gap-4">
                      <button onClick={() => { const n = [...tempAnswers]; n[questionIdx] = {...n[questionIdx], rank1: i}; setTempAnswers(n); }} className={`px-6 py-3 rounded-xl font-black text-xs ${tempAnswers[questionIdx].rank1 === i ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>อันดับ 1</button>
                      <button onClick={() => { const n = [...tempAnswers]; n[questionIdx] = {...n[questionIdx], rank2: i}; setTempAnswers(n); }} className={`px-6 py-3 rounded-xl font-black text-xs ${tempAnswers[questionIdx].rank2 === i ? 'bg-amber-500 text-white' : 'bg-white text-slate-400'}`}>อันดับ 2</button>
                      <button onClick={() => { const n = [...tempAnswers]; n[questionIdx] = {...n[questionIdx], rank3: i}; setTempAnswers(n); }} className={`px-6 py-3 rounded-xl font-black text-xs ${tempAnswers[questionIdx].rank3 === i ? 'bg-slate-500 text-white' : 'bg-white text-slate-400'}`}>อันดับ 3</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {(() => {
                  const opts = Array.isArray(currentAssessment.options[0]) ? currentAssessment.options[questionIdx] as string[] : currentAssessment.options as string[];
                  return opts.map((opt, i) => (
                    <label key={i} className={`group flex items-center space-x-6 p-8 border-4 rounded-3xl cursor-pointer transition-all ${tempAnswers[questionIdx] === i ? 'border-indigo-600 bg-indigo-50 shadow-xl' : 'border-slate-50 bg-white hover:border-slate-100'}`}>
                      <input type="radio" checked={tempAnswers[questionIdx] === i} onChange={() => { const n = [...tempAnswers]; n[questionIdx] = i; setTempAnswers(n); }} className="w-10 h-10 accent-indigo-600" />
                      <span className="font-black text-slate-700 text-2xl">{opt}</span>
                    </label>
                  ));
                })()}
              </div>
            )}
          </div>

          <div className="flex gap-6">
            <button disabled={questionIdx === 0} onClick={() => setQuestionIdx(idx => idx - 1)} className="flex-1 py-6 bg-slate-50 text-slate-400 rounded-2xl font-black disabled:opacity-30">ถอยหลัง</button>
            <button onClick={handleNext} disabled={isSyncing} className="flex-[3] py-6 bg-indigo-600 text-white rounded-2xl font-black text-2xl shadow-2xl active:scale-95 transition-transform">
               {isSyncing ? 'กำลังบันทึกลงคลาวด์...' : (questionIdx === currentAssessment.questions.length - 1 ? 'ยืนยันและบันทึกผล' : 'ข้อถัดไป →')}
            </button>
          </div>
        </div>
      )}

      {view === 'results' && (
        <div className="bg-white rounded-[4rem] shadow-2xl p-10 md:p-20 fade-in">
          <div className="flex justify-between items-start mb-16 no-print">
            <button onClick={() => setView('select')} className="text-indigo-600 font-black flex items-center gap-2"> ← Dashboard </button>
            <button onClick={() => window.print()} className="bg-slate-900 text-white px-8 py-4 rounded-3xl font-black hover:shadow-2xl transition-all"> 🖨️ Print Final Report </button>
          </div>
          
          <div className="text-center mb-24">
            <h2 className="text-5xl font-black text-slate-800 tracking-tighter mb-4">PERSONAL CAREER REPORT</h2>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-12">Analysis based on global benchmark and self-assessment</p>
            <div className="flex justify-center gap-6">
               <div className="bg-slate-900 text-white px-12 py-5 rounded-[2.5rem] shadow-xl">
                 <p className="text-[10px] opacity-40 uppercase font-black mb-2">Student Name</p>
                 <p className="text-3xl font-black">{studentInfo.name}</p>
               </div>
               <div className="bg-indigo-50 text-indigo-700 px-12 py-5 rounded-[2.5rem] border border-indigo-100">
                 <p className="text-[10px] opacity-40 uppercase font-black mb-2">Classroom</p>
                 <p className="text-3xl font-black">มัธยมศึกษาปีที่ {studentInfo.class}</p>
               </div>
            </div>
          </div>

          <div className="space-y-32">
            {assessmentResults.goal_setting && (
              <section className="border-t pt-16">
                <h3 className="text-3xl font-black text-slate-800 mb-10 flex items-center gap-4">
                  <span className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center">01</span>
                  เป้าหมายและการเรียน
                </h3>
                <div className="bg-slate-50 p-12 rounded-[3.5rem] flex flex-col md:flex-row items-center gap-16 border border-slate-100">
                   <div className="text-9xl font-black text-indigo-600 drop-shadow-2xl">{getGoalAnalysis(assessmentResults.goal_setting).score}</div>
                   <div className="text-center md:text-left">
                     <p className="text-xs font-black text-slate-300 uppercase tracking-widest mb-4">Interpretational Result</p>
                     <p className="text-6xl font-black text-slate-900 mb-4">{getGoalAnalysis(assessmentResults.goal_setting).label}</p>
                     <p className="text-slate-500 font-bold max-w-md">แสดงให้เห็นถึงระดับความมุ่งมั่นและทัศนคติที่มีต่อการศึกษาต่อในอนาคต</p>
                   </div>
                </div>
              </section>
            )}

            {assessmentResults.multiple_intelligence && (
              <section className="border-t pt-16">
                <h3 className="text-3xl font-black text-slate-800 mb-10 flex items-center gap-4">
                  <span className="w-12 h-12 bg-purple-600 text-white rounded-2xl flex items-center justify-center">02</span>
                  พหุปัญญา (Multiple Intelligences)
                </h3>
                <div className="grid gap-6">
                  {Object.entries(calcIntelligenceScores(assessmentResults.multiple_intelligence)).sort((a,b) => b[1] - a[1]).map(([name, val], i) => (
                    <div key={name} className="flex items-center gap-8 group">
                      <div className="w-40 text-sm font-black text-slate-400 group-hover:text-purple-600 transition-colors">{name}</div>
                      <div className="flex-1 bg-slate-50 h-8 rounded-2xl overflow-hidden border border-slate-100 shadow-inner">
                        <div className={`h-full transition-all duration-1000 ${i < 3 ? 'bg-gradient-to-r from-purple-600 to-indigo-600 shadow-lg' : 'bg-slate-300'}`} style={{ width: `${(val || 0) * 10}%` }}></div>
                      </div>
                      <div className="w-12 text-right font-black text-2xl text-slate-800">{val}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {assessmentResults.eq_assessment && (
              <section className="border-t pt-16">
                <h3 className="text-3xl font-black text-slate-800 mb-10 flex items-center gap-4">
                  <span className="w-12 h-12 bg-rose-600 text-white rounded-2xl flex items-center justify-center">03</span>
                  ความฉลาดทางอารมณ์ (EQ)
                </h3>
                <div className="grid md:grid-cols-3 gap-8">
                  {Object.entries(calcEQScores(assessmentResults.eq_assessment)).map(([k, v]: [string, any]) => (
                    <div key={k} className="bg-white border-4 border-slate-50 p-10 rounded-[3rem] text-center shadow-xl hover:shadow-2xl transition-all">
                      <h4 className="text-slate-400 font-black text-xs uppercase mb-4 tracking-widest">{v.name}</h4>
                      <p className="text-7xl font-black text-rose-600 mb-6">{v.total}</p>
                      <span className={`px-8 py-2 rounded-2xl text-xs font-black shadow-lg uppercase ${v.interpretation === 'ปกติ' ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white'}`}>{v.interpretation}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {assessmentResults.riasec_assessment && (
              <section className="border-t pt-16">
                <h3 className="text-3xl font-black text-slate-800 mb-10 flex items-center gap-4">
                  <span className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center">04</span>
                  ความสนใจทางอาชีพ (RIASEC)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
                  {Object.entries(calcRIASCOres(assessmentResults.riasec_assessment)).map(([k, v]) => (
                    <div key={k} className="bg-slate-50 p-8 rounded-[2.5rem] text-center group hover:bg-emerald-600 transition-all duration-300">
                      <p className="text-5xl font-black text-emerald-600 group-hover:text-white transition-colors">{v}</p>
                      <p className="text-xs font-black text-slate-300 uppercase mt-4 group-hover:text-emerald-100">{k}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {assessmentResults.career_readiness && (
              <section className="border-t pt-16">
                <h3 className="text-3xl font-black text-slate-800 mb-10 flex items-center gap-4">
                  <span className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center">05</span>
                  ความพร้อมทางอาชีพ
                </h3>
                <div className="grid md:grid-cols-3 gap-8">
                  {Object.entries(calcReadinessScores(assessmentResults.career_readiness)).map(([k, v]) => (
                    <div key={k} className="bg-slate-900 text-white p-14 rounded-[3.5rem] text-center shadow-2xl group overflow-hidden relative">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/20 rounded-full -mr-10 -mt-10 group-hover:scale-150 transition-transform"></div>
                      <p className="text-[10px] text-indigo-400 font-black mb-4 uppercase tracking-[0.3em]">ด้าน {k === 'Data' ? 'ข้อมูล' : k === 'Person' ? 'คน' : 'เครื่องมือ'}</p>
                      <p className="text-8xl font-black relative z-10">{v}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
          
          <div className="mt-32 pt-16 border-t flex flex-col md:flex-row gap-6 no-print">
            <button onClick={() => setView('select')} className="flex-[2] py-8 bg-indigo-600 text-white rounded-[2rem] font-black text-2xl shadow-2xl hover:bg-indigo-700 transition-all active:scale-95">ทำส่วนที่เหลือให้ครบ →</button>
            <button onClick={() => { localStorage.removeItem('career_last_user'); setView('home'); }} className="flex-1 py-8 bg-slate-100 text-slate-500 rounded-[2rem] font-black text-xl hover:bg-rose-50 hover:text-rose-600 transition-all">Sign Out</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

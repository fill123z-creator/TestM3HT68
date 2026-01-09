
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { STUDENT_DATA, ASSESSMENTS } from './constants';
import { ViewState, StudentInfo } from './types';

// พื้นที่จัดเก็บข้อมูลส่วนกลาง (KVDB)
const KV_BASE_URL = `https://kvdb.io/6E9X6hYvY8p6n7m7Z8q2zB/`;
const REGISTRY_KEY = 'global_registry_htr_v1';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('home');
  const [consent, setConsent] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // 1. ทะเบียนรายชื่อ (ซิงค์จากส่วนกลาง)
  const [localRegistry, setLocalRegistry] = useState<Record<string, string[]>>(STUDENT_DATA);

  // 2. ข้อมูลนักเรียนปัจจุบัน
  const [studentInfo, setStudentInfo] = useState<StudentInfo>({ name: '', class: '' });
  
  // 3. คลังผลการประเมิน (Local + Remote)
  const [allResultsStore, setAllResultsStore] = useState<Record<string, Record<string, any[]>>>(() => {
    const saved = localStorage.getItem('career_assessment_store');
    return saved ? JSON.parse(saved) : {};
  });

  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [tempAnswers, setTempAnswers] = useState<any[]>([]);

  const studentKey = useMemo(() => {
    if (!studentInfo.name || !studentInfo.class) return '';
    return btoa(encodeURIComponent(`${studentInfo.name.trim()}-${studentInfo.class.trim()}`));
  }, [studentInfo]);
  
  const assessmentResults = useMemo(() => {
    const rawNameKey = `${studentInfo.name.trim()}-${studentInfo.class.trim()}`;
    return allResultsStore[rawNameKey] || {};
  }, [allResultsStore, studentInfo]);

  const currentAssessment = useMemo(() => currentKey ? (ASSESSMENTS as any)[currentKey] : null, [currentKey]);

  // --- ฟังก์ชันซิงค์ข้อมูลคลาวด์ ---

  // โหลดรายชื่อนักเรียนกลาง
  const syncRegistry = useCallback(async () => {
    try {
      const resp = await fetch(`${KV_BASE_URL}${REGISTRY_KEY}`);
      if (resp.ok) {
        const remote = await resp.json();
        setLocalRegistry(remote);
        localStorage.setItem('career_student_registry', JSON.stringify(remote));
      }
    } catch (e) { console.warn("Cannot sync registry"); }
  }, []);

  // บันทึกรายชื่อใหม่ขึ้นคลาวด์
  const pushRegistry = async (newRegistry: any) => {
    try {
      await fetch(`${KV_BASE_URL}${REGISTRY_KEY}`, {
        method: 'POST',
        body: JSON.stringify(newRegistry)
      });
    } catch (e) { console.error("Push registry failed"); }
  };

  // ดึงผลการสอบของนักเรียนคนนี้จากคลาวด์
  const fetchStudentResults = async (key: string, rawNameKey: string) => {
    setIsSyncing(true);
    try {
      const resp = await fetch(`${KV_BASE_URL}user_${key}`);
      if (resp.ok) {
        const remoteResults = await resp.json();
        setAllResultsStore(prev => ({
          ...prev,
          [rawNameKey]: remoteResults
        }));
      }
    } catch (e) { console.warn("New user or fetch failed"); }
    setIsSyncing(false);
  };

  // บันทึกผลการสอบขึ้นคลาวด์
  const pushStudentResults = async (key: string, results: any) => {
    setIsSyncing(true);
    try {
      await fetch(`${KV_BASE_URL}user_${key}`, {
        method: 'POST',
        body: JSON.stringify(results)
      });
    } catch (e) { console.error("Cloud save failed"); }
    setIsSyncing(false);
  };

  // --- Effects ---

  useEffect(() => {
    syncRegistry();
    const lastUser = localStorage.getItem('career_last_user');
    if (lastUser) {
      const parsed = JSON.parse(lastUser);
      setStudentInfo(parsed);
      setConsent(true);
      // ถ้ามี user เก่า ให้ลองดึงข้อมูลทันที
      const rawNameKey = `${parsed.name.trim()}-${parsed.class.trim()}`;
      const encodedKey = btoa(encodeURIComponent(rawNameKey));
      fetchStudentResults(encodedKey, rawNameKey);
    }
  }, [syncRegistry]);

  useEffect(() => {
    localStorage.setItem('career_assessment_store', JSON.stringify(allResultsStore));
  }, [allResultsStore]);

  // --- UI Handlers ---

  const handleCustomInfoSubmit = async () => {
    const nameTrimmed = studentInfo.name.trim();
    if (!nameTrimmed || !studentInfo.class) return;
    
    const newRegistry = { ...localRegistry };
    const currentClassList = newRegistry[studentInfo.class] || [];
    if (!currentClassList.includes(nameTrimmed)) {
      newRegistry[studentInfo.class] = [...currentClassList, nameTrimmed];
      setLocalRegistry(newRegistry);
      await pushRegistry(newRegistry);
    }

    const finalUser = { ...studentInfo, name: nameTrimmed };
    setStudentInfo(finalUser);
    localStorage.setItem('career_last_user', JSON.stringify(finalUser));
    
    // ดึงข้อมูลเก่า (ถ้ามี)
    const rawNameKey = `${nameTrimmed}-${studentInfo.class}`;
    await fetchStudentResults(btoa(encodeURIComponent(rawNameKey)), rawNameKey);
    setView('select');
  };

  const handleStartAssessment = (key: string) => {
    if (assessmentResults[key]) { setView('results'); return; }
    setCurrentKey(key);
    setQuestionIdx(0);
    const assessment = (ASSESSMENTS as any)[key];
    if (assessment.type === 'readiness') {
      setTempAnswers(new Array(assessment.questions.length).fill(null).map(() => ({ rank1: null, rank2: null, rank3: null })));
    } else {
      setTempAnswers(new Array(assessment.questions.length).fill(null));
    }
    setView('assessment');
  };

  const handleNext = async () => {
    const currentAns = tempAnswers[questionIdx];
    if (currentAssessment?.type === 'readiness') {
      if (currentAns.rank1 === null || currentAns.rank2 === null || currentAns.rank3 === null) {
        alert('กรุณาเลือกให้ครบทั้ง 3 อันดับ'); return;
      }
    } else if (currentAns === null) { 
      alert('กรุณาเลือกคำตอบ'); return; 
    }

    if (questionIdx < currentAssessment!.questions.length - 1) {
      setQuestionIdx(idx => idx + 1);
    } else {
      const rawNameKey = `${studentInfo.name.trim()}-${studentInfo.class.trim()}`;
      const updatedUserResults = { ...(allResultsStore[rawNameKey] || {}), [currentKey!]: [...tempAnswers] };
      
      // บันทึก Local
      setAllResultsStore(prev => ({
        ...prev,
        [rawNameKey]: updatedUserResults
      }));

      // บันทึก Cloud ทันที
      await pushStudentResults(studentKey, updatedUserResults);
      setView('results');
    }
  };

  const handleLogin = async () => {
    if (!studentInfo.name) return;
    const rawNameKey = `${studentInfo.name.trim()}-${studentInfo.class.trim()}`;
    await fetchStudentResults(btoa(encodeURIComponent(rawNameKey)), rawNameKey);
    localStorage.setItem('career_last_user', JSON.stringify(studentInfo));
    setView('select');
  };

  // --- คำนวณผล (ย่อ) ---
  // Fix arithmetic error by ensuring ans values are treated as numbers and result is handled safely.
  const getGoalAnalysis = (ans: any[]) => {
    const validAns = ans.filter(a => typeof a === 'number');
    if (validAns.length === 0) return { score: 0, label: "ไม่มีข้อมูล" };
    const avg = validAns.reduce((s, a) => s + (5 - a), 0) / validAns.length;
    const score = parseFloat(avg.toFixed(2));
    const label = score >= 4.21 ? "มากที่สุด" : score >= 3.41 ? "มาก" : score >= 2.61 ? "ปานกลาง" : score >= 1.81 ? "น้อย" : "น้อยที่สุด";
    return { score, label };
  };

  // Fix arithmetic error by using explicit Record<string, number> type and ensuring conversion of elements.
  const calcRIASCOres = (ans: any[]) => {
    const cats = ['R', 'I', 'A', 'S', 'E', 'C'];
    const scores: Record<string, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
    ans.forEach((a, i) => {
      const val = typeof a === 'number' ? a : 0;
      scores[cats[i % 6]] += (2 - val);
    });
    Object.keys(scores).forEach(k => scores[k] = parseFloat((scores[k] / 18 * 10).toFixed(2)));
    return scores;
  };

  // Fix arithmetic error by using explicit Record<string, number> type and ensuring conversion of elements.
  const calcIntelligenceScores = (ans: any[]) => {
    const cats = ["ดนตรี", "กายเคลื่อนไหว", "ตรรกะคณิตศาสตร์", "ภาษา", "ภาพ-มิติสัมพันธ์", "มนุษยสัมพันธ์", "ธรรมชาติแวดล้อม", "เข้าใจตนเอง"];
    const s: Record<string, number> = {}; 
    cats.forEach(c => s[c] = 0);
    ans.forEach((a, i) => {
      const val = typeof a === 'number' ? a : 0;
      s[cats[i % 8]] += (3 - val);
    });
    Object.keys(s).forEach(k => s[k] = parseFloat((s[k] / 30 * 10).toFixed(2)));
    return s;
  };

  const calcReadinessScores = (ans: any[]) => {
    const r = { Data: 0, Person: 0, Tool: 0 };
    ans.forEach(a => {
      if (a.rank1 === 0) r.Data += 2; else if (a.rank1 === 1) r.Person += 2; else if (a.rank1 === 2) r.Tool += 2;
      if (a.rank2 === 0) r.Data += 1; else if (a.rank2 === 1) r.Person += 1; else if (a.rank2 === 2) r.Tool += 1;
    });
    return { Data: parseFloat(((r.Data / 36) * 10).toFixed(2)), Person: parseFloat(((r.Person / 36) * 10).toFixed(2)), Tool: parseFloat(((r.Tool / 36) * 10).toFixed(2)) };
  };

  // Fix arithmetic error by ensuring inputs are numbers during reduction and mapping.
  const calcEQScores = (ans: any[]) => {
    const assess = ASSESSMENTS.eq_assessment;
    const itmS = ans.map((a, i) => {
      const val = typeof a === 'number' ? a : 0;
      return assess.group1!.includes(i + 1) ? (4 - val) : (val + 1);
    });
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
      
      {/* Cloud Status Indicator */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none no-print">
        <div className={`px-4 py-2 rounded-full text-xs font-black shadow-lg transition-all border flex items-center gap-2 ${isSyncing ? 'bg-amber-500 text-white border-amber-400 scale-105' : 'bg-white/80 backdrop-blur-md text-emerald-600 border-emerald-100'}`}>
          <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-white animate-pulse' : 'bg-emerald-500'}`}></div>
          {isSyncing ? 'กำลังซิงค์ข้อมูล...' : '☁️ เชื่อมต่อคลาวด์แล้ว'}
        </div>
      </div>

      {view === 'home' && (
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 text-center fade-in relative overflow-hidden">
          <div className="text-6xl mb-4">🎓</div>
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-2 tracking-tight">ระบบประเมินและแนะแนวอาชีพ</h1>
          <p className="text-xl font-bold text-slate-700 mb-2">โรงเรียนหารเทารังสีประชาสรรค์</p>
          <p className="text-sm font-bold text-slate-400 mb-8 uppercase tracking-widest">ระบบซิงค์ข้อมูลอัตโนมัติ (Online Database)</p>
          
          <div className="grid md:grid-cols-2 gap-6 mb-8 text-left">
            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
              <div className="text-3xl mb-3">🛡️</div>
              <h3 className="font-bold text-lg text-blue-900 mb-2">ข้อมูลไม่หาย</h3>
              <p className="text-sm text-blue-700">บันทึกข้อมูลผูกกับชื่อนักเรียน ดึงข้อมูลกลับมาได้ทุุกเครื่อง</p>
            </div>
            <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100">
              <div className="text-3xl mb-3">📡</div>
              <h3 className="font-bold text-lg text-purple-900 mb-2">เข้าถึงได้จากทุกที่</h3>
              <p className="text-sm text-purple-700">ทำที่โรงเรียนแล้วกลับไปดูผลที่บ้านได้ทันที</p>
            </div>
          </div>
          <div className="space-y-6">
            <label className="flex items-start space-x-3 cursor-pointer group text-left max-w-2xl mx-auto">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500" />
              <span className="text-sm text-gray-700">ข้าพเจ้ายินยอมให้ระบบบันทึกข้อมูลการประเมินลงในฐานข้อมูลออนไลน์เพื่อวิเคราะห์ผล</span>
            </label>
            <button onClick={() => setView('info')} disabled={!consent} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 px-8 rounded-2xl font-bold text-xl hover:shadow-xl transition-all disabled:opacity-50">เข้าสู่ระบบนักเรียน</button>
          </div>
        </div>
      )}

      {(view === 'info' || view === 'customInfo') && (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-2xl p-8 md:p-12 fade-in">
          <button onClick={() => setView('home')} className="mb-6 text-indigo-600 font-bold flex items-center gap-2"> ← กลับ </button>
          <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">{view === 'info' ? 'เข้าสู่ระบบ' : 'เพิ่มชื่อใหม่'}</h2>
          {view === 'info' ? (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">เลือกห้องเรียน</label>
                <select className="w-full px-5 py-4 border-2 border-gray-100 rounded-2xl font-bold text-slate-700" value={studentInfo.class} onChange={(e) => setStudentInfo({ ...studentInfo, class: e.target.value, name: '' })}>
                  <option value="">-- เลือกห้อง --</option>
                  {Object.keys(localRegistry).sort().map(c => <option key={c} value={c}>มัธยมศึกษาปีที่ {c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">ชื่อ-นามสกุล</label>
                <select disabled={!studentInfo.class} className="w-full px-5 py-4 border-2 border-gray-100 rounded-2xl font-bold text-slate-700 disabled:bg-slate-50" value={studentInfo.name} onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })}>
                  <option value="">{studentInfo.class ? 'ค้นหารายชื่อ...' : 'เลือกห้องก่อน'}</option>
                  {studentInfo.class && localRegistry[studentInfo.class].sort().map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button onClick={handleLogin} disabled={!studentInfo.name || isSyncing} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg disabled:opacity-50">
                {isSyncing ? 'กำลังโหลดข้อมูล...' : 'เข้าสู่ระบบ'}
              </button>
              <button onClick={() => setView('customInfo')} className="w-full text-slate-400 py-2 font-bold text-sm">➕ ไม่พบชื่อ? เพิ่มรายชื่อใหม่ที่นี่</button>
            </div>
          ) : (
            <div className="space-y-6">
               <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase">เลือกห้องเรียน</label>
                <select className="w-full px-5 py-4 border-2 border-gray-100 rounded-2xl font-bold text-slate-700" value={studentInfo.class} onChange={(e) => setStudentInfo({ ...studentInfo, class: e.target.value })}>
                  <option value="">-- เลือกห้อง --</option>
                  {Object.keys(localRegistry).sort().map(c => <option key={c} value={c}>มัธยมศึกษาปีที่ {c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase">ระบุชื่อ-นามสกุล</label>
                <input type="text" placeholder="ชื่อ นามสกุล..." className="w-full px-5 py-4 border-2 border-gray-100 rounded-2xl font-bold text-slate-700" value={studentInfo.name} onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })} />
              </div>
              <button onClick={handleCustomInfoSubmit} disabled={!studentInfo.name.trim() || !studentInfo.class || isSyncing} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg">บันทึกและเข้าสู่ระบบ</button>
            </div>
          )}
        </div>
      )}

      {view === 'select' && (
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 fade-in">
          <div className="flex justify-between items-center mb-10 border-b pb-6">
            <div>
               <h2 className="text-3xl font-bold text-gray-800">Dashboard นักเรียน</h2>
               <p className="text-gray-500">ชื่อ: <span className="text-indigo-600 font-bold">{studentInfo.name}</span> (ม.{studentInfo.class})</p>
            </div>
            <button onClick={() => { localStorage.removeItem('career_last_user'); setView('home'); }} className="text-xs text-rose-500 font-bold border-2 border-rose-100 px-4 py-2 rounded-xl">ออกจากระบบ</button>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.values(ASSESSMENTS).map(ass => {
              const done = !!assessmentResults[ass.key];
              return (
                <div key={ass.key} onClick={() => handleStartAssessment(ass.key)} className={`p-6 rounded-3xl border-2 cursor-pointer transition-all hover:-translate-y-2 ${done ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-50 bg-white hover:border-indigo-100 shadow-sm'}`}>
                  <div className="text-5xl mb-4">{ass.icon}</div>
                  <h3 className="font-bold text-xl mb-2 text-gray-800">{ass.title}</h3>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-gray-400 font-bold text-xs">{ass.questions.length} ข้อ</span>
                    <span className={`font-black px-4 py-1 rounded-full text-[10px] uppercase ${done ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}`}>
                      {done ? '✓ เสร็จแล้ว' : 'เริ่มทำ'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-12">
            <button onClick={() => setView('results')} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg shadow-xl">📊 สรุปผลรายงานรวม</button>
          </div>
        </div>
      )}

      {view === 'assessment' && currentAssessment && (
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl p-8 md:p-12 fade-in">
          <div className="flex justify-between items-center mb-10">
            <button onClick={() => setView('select')} className="text-indigo-600 font-black text-sm"> ← กลับ Dashboard </button>
            <div className="bg-indigo-50 px-4 py-1 rounded-full text-indigo-600 font-black text-sm">
              {questionIdx + 1} / {currentAssessment.questions.length}
            </div>
          </div>
          <div className="mb-10">
            <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mb-10 leading-snug">{currentAssessment.questions[questionIdx]}</h3>
            {currentAssessment.type === 'readiness' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 bg-slate-50 rounded-2xl overflow-hidden border">
                    <div className="hidden md:flex p-4 items-center justify-center text-[10px] font-black text-slate-400 border-r">ตัวเลือก</div>
                    <div className="bg-indigo-600 text-white p-3 text-center text-[10px] font-black uppercase">ชอบที่สุด</div>
                    <div className="bg-amber-500 text-white p-3 text-center text-[10px] font-black uppercase">ไม่แน่ใจ</div>
                    <div className="bg-slate-400 text-white p-3 text-center text-[10px] font-black uppercase tracking-widest">ไม่ชอบ</div>
                    {(currentAssessment.options[questionIdx] as string[]).map((opt, i) => (
                      <React.Fragment key={i}>
                        <div className="p-4 bg-white border-b md:border-r text-sm font-bold text-slate-700">{opt}</div>
                        <div className="flex justify-center p-3 bg-white border-b"><input type="radio" checked={tempAnswers[questionIdx].rank1 === i} onChange={() => { const n = [...tempAnswers]; n[questionIdx] = {...n[questionIdx], rank1: i}; setTempAnswers(n); }} className="w-8 h-8 accent-indigo-600" /></div>
                        <div className="flex justify-center p-3 bg-white border-b"><input type="radio" checked={tempAnswers[questionIdx].rank2 === i} onChange={() => { const n = [...tempAnswers]; n[questionIdx] = {...n[questionIdx], rank2: i}; setTempAnswers(n); }} className="w-8 h-8 accent-amber-500" /></div>
                        <div className="flex justify-center p-3 bg-white border-b"><input type="radio" checked={tempAnswers[questionIdx].rank3 === i} onChange={() => { const n = [...tempAnswers]; n[questionIdx] = {...n[questionIdx], rank3: i}; setTempAnswers(n); }} className="w-8 h-8 accent-slate-500" /></div>
                      </React.Fragment>
                    ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                {(() => {
                  const opts = Array.isArray(currentAssessment.options[0]) ? currentAssessment.options[questionIdx] as string[] : currentAssessment.options as string[];
                  return opts.map((opt, i) => (
                    <label key={i} className={`flex items-center space-x-4 p-5 border-2 rounded-2xl cursor-pointer transition-all ${tempAnswers[questionIdx] === i ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-slate-50 bg-white hover:bg-slate-50'}`}>
                      <input type="radio" checked={tempAnswers[questionIdx] === i} onChange={() => { const n = [...tempAnswers]; n[questionIdx] = i; setTempAnswers(n); }} className="w-6 h-6 accent-indigo-600" />
                      <span className="font-bold text-slate-700 text-lg">{opt}</span>
                    </label>
                  ));
                })()}
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <button disabled={questionIdx === 0} onClick={() => setQuestionIdx(idx => idx - 1)} className="flex-1 py-4 border-2 rounded-2xl font-black text-slate-400">ถอยหลัง</button>
            <button onClick={handleNext} disabled={isSyncing} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-lg">
               {isSyncing ? 'กำลังบันทึก...' : (questionIdx === currentAssessment.questions.length - 1 ? 'เสร็จสิ้นและบันทึก' : 'ถัดไป →')}
            </button>
          </div>
        </div>
      )}

      {view === 'results' && (
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 fade-in">
          <div className="flex justify-between items-start mb-10 no-print">
            <button onClick={() => setView('select')} className="text-indigo-600 font-black text-sm"> ← กลับ Dashboard </button>
            <button onClick={() => window.print()} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-sm"> 🖨️ พิมพ์ผลการเรียน </button>
          </div>
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-slate-800">รายงานผลการวิเคราะห์ศักยภาพ</h2>
            <div className="mt-6 flex justify-center gap-4">
               <div className="bg-slate-900 text-white px-8 py-3 rounded-2xl"><p className="text-[10px] opacity-60">นักเรียน</p><p className="text-2xl font-bold">{studentInfo.name}</p></div>
               <div className="bg-indigo-50 text-indigo-600 px-8 py-3 rounded-2xl"><p className="text-[10px] opacity-60">ชั้น</p><p className="text-2xl font-bold">มัธยมศึกษาปีที่ {studentInfo.class}</p></div>
            </div>
          </div>

          <div className="space-y-24">
            {assessmentResults.goal_setting && (
              <section className="border-t pt-10">
                <h3 className="text-2xl font-black mb-6">🎯 ด้านเป้าหมายและการเรียน</h3>
                <div className="bg-slate-50 p-8 rounded-3xl flex items-center gap-10">
                   <div className="text-7xl font-black text-indigo-600">{getGoalAnalysis(assessmentResults.goal_setting).score}</div>
                   <div>
                     <p className="text-xs font-black text-slate-400 uppercase">ระดับความพร้อม:</p>
                     <p className="text-3xl font-black text-indigo-900">{getGoalAnalysis(assessmentResults.goal_setting).label}</p>
                   </div>
                </div>
              </section>
            )}

            {assessmentResults.multiple_intelligence && (
              <section className="border-t pt-10">
                <h3 className="text-2xl font-black mb-6">🧠 พหุปัญญา 8 ด้าน (คะแนนเต็ม 10)</h3>
                <div className="grid gap-4">
                  {Object.entries(calcIntelligenceScores(assessmentResults.multiple_intelligence)).sort((a,b) => b[1] - a[1]).map(([name, val], i) => (
                    <div key={name} className="flex items-center gap-4">
                      <div className="w-32 text-sm font-bold truncate">{name}</div>
                      <div className="flex-1 bg-slate-100 h-4 rounded-full overflow-hidden">
                        <div className={`h-full ${i < 3 ? 'bg-indigo-600' : 'bg-slate-300'}`} style={{ width: `${(val || 0) * 10}%` }}></div>
                      </div>
                      <div className="w-10 text-right font-black">{val}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {assessmentResults.eq_assessment && (
              <section className="border-t pt-10">
                <h3 className="text-2xl font-black mb-6">❤️ ความฉลาดทางอารมณ์ (EQ)</h3>
                <div className="grid md:grid-cols-3 gap-6">
                  {Object.entries(calcEQScores(assessmentResults.eq_assessment)).map(([k, v]: [string, any]) => (
                    <div key={k} className="bg-slate-50 p-6 rounded-3xl text-center border">
                      <h4 className="font-bold text-slate-500 mb-2">{v.name}</h4>
                      <p className="text-5xl font-black text-rose-500 mb-4">{v.total}</p>
                      <span className="px-4 py-1 bg-white rounded-full text-xs font-black shadow-sm">{v.interpretation}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {assessmentResults.riasec_assessment && (
              <section className="border-t pt-10">
                <h3 className="text-2xl font-black mb-6">💼 ความสนใจอาชีพ (RIASEC)</h3>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  {Object.entries(calcRIASCOres(assessmentResults.riasec_assessment)).map(([k, v]) => (
                    <div key={k} className="bg-white border p-6 rounded-3xl text-center shadow-sm">
                      <p className="text-4xl font-black text-emerald-600">{v}</p>
                      <p className="text-xs font-black text-slate-300 uppercase mt-2">{k}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {assessmentResults.career_readiness && (
              <section className="border-t pt-10">
                <h3 className="text-2xl font-black mb-6">🚀 ความพร้อมทางอาชีพ</h3>
                <div className="grid md:grid-cols-3 gap-6">
                  {Object.entries(calcReadinessScores(assessmentResults.career_readiness)).map(([k, v]) => (
                    <div key={k} className="bg-slate-900 text-white p-8 rounded-3xl text-center">
                      <p className="text-[10px] text-indigo-400 font-black mb-2">ด้าน{k}</p>
                      <p className="text-5xl font-black">{v}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
          
          <div className="mt-20 pt-10 border-t flex gap-4 no-print">
            <button onClick={() => setView('select')} className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">กลับไปทำส่วนที่เหลือ</button>
            <button onClick={() => { localStorage.removeItem('career_last_user'); setView('home'); }} className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black">ออกจากระบบ</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

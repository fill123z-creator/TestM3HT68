
import React, { useState, useMemo, useEffect } from 'react';
import { STUDENT_DATA, ASSESSMENTS } from './constants';
import { ViewState, StudentInfo } from './types';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('home');
  const [consent, setConsent] = useState(false);
  
  const [localRegistry, setLocalRegistry] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('career_student_registry');
    return saved ? JSON.parse(saved) : STUDENT_DATA;
  });

  const [studentInfo, setStudentInfo] = useState<StudentInfo>({ name: '', class: '' });
  
  const [allResultsStore, setAllResultsStore] = useState<Record<string, Record<string, any[]>>>(() => {
    const saved = localStorage.getItem('career_assessment_store');
    return saved ? JSON.parse(saved) : {};
  });

  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [tempAnswers, setTempAnswers] = useState<any[]>([]);

  const studentKey = useMemo(() => {
    if (!studentInfo.name || !studentInfo.class) return '';
    return `${studentInfo.name.trim()}-${studentInfo.class.trim()}`;
  }, [studentInfo]);
  
  const assessmentResults = useMemo(() => {
    return studentKey ? (allResultsStore[studentKey] || {}) : {};
  }, [allResultsStore, studentKey]);

  const currentAssessment = useMemo(() => currentKey ? (ASSESSMENTS as any)[currentKey] : null, [currentKey]);

  useEffect(() => {
    localStorage.setItem('career_student_registry', JSON.stringify(localRegistry));
  }, [localRegistry]);

  useEffect(() => {
    localStorage.setItem('career_assessment_store', JSON.stringify(allResultsStore));
  }, [allResultsStore]);

  useEffect(() => {
    const lastUser = localStorage.getItem('career_last_user');
    if (lastUser) {
      const parsed = JSON.parse(lastUser);
      setStudentInfo(parsed);
      setConsent(true);
    }
  }, []);

  // --- Logic คำนวณและแปรผล ---
  
  const getGoalAnalysis = (answers: number[]) => {
    const avg = answers.reduce((sum, ans) => sum + (5 - ans), 0) / answers.length;
    const score = parseFloat(avg.toFixed(2));
    let label = "";
    if (score >= 4.21) label = "มากที่สุด";
    else if (score >= 3.41) label = "มาก";
    else if (score >= 2.61) label = "ปานกลาง";
    else if (score >= 1.81) label = "น้อย";
    else label = "น้อยที่สุด";
    return { score, label };
  };

  const calcRIASCOres = (answers: number[]) => {
    const categories = ['R', 'I', 'A', 'S', 'E', 'C'];
    const scores: Record<string, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
    answers.forEach((ans, i) => {
      scores[categories[i % 6]] += (2 - ans);
    });
    Object.keys(scores).forEach(k => scores[k] = parseFloat((scores[k] / 18 * 10).toFixed(2)));
    return scores;
  };

  const calcIntelligenceScores = (answers: number[]) => {
    const categories = ["ดนตรี", "กายเคลื่อนไหว", "ตรรกะคณิตศาสตร์", "ภาษา", "ภาพ-มิติสัมพันธ์", "มนุษยสัมพันธ์", "ธรรมชาติแวดล้อม", "เข้าใจตนเอง"];
    const scores: Record<string, number> = {};
    categories.forEach(c => scores[c] = 0);
    answers.forEach((ans, i) => {
      scores[categories[i % 8]] += (3 - ans);
    });
    Object.keys(scores).forEach(k => scores[k] = parseFloat((scores[k] / 30 * 10).toFixed(2)));
    return scores;
  };

  const calcReadinessScores = (answers: any[]) => {
    const rawScores = { Data: 0, Person: 0, Tool: 0 };
    answers.forEach((ans) => {
      if (ans.rank1 === 0) rawScores.Data += 2; else if (ans.rank1 === 1) rawScores.Person += 2; else if (ans.rank1 === 2) rawScores.Tool += 2;
      if (ans.rank2 === 0) rawScores.Data += 1; else if (ans.rank2 === 1) rawScores.Person += 1; else if (ans.rank2 === 2) rawScores.Tool += 1;
    });
    return {
      Data: parseFloat(((rawScores.Data / 36) * 10).toFixed(2)),
      Person: parseFloat(((rawScores.Person / 36) * 10).toFixed(2)),
      Tool: parseFloat(((rawScores.Tool / 36) * 10).toFixed(2))
    };
  };

  const calcEQScores = (answers: number[]) => {
    const assessment = ASSESSMENTS.eq_assessment;
    const group1 = assessment.group1;
    const itemScores = answers.map((ans, i) => group1.includes(i + 1) ? (4 - ans) : (ans + 1));
    const result: any = {};
    Object.entries(assessment.dimensions).forEach(([dKey, d]: [string, any]) => {
      result[dKey] = { name: d.name, total: 0, subdimensions: {}, range: d.range };
      Object.entries(d.subdimensions).forEach(([sKey, s]: [string, any]) => {
        const subTotal = (s.questions as number[]).reduce((sum, q) => sum + itemScores[q - 1], 0);
        result[dKey].subdimensions[sKey] = {
          name: s.name, score: subTotal, range: s.range,
          interpretation: subTotal < s.range[0] ? 'ต่ำกว่าเกณฑ์' : (subTotal > s.range[1] ? 'สูงกว่าเกณฑ์' : 'ปกติ')
        };
        result[dKey].total += subTotal;
      });
      result[dKey].interpretation = result[dKey].total < d.range[0] ? 'ต่ำกว่าเกณฑ์' : (result[dKey].total > d.range[1] ? 'สูงกว่าเกณฑ์' : 'ปกติ');
    });
    return result;
  };

  const handleCustomInfoSubmit = () => {
    const nameTrimmed = studentInfo.name.trim();
    if (!nameTrimmed || !studentInfo.class) return;
    setLocalRegistry(prev => {
      const currentClassList = prev[studentInfo.class] || [];
      if (!currentClassList.includes(nameTrimmed)) {
        return { ...prev, [studentInfo.class]: [...currentClassList, nameTrimmed] };
      }
      return prev;
    });
    const finalUser = { ...studentInfo, name: nameTrimmed };
    setStudentInfo(finalUser);
    localStorage.setItem('career_last_user', JSON.stringify(finalUser));
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

  const handleNext = () => {
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
      setAllResultsStore(prev => ({
        ...prev,
        [studentKey]: { ...(prev[studentKey] || {}), [currentKey!]: [...tempAnswers] }
      }));
      setView('results');
    }
  };

  const handleRankingChange = (rank: number, optionIdx: number) => {
    const newAnswers = [...tempAnswers];
    const current = { ...newAnswers[questionIdx] };
    if (current.rank1 === optionIdx) current.rank1 = null;
    if (current.rank2 === optionIdx) current.rank2 = null;
    if (current.rank3 === optionIdx) current.rank3 = null;
    if (rank === 1) current.rank1 = optionIdx;
    if (rank === 2) current.rank2 = optionIdx;
    if (rank === 3) current.rank3 = optionIdx;
    newAnswers[questionIdx] = current;
    setTempAnswers(newAnswers);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 font-['Sarabun']">
      {view === 'home' && (
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 text-center fade-in">
          <div className="text-6xl mb-4">🎓</div>
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-2 tracking-tight">ระบบประเมินและแนะแนวอาชีพ</h1>
          <p className="text-xl font-bold text-slate-700 mb-2">สำหรับนักเรียนชั้นมัธยมศึกษาปีที่ 3 โรงเรียนหารเทารังสีประชาสรรค์</p>
          <p className="text-sm font-bold text-slate-400 mb-8 uppercase tracking-widest">สร้างโดย งานแนะแนว</p>
          
          <div className="grid md:grid-cols-2 gap-6 mb-8 text-left">
            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 shadow-sm">
              <div className="text-3xl mb-3">📊</div>
              <h3 className="font-bold text-lg text-blue-900 mb-2">แบบประเมิน 5 ด้าน</h3>
              <p className="text-sm text-blue-700">ประเมินตนเอง, พหุปัญญา, EQ, RIASEC และความพร้อมทางอาชีพ</p>
            </div>
            <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100 shadow-sm">
              <div className="text-3xl mb-3">🎯</div>
              <h3 className="font-bold text-lg text-purple-900 mb-2">บันทึกข้อมูลส่วนตัว</h3>
              <p className="text-sm text-purple-700">ข้อมูลจะถูกเก็บไว้อย่างปลอดภัยในเบราว์เซอร์นี้</p>
            </div>
          </div>
          <div className="space-y-6">
            <label className="flex items-start space-x-3 cursor-pointer group text-left max-w-2xl mx-auto">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500" />
              <span className="text-sm text-gray-700">ข้าพเจ้ายินยอมให้ใช้ข้อมูลเพื่อการประเมินและวิเคราะห์ผลตามวัตถุประสงค์ของระบบ</span>
            </label>
            <button onClick={() => setView('info')} disabled={!consent} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 px-8 rounded-2xl font-bold text-xl hover:shadow-xl transition-all disabled:opacity-50 shadow-lg shadow-indigo-100">เข้าสู่ระบบนักเรียน</button>
          </div>
        </div>
      )}

      {(view === 'info' || view === 'customInfo') && (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-2xl p-8 md:p-12 fade-in">
          <button onClick={() => setView('home')} className="mb-6 text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-2 group transition-all">
             <span className="group-hover:-translate-x-1 transition-transform inline-block">←</span> กลับหน้าแรก
          </button>
          <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">{view === 'info' ? 'เข้าสู่ระบบนักเรียน' : 'เพิ่มรายชื่อใหม่'}</h2>
          {view === 'info' ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-widest">เลือกห้องเรียน *</label>
                <select className="w-full px-5 py-4 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 outline-none bg-gray-50 transition-all font-bold text-slate-700" value={studentInfo.class} onChange={(e) => setStudentInfo({ ...studentInfo, class: e.target.value, name: '' })}>
                  <option value="">-- เลือกห้อง --</option>
                  {Object.keys(localRegistry).map(c => <option key={c} value={c}>มัธยมศึกษาปีที่ {c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-widest">ชื่อ-นามสกุล *</label>
                <select disabled={!studentInfo.class} className="w-full px-5 py-4 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 outline-none bg-gray-50 disabled:bg-gray-100 transition-all font-bold text-slate-700" value={studentInfo.name} onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })}>
                  <option value="">{studentInfo.class ? 'ค้นหารายชื่อในระบบ...' : 'กรุณาเลือกห้องก่อน'}</option>
                  {studentInfo.class && localRegistry[studentInfo.class].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button onClick={() => studentInfo.name && setView('select')} disabled={!studentInfo.name} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-8 rounded-2xl font-bold text-lg hover:shadow-xl transition-all disabled:opacity-50 shadow-lg shadow-indigo-100">เข้าสู่ระบบ</button>
              <div className="relative py-4"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div><div className="relative flex justify-center text-xs"><span className="px-3 bg-white text-gray-400 font-bold uppercase tracking-widest">หรือ</span></div></div>
              <button onClick={() => setView('customInfo')} className="w-full bg-slate-100 text-slate-600 py-4 px-8 rounded-2xl font-bold text-lg hover:bg-slate-200 transition-all"> ➕ เพิ่มชื่อใหม่ </button>
            </div>
          ) : (
            <div className="space-y-6">
               <div>
                <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-widest">เลือกห้องที่จะบันทึกชื่อ *</label>
                <select className="w-full px-5 py-4 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 outline-none bg-gray-50 font-bold text-slate-700" value={studentInfo.class} onChange={(e) => setStudentInfo({ ...studentInfo, class: e.target.value })}>
                  <option value="">-- เลือกห้อง --</option>
                  {Object.keys(localRegistry).map(c => <option key={c} value={c}>มัธยมศึกษาปีที่ {c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-widest">กรอกชื่อ-นามสกุล *</label>
                <input type="text" placeholder="ระบุชื่อและนามสกุล..." className="w-full px-5 py-4 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 outline-none bg-gray-50 font-bold text-slate-700" value={studentInfo.name} onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })} />
              </div>
              <button onClick={handleCustomInfoSubmit} disabled={!studentInfo.name.trim() || !studentInfo.class} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-8 rounded-2xl font-bold text-lg disabled:opacity-50 shadow-lg shadow-indigo-100 transition-all">บันทึกชื่อและเข้าสู่ระบบ</button>
            </div>
          )}
        </div>
      )}

      {view === 'select' && (
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 fade-in">
          <div className="flex justify-between items-center mb-10 border-b border-gray-100 pb-6">
            <div className="text-left">
               <button onClick={() => setView('info')} className="mb-2 text-indigo-600 hover:text-indigo-800 font-bold text-sm flex items-center gap-1 group"> 
                <span className="group-hover:-translate-x-1 transition-transform inline-block">←</span> เปลี่ยนผู้ใช้งาน 
               </button>
               <h2 className="text-3xl font-bold text-gray-800 tracking-tight">เลือกแบบประเมิน</h2>
               <p className="text-gray-500 mt-1 font-medium">ยินดีต้อนรับ: <span className="text-indigo-600 font-bold">{studentInfo.name}</span> (ชั้น ม.{studentInfo.class})</p>
            </div>
            <div className="text-right no-print">
               <button onClick={() => { localStorage.removeItem('career_last_user'); setStudentInfo({name:'', class:''}); setView('home'); }} className="text-xs text-rose-500 font-bold border-2 border-rose-100 px-4 py-2 rounded-xl hover:bg-rose-50 transition-colors uppercase tracking-widest">LOGOUT</button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.values(ASSESSMENTS).map(assessment => {
              const completed = !!assessmentResults[assessment.key];
              return (
                <div key={assessment.key} onClick={() => handleStartAssessment(assessment.key)} className={`p-6 rounded-3xl border-2 cursor-pointer transition-all hover:-translate-y-2 hover:shadow-2xl ${completed ? 'border-green-500 bg-green-50/50' : 'border-gray-50 bg-white hover:border-indigo-100 shadow-sm'}`}>
                  <div className="text-5xl mb-4">{assessment.icon}</div>
                  <h3 className="font-bold text-xl mb-2 text-gray-800 leading-tight">{assessment.title}</h3>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-gray-400 font-bold text-sm">{assessment.questions.length} ข้อ</span>
                    <span className={`font-black px-4 py-1.5 rounded-full text-[10px] uppercase tracking-widest ${completed ? 'bg-green-600 text-white shadow-md' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'}`}>
                      {completed ? '✓ เสร็จแล้ว' : 'เริ่มทำ →'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-12">
            <button onClick={() => setView('results')} className="w-full bg-indigo-900 text-white py-5 rounded-2xl font-black text-lg hover:bg-black shadow-xl shadow-indigo-100 transition-all uppercase tracking-widest">📊 ดูสรุปผลรายงานทั้งหมด</button>
          </div>
        </div>
      )}

      {view === 'assessment' && currentAssessment && (
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl p-8 md:p-12 fade-in">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setView('select')} className="text-indigo-600 font-black text-sm flex items-center gap-1 hover:text-indigo-800 group transition-all">
               <span className="group-hover:-translate-x-1 transition-transform inline-block">←</span> กลับ Dashboard
            </button>
            <div className="bg-indigo-50 px-4 py-1 rounded-full border border-indigo-100">
              <span className="text-indigo-600 font-black text-sm">{questionIdx + 1} / {currentAssessment.questions.length}</span>
            </div>
          </div>
          <div className="w-full bg-gray-100 h-2.5 rounded-full mb-10 overflow-hidden shadow-inner">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 h-full transition-all duration-500" style={{ width: `${((questionIdx + 1) / currentAssessment.questions.length) * 100}%` }}></div>
          </div>
          <div className="mb-10 min-h-[200px]">
            <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mb-10 leading-snug">{currentAssessment.questions[questionIdx]}</h3>
            {currentAssessment.type === 'readiness' ? (
              <div className="space-y-6">
                <div className="border-2 border-slate-50 rounded-3xl overflow-hidden shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-4 bg-slate-50">
                    <div className="hidden md:flex p-4 items-center justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r">ตัวเลือก</div>
                    <div className="bg-indigo-600 text-white p-4 text-center text-[10px] font-black uppercase tracking-widest">ชอบที่สุด (2)</div>
                    <div className="bg-amber-500 text-white p-4 text-center text-[10px] font-black uppercase tracking-widest">ไม่แน่ใจ (1)</div>
                    <div className="bg-gray-400 text-white p-4 text-center text-[10px] font-black uppercase tracking-widest">ไม่ชอบ (0)</div>
                    {(currentAssessment.options[questionIdx] as string[]).map((opt, i) => (
                      <React.Fragment key={i}>
                        <div className="p-5 bg-white border-b md:border-b-0 md:border-r text-sm font-bold text-slate-700 flex items-center leading-relaxed">{opt}</div>
                        <div className="flex justify-center items-center p-4 bg-indigo-50/20 border-b md:border-b-0 md:border-r">
                           <input type="radio" checked={tempAnswers[questionIdx].rank1 === i} onChange={() => handleRankingChange(1, i)} className="w-9 h-9 cursor-pointer accent-indigo-600" />
                        </div>
                        <div className="flex justify-center items-center p-4 bg-amber-50/20 border-b md:border-b-0 md:border-r">
                           <input type="radio" checked={tempAnswers[questionIdx].rank2 === i} onChange={() => handleRankingChange(2, i)} className="w-9 h-9 cursor-pointer accent-amber-500" />
                        </div>
                        <div className="flex justify-center items-center p-4 bg-gray-50 border-b md:border-b-0">
                           <input type="radio" checked={tempAnswers[questionIdx].rank3 === i} onChange={() => handleRankingChange(3, i)} className="w-9 h-9 cursor-pointer accent-slate-500" />
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                {(() => {
                  const options = Array.isArray(currentAssessment.options[0]) 
                    ? currentAssessment.options[questionIdx] as string[]
                    : currentAssessment.options as string[];
                  return options.map((opt, i) => (
                    <label key={i} className={`flex items-center space-x-5 p-6 border-2 rounded-2xl cursor-pointer transition-all ${tempAnswers[questionIdx] === i ? 'border-indigo-600 bg-indigo-50 shadow-md ring-1 ring-indigo-200' : 'border-gray-50 bg-white hover:border-gray-100 hover:bg-gray-50'}`}>
                      <input type="radio" name="answer" checked={tempAnswers[questionIdx] === i} onChange={() => { const newAns = [...tempAnswers]; newAns[questionIdx] = i; setTempAnswers(newAns); }} className="w-7 h-7 cursor-pointer accent-indigo-600" />
                      <span className="font-bold text-slate-700 text-lg md:text-xl">{opt}</span>
                    </label>
                  ));
                })()}
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <button disabled={questionIdx === 0} onClick={() => setQuestionIdx(idx => idx - 1)} className="flex-1 py-5 border-2 border-slate-100 rounded-2xl font-black text-slate-400 hover:bg-slate-50 transition-all disabled:opacity-20 uppercase tracking-widest text-sm">ถอยหลัง</button>
            <button onClick={handleNext} className="flex-[2] py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all uppercase tracking-widest">
               {questionIdx === currentAssessment.questions.length - 1 ? 'บันทึกข้อมูล' : 'ข้อถัดไป →'}
            </button>
          </div>
        </div>
      )}

      {view === 'results' && (
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 fade-in">
          <div className="flex justify-between items-start mb-8 no-print">
            <button onClick={() => setView('select')} className="text-indigo-600 font-black text-sm flex items-center gap-1 hover:text-indigo-800 group transition-all">
               <span className="group-hover:-translate-x-1 transition-transform inline-block">←</span> กลับ Dashboard
            </button>
            <button onClick={() => window.print()} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-sm hover:shadow-xl transition-all flex items-center gap-2">
              🖨️ พิมพ์รายงาน
            </button>
          </div>
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black text-gray-800 tracking-tight">รายงานวิเคราะห์ศักยภาพรายบุคคล</h2>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <div className="bg-indigo-900 text-white px-8 py-3 rounded-2xl shadow-lg">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">นักเรียน</p>
                <p className="text-2xl font-bold">{studentInfo.name}</p>
              </div>
              <div className="bg-indigo-100 text-indigo-900 px-8 py-3 rounded-2xl border border-indigo-200">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">ชั้นเรียน</p>
                <p className="text-2xl font-bold">มัธยมศึกษาปีที่ {studentInfo.class}</p>
              </div>
            </div>
          </div>
          <div className="space-y-24">
            {assessmentResults.goal_setting && (
              <section className="border-t pt-12">
                <h3 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4">
                  <span className="bg-indigo-600 text-white w-10 h-10 rounded-xl flex items-center justify-center text-lg">1</span>
                  แบบประเมินตนเอง (เป้าหมายและการเรียน)
                </h3>
                <div className="bg-slate-50 p-8 rounded-3xl flex flex-col md:flex-row items-center gap-10 border border-slate-100">
                  <div className="relative">
                    <svg className="w-40 h-40 transform -rotate-90">
                      <circle cx="80" cy="80" r="74" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-200"/>
                      <circle cx="80" cy="80" r="74" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={464.9} strokeDashoffset={464.9 - (getGoalAnalysis(assessmentResults.goal_setting).score / 5 * 464.9)} className="text-indigo-600 transition-all duration-1000"/>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-5xl font-black text-indigo-600">{getGoalAnalysis(assessmentResults.goal_setting).score}</span>
                    </div>
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">ผลการวิเคราะห์ระดับความพร้อม:</p>
                    <div className="inline-block bg-indigo-600 text-white px-8 py-2.5 rounded-full font-black text-2xl shadow-lg mb-4">
                      {getGoalAnalysis(assessmentResults.goal_setting).label}
                    </div>
                    <p className="text-slate-500 font-bold leading-relaxed text-lg">ระดับความมุ่งมั่นและเป้าหมายในการเรียนต่อ</p>
                  </div>
                </div>
              </section>
            )}
            {assessmentResults.multiple_intelligence && (
              <section className="border-t pt-12">
                <h3 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4">
                  <span className="bg-purple-600 text-white w-10 h-10 rounded-xl flex items-center justify-center text-lg">2</span>
                  แบบสำรวจพหุปัญญา (ความถนัด 8 ด้าน)
                </h3>
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                  {Object.entries(calcIntelligenceScores(assessmentResults.multiple_intelligence)).sort((a,b) => b[1] - a[1]).map(([name, score], i) => (
                    <div key={name} className="flex items-center gap-4">
                      <div className="w-44 text-sm font-black text-slate-600 truncate">{name}</div>
                      <div className="flex-1 bg-slate-100 h-6 rounded-full overflow-hidden border border-slate-50">
                        <div className={`h-full transition-all duration-1000 ${i < 3 ? 'bg-gradient-to-r from-purple-600 to-indigo-600' : 'bg-slate-300'}`} style={{ width: `${score * 10}%` }}></div>
                      </div>
                      <div className="w-14 text-right font-black text-purple-600 text-lg">{score}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {assessmentResults.eq_assessment && (
              <section className="border-t pt-12">
                <h3 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4">
                  <span className="bg-rose-600 text-white w-10 h-10 rounded-xl flex items-center justify-center text-lg">3</span>
                  แบบประเมินความฉลาดทางอารมณ์ (EQ)
                </h3>
                <div className="grid gap-10">
                  {Object.entries(calcEQScores(assessmentResults.eq_assessment)).map(([key, val]: [string, any]) => (
                    <div key={key} className="bg-slate-50 p-8 rounded-3xl border-2 border-slate-100">
                      <div className="flex justify-between items-center mb-8">
                        <h4 className="text-3xl font-black text-slate-800">ด้าน{val.name}</h4>
                        <div className="text-right">
                          <span className="text-6xl font-black text-indigo-600">{val.total}</span>
                          <span className={`block px-5 py-1.5 rounded-full text-[11px] font-black uppercase mt-3 shadow-md ${val.interpretation === 'ปกติ' ? 'bg-green-600 text-white' : 'bg-rose-500 text-white'}`}>
                            {val.interpretation}
                          </span>
                        </div>
                      </div>
                      <div className="grid md:grid-cols-3 gap-6">
                        {Object.entries(val.subdimensions).map(([sKey, sVal]: [string, any]) => (
                          <div key={sKey} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{sVal.name}</p>
                            <div className="flex justify-between items-end">
                              <span className="text-4xl font-black text-slate-800">{sVal.score}</span>
                              <div className="text-right"><span className={`text-[10px] font-bold px-4 py-1.5 rounded-xl ${sVal.interpretation === 'ปกติ' ? 'text-green-600 bg-green-50' : 'text-rose-600 bg-rose-50'}`}>{sVal.interpretation}</span></div>
                            </div>
                            <p className="text-[10px] text-slate-300 font-bold mt-3 text-right">เกณฑ์: {sVal.range[0]}-{sVal.range[1]}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {assessmentResults.riasec_assessment && (
              <section className="border-t pt-12">
                <h3 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4">
                  <span className="bg-emerald-600 text-white w-10 h-10 rounded-xl flex items-center justify-center text-lg">4</span>
                  แบบวัดความสนใจในอาชีพ (RIASEC)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
                  {Object.entries(calcRIASCOres(assessmentResults.riasec_assessment)).map(([key, val]) => (
                    <div key={key} className="bg-white border-2 border-slate-50 p-8 rounded-[2.5rem] text-center hover:shadow-2xl transition-all group">
                      <p className="text-6xl font-black text-emerald-600 group-hover:scale-110 transition-transform">{val}</p>
                      <p className="text-6xl font-black text-slate-300 mt-4 uppercase tracking-tighter group-hover:text-emerald-200">{key}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {assessmentResults.career_readiness && (
              <section className="border-t pt-12">
                <h3 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4">
                  <span className="bg-amber-500 text-white w-10 h-10 rounded-xl flex items-center justify-center text-lg">5</span>
                  แบบทดสอบความพร้อมทางอาชีพ
                </h3>
                <div className="grid md:grid-cols-3 gap-8">
                  {Object.entries(calcReadinessScores(assessmentResults.career_readiness)).map(([key, val]) => (
                    <div key={key} className="bg-slate-900 text-white p-12 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                      <p className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] mb-6">ด้าน{key === 'Data' ? 'ข้อมูล' : key === 'Person' ? 'บุคคล' : 'เครื่องมือ'}</p>
                      <div className="text-7xl font-black mb-8">{val}</div>
                      <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden mb-4">
                         <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000" style={{ width: `${(val / 10) * 100}%` }}></div>
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">คะแนนเต็ม 10.00</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
          <div className="mt-24 pt-10 border-t flex flex-col md:flex-row gap-5 no-print">
            <button onClick={() => setView('select')} className="flex-1 py-6 bg-indigo-600 text-white rounded-3xl font-black text-xl hover:shadow-2xl hover:-translate-y-1 transition-all uppercase tracking-widest shadow-lg">ทำข้อสอบที่เหลือ</button>
            <button onClick={() => { localStorage.removeItem('career_last_user'); setView('home'); }} className="flex-1 py-6 bg-slate-100 text-slate-600 rounded-3xl font-black text-xl hover:bg-slate-200 transition-all uppercase tracking-widest">ออกจากระบบ</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

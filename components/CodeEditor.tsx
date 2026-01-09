
import React from 'react';

interface CodeEditorProps {
  code: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ code, onChange, readOnly = false }) => {
  return (
    <div className="relative w-full h-full bg-[#1e293b] rounded-lg overflow-hidden border border-slate-700 shadow-xl flex flex-col">
      <div className="flex items-center px-4 py-2 bg-slate-800/50 border-b border-slate-700 justify-between">
        <div className="flex space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
        </div>
        <span className="text-xs text-slate-400 font-medium uppercase tracking-widest">Source Code</span>
      </div>
      <div className="flex-1 relative">
        <textarea
          value={code}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          spellCheck={false}
          className="absolute inset-0 w-full h-full p-4 bg-transparent text-slate-300 font-mono text-sm leading-relaxed outline-none resize-none z-10"
          placeholder="// Paste your code here..."
        />
        <div className="absolute inset-0 p-4 pointer-events-none overflow-hidden whitespace-pre-wrap font-mono text-sm">
          {/* Simple simulated syntax highlight could go here, but for now we keep it clean */}
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;

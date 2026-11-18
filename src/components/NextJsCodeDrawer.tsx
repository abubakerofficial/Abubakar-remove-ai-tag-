import React, { useState } from 'react';
import { Copy, Check, FileCode2, FolderTree } from 'lucide-react';
import { NEXTJS_BLUEPRINT_FILES } from '../utils/nextjsBlueprint';

export const NextJsCodeDrawer: React.FC = () => {
  const [activeTabId, setActiveTabId] = useState<string>(NEXTJS_BLUEPRINT_FILES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeFile =
    NEXTJS_BLUEPRINT_FILES.find((f) => f.id === activeTabId) ||
    NEXTJS_BLUEPRINT_FILES[0];

  const handleCopy = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  return (
    <section
      id="nextjs-blueprint"
      aria-label="Next.js 14 Full-Stack Source Code"
      className="rounded-xl border border-slate-800 bg-[#0F1624] overflow-hidden"
    >
      <div className="px-6 py-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 font-display">
            Next.js 14 App Router Full-Stack Implementation Blueprint
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Complete production source code for the Next.js 14 project structure, frontend upload page, fluent-ffmpeg API route, and package.json.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleCopy(activeFile.id, activeFile.code)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {copiedId === activeFile.id ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied {activeFile.path}</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy {activeFile.path}</span>
            </>
          )}
        </button>
      </div>

      <div className="px-6 py-3 bg-[#090D16]/60 border-b border-slate-800 flex flex-wrap items-center gap-2">
        {NEXTJS_BLUEPRINT_FILES.map((file) => {
          const isActive = file.id === activeFile.id;
          return (
            <button
              key={file.id}
              type="button"
              onClick={() => setActiveTabId(file.id)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              {file.id === 'structure' ? (
                <FolderTree className="w-3.5 h-3.5" />
              ) : (
                <FileCode2 className="w-3.5 h-3.5" />
              )}
              <span>{file.title}</span>
            </button>
          );
        })}
      </div>

      <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-xs text-slate-400">
        <span>{activeFile.description}</span>
        <span className="font-mono text-slate-300">{activeFile.path}</span>
      </div>

      <pre className="p-6 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[460px] overflow-y-auto bg-[#070A12]">
        <code>{activeFile.code}</code>
      </pre>
    </section>
  );
};

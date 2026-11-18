import React from 'react';
import { ShieldAlert, ShieldCheck, Check } from 'lucide-react';
import { DetectedMetadataTag, formatBytes } from '../utils/metadataAnalyzer';

interface MetadataInspectorProps {
  fileName: string;
  originalSize: number;
  cleanSize: number | null;
  durationMs: number | null;
  detectedTags: DetectedMetadataTag[];
  isCleaned: boolean;
}

export const MetadataInspector: React.FC<MetadataInspectorProps> = ({
  fileName,
  originalSize,
  cleanSize,
  durationMs,
  detectedTags,
  isCleaned,
}) => {
  const bytesRemoved =
    cleanSize !== null ? Math.max(0, originalSize - cleanSize) : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0F1624] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 font-display">
            MP4 Container Atom &amp; AI Signature Audit
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Target file: <span className="font-mono text-slate-300">{fileName}</span>
            <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
            Original: <span className="font-mono tabular-nums text-slate-300">{formatBytes(originalSize)}</span>
            {cleanSize !== null && (
              <>
                <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
                Clean: <span className="font-mono tabular-nums text-emerald-400">{formatBytes(cleanSize)}</span>
              </>
            )}
            {durationMs !== null && (
              <>
                <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
                Processed in <span className="font-mono tabular-nums text-slate-200">{durationMs} ms</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium">
          {isCleaned ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>0 AI Signatures Remaining (Verified Clean)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-amber-400">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{detectedTags.length} Metadata Signatures Detected</span>
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800/80 text-[11px] font-medium text-slate-400 bg-slate-900/40">
              <th className="py-2.5 px-5">Source / Platform</th>
              <th className="py-2.5 px-4">Metadata Tag &amp; Atom Box</th>
              <th className="py-2.5 px-4">Before (Uploaded MP4)</th>
              <th className="py-2.5 px-5 text-right">After (Clean Output)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {detectedTags.map((tag) => (
              <tr key={`${tag.platform}-${tag.key}`} className="hover:bg-slate-800/20 transition-colors">
                <td className="py-3 px-5 font-medium text-slate-200 whitespace-nowrap">
                  {tag.platform}
                </td>
                <td className="py-3 px-4">
                  <div className="text-slate-200 font-medium">{tag.key}</div>
                  <div className="font-mono text-[11px] text-slate-400">{tag.atomPath}</div>
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-rose-300/90 max-w-xs truncate">
                  {tag.rawValue}
                </td>
                <td className="py-3 px-5 text-right whitespace-nowrap">
                  {isCleaned ? (
                    <span className="inline-flex items-center justify-end gap-1.5 font-mono text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                      <span>STRIPPED (0x00)</span>
                    </span>
                  ) : (
                    <span className="font-mono text-amber-400/90">
                      Queued for purge
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bytesRemoved !== null && (
        <div className="px-5 py-3 bg-[#090D16]/70 border-t border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-400">
          <span>Privacy Protected · Zero Server Retention</span>
          <span className="font-mono tabular-nums text-[11px] text-emerald-400">
            Video &amp; Audio Bitstream: 100% Original Quality
          </span>
        </div>
      )}
    </div>
  );
};

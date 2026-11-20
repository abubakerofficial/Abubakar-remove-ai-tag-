import React from 'react';
import { ShieldAlert, ShieldCheck, Check, Camera, Smartphone } from 'lucide-react';
import {
  DetectedMetadataTag,
  MediaKind,
  formatBytes,
} from '../utils/metadataAnalyzer';
import { CameraProfile } from '../utils/cameraProfiles';

interface MetadataInspectorProps {
  fileName: string;
  mediaKind: MediaKind;
  originalSize: number;
  cleanSize: number | null;
  durationMs: number | null;
  detectedTags: DetectedMetadataTag[];
  isCleaned: boolean;
  cameraProfile: CameraProfile;
}

export const MetadataInspector: React.FC<MetadataInspectorProps> = ({
  fileName,
  mediaKind,
  originalSize,
  cleanSize,
  durationMs,
  detectedTags,
  isCleaned,
  cameraProfile,
}) => {
  const bytesRemoved =
    cleanSize !== null ? Math.max(0, originalSize - cleanSize) : null;
  const hasCameraInjection = cameraProfile.id !== 'none';

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0F1624] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 font-display">
            {mediaKind === 'image'
              ? 'Picture EXIF / XMP / C2PA Signature Audit'
              : 'MP4 Container Atom & AI Signature Audit'}
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
              <span>
                {hasCameraInjection
                  ? `0 AI Tags · ${cameraProfile.shortLabel} Injected`
                  : '0 AI Signatures Remaining (Verified Clean)'}
              </span>
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
              <th className="py-2.5 px-4">Metadata Tag &amp; Segment</th>
              <th className="py-2.5 px-4">
                {mediaKind === 'image' ? 'Before (Uploaded Picture)' : 'Before (Uploaded Video)'}
              </th>
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

            {hasCameraInjection && (
              <tr className="bg-emerald-950/15 hover:bg-emerald-950/25 transition-colors">
                <td className="py-3 px-5 font-medium text-emerald-300 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {cameraProfile.category === 'mobile' ? (
                      <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span>{cameraProfile.badgeText}</span>
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="text-slate-100 font-medium">
                    {mediaKind === 'image'
                      ? 'EXIF:Make / Model / LensModel / Software'
                      : 'QuickTime:Make / Model / Lens / Handler'}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {mediaKind === 'image'
                      ? 'APP1:EXIF IFD0 + ExifIFD / PNG:eXIf'
                      : 'moov.meta.keys / com.apple.quicktime.*'}
                  </div>
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                  {cameraProfile.make} {cameraProfile.model} · {cameraProfile.lensModel}
                </td>
                <td className="py-3 px-5 text-right whitespace-nowrap">
                  {isCleaned ? (
                    <span className="inline-flex items-center justify-end gap-1.5 font-mono text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                      <span>INJECTED</span>
                    </span>
                  ) : (
                    <span className="font-mono text-emerald-400/80">
                      Queued for auto-inject
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {bytesRemoved !== null && (
        <div className="px-5 py-3 bg-[#090D16]/70 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>
            Privacy Protected · Zero Server Retention
            {hasCameraInjection && (
              <>
                <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
                <span className="text-emerald-300">
                  Hardware ID: {cameraProfile.make} {cameraProfile.model} ({cameraProfile.software})
                </span>
              </>
            )}
          </span>
          <span className="font-mono tabular-nums text-[11px] text-emerald-400">
            {mediaKind === 'image'
              ? 'Image Pixels: 100% Original Quality'
              : 'Video & Audio Bitstream: 100% Original Quality'}
          </span>
        </div>
      )}
    </div>
  );
};


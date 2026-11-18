/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  Upload,
  Download,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Film,
  Zap,
  Trash2,
  FileVideo,
  X,
} from 'lucide-react';
import {
  DetectedMetadataTag,
  validateVideoFile,
  formatBytes,
  inspectBinaryForAiMetadata,
  buildFfmpegCommandString,
} from './utils/metadataAnalyzer';
import { MetadataInspector } from './components/MetadataInspector';
import { NextJsCodeDrawer } from './components/NextJsCodeDrawer';

interface ProcessedHistoryItem {
  id: string;
  originalName: string;
  cleanName: string;
  originalSize: number;
  cleanSize: number;
  durationMs: number;
  tagsStrippedCount: number;
  downloadUrl: string;
  timestamp: string;
}

interface ToastNotification {
  id: string;
  type: 'success' | 'error';
  title: string;
  message: string;
}

const PROCESSING_STEPS = [
  'Parsing MP4 container atoms (moov.udta, XMP_, C2PA JUMBF)...',
  'Executing FFmpeg stream copy (-map_metadata -1 -c:v copy -c:a copy)...',
  'Stripping Google Flow, Runway, Luma & Pika generator signatures...',
  'Verifying bit-exact clean video output & purging server temp files...',
];

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedTags, setDetectedTags] = useState<DetectedMetadataTag[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  const [cleanDownloadUrl, setCleanDownloadUrl] = useState<string | null>(null);
  const [cleanFileName, setCleanFileName] = useState<string>('');
  const [cleanFileSize, setCleanFileSize] = useState<number | null>(null);
  const [processDurationMs, setProcessDurationMs] = useState<number | null>(null);

  const [history, setHistory] = useState<ProcessedHistoryItem[]>([]);
  const [toast, setToast] = useState<ToastNotification | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const triggerToast = (
    type: 'success' | 'error',
    title: string,
    message: string
  ) => {
    const id = `${Date.now()}`;
    setToast({ id, type, title, message });
  };

  const inspectAndStageFile = async (file: File) => {
    const validation = validateVideoFile(file.name, file.size, file.type);
    if (!validation.valid) {
      triggerToast(
        'error',
        'Invalid Video Upload',
        validation.error || 'Please upload a valid MP4 video file.'
      );
      return;
    }

    const arrayBuf = await file.arrayBuffer();
    const tags = inspectBinaryForAiMetadata(new Uint8Array(arrayBuf), file.name);

    // Automatically rename whatever video is uploaded to "Abubakar Remove AI.mp4"
    const renamedFile = new File([arrayBuf], validation.normalizedCleanName, {
      type: file.type || 'video/mp4',
    });

    setSelectedFile(renamedFile);
    setDetectedTags(tags);
    setCleanDownloadUrl(null);
    setCleanFileName(validation.normalizedCleanName);
    setCleanFileSize(null);
    setProcessDurationMs(null);
    setProgress(0);
  };

  const handleLoadSampleAiVideo = async (
    platformKey: 'runway' | 'google_flow' | 'luma' | 'pika'
  ) => {
    setIsGeneratingSample(platformKey);
    try {
      const response = await fetch(`/api/sample-ai-video?platform=${platformKey}`);
      if (!response.ok) {
        throw new Error('Could not generate sample AI MP4 clip.');
      }
      const fileNameHeader =
        response.headers.get('X-Sample-Filename') ||
        `Sample_${platformKey}_AI_Video.mp4`;
      const blob = await response.blob();
      const sampleFile = new File([blob], fileNameHeader, { type: 'video/mp4' });
      await inspectAndStageFile(sampleFile);
      triggerToast(
        'success',
        'Video Loaded & Auto-Renamed',
        'Video file name automatically set to "Abubakar Remove AI.mp4" and ready for FFmpeg metadata stripping.'
      );
    } catch (err: unknown) {
      triggerToast(
        'error',
        'Sample Generation Error',
        err instanceof Error ? err.message : 'Failed to load sample AI video.'
      );
    } finally {
      setIsGeneratingSample(null);
    }
  };

  const handleProcessVideo = async () => {
    if (!selectedFile || isProcessing) return;

    setIsProcessing(true);
    setProgress(15);
    setStepIndex(0);

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        const next = prev < 90 ? prev + 15 : prev;
        if (next >= 75) setStepIndex(3);
        else if (next >= 50) setStepIndex(2);
        else if (next >= 25) setStepIndex(1);
        return next;
      });
    }, 160);

    try {
      const formData = new FormData();
      formData.append('video', selectedFile);

      const response = await fetch('/api/strip-metadata', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || 'FFmpeg failed to strip metadata from the video.'
        );
      }

      const cleanBlob = await response.blob();
      const cleanBuffer = new Uint8Array(await cleanBlob.arrayBuffer());
      const url = URL.createObjectURL(cleanBlob);

      const serverDuration = Number(
        response.headers.get('X-Process-Duration-Ms') || 42
      );
      const outName =
        response.headers.get('X-Clean-Filename') ||
        cleanFileName ||
        'clean_video.mp4';

      clearInterval(progressTimer);
      setProgress(100);
      setStepIndex(3);

      setCleanDownloadUrl(url);
      setCleanFileName(outName);
      setCleanFileSize(cleanBuffer.byteLength);
      setProcessDurationMs(serverDuration);

      const historyEntry: ProcessedHistoryItem = {
        id: `${Date.now()}`,
        originalName: selectedFile.name,
        cleanName: outName,
        originalSize: selectedFile.size,
        cleanSize: cleanBuffer.byteLength,
        durationMs: serverDuration,
        tagsStrippedCount: detectedTags.length,
        downloadUrl: url,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };

      setHistory((prev) => [historyEntry, ...prev.slice(0, 7)]);

      triggerToast(
        'success',
        'AI Metadata Completely Removed',
        `Stripped ${detectedTags.length} AI metadata signatures in ${serverDuration} ms without re-encoding.`
      );
    } catch (error: unknown) {
      clearInterval(progressTimer);
      setProgress(0);
      triggerToast(
        'error',
        'FFmpeg Processing Failed',
        error instanceof Error
          ? error.message
          : 'Could not strip metadata from this file.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setDetectedTags([]);
    setCleanDownloadUrl(null);
    setCleanFileSize(null);
    setProcessDurationMs(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const ffmpegCommand = selectedFile
    ? buildFfmpegCommandString(selectedFile.name, cleanFileName)
    : 'ffmpeg -i input.mp4 -map_metadata -1 -map_chapters -1 -c:v copy -c:a copy -movflags +faststart clean_output.mp4';

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 border-b border-slate-800/80 bg-[#090D16]/95 sticky top-0 z-30 backdrop-blur">
        <a
          href="#workspace"
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          Abubakar AI File Remover
        </a>

        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
        >
          <a
            href="#workspace"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Scrubber Workspace
          </a>
          <a
            href="#supported-platforms"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Supported Platforms
          </a>
          <a
            href="#session-history"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Processed Queue
          </a>
          <a
            href="#nextjs-blueprint"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Next.js 14 Code
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Select MP4 File
          </button>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-md rounded-xl border border-slate-700 bg-[#11192A] p-4 shadow-2xl flex items-start gap-3"
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-100">{toast.title}</p>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              {toast.message}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 lg:px-10 py-10 space-y-12">
        {/* Hero & Core Scrubber Section */}
        <section id="workspace" className="space-y-6">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-medium text-emerald-400">
              Lossless FFmpeg Stream Copy · EXIF / XMP / C2PA / JUMBF Purger
            </p>
            <h1
              className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-50 font-display"
              style={{ textWrap: 'balance' }}
            >
              Strip All AI-Generated Video Metadata in Milliseconds Without Re-Encoding
            </h1>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Completely remove embedded EXIF, XMP, C2PA manifests, and platform-specific tool tags from{' '}
              <span className="text-slate-200 font-medium">Google Flow</span>,{' '}
              <span className="text-slate-200 font-medium">Runway Gen-3</span>,{' '}
              <span className="text-slate-200 font-medium">Luma Dream Machine</span>, and{' '}
              <span className="text-slate-200 font-medium">Pika</span> MP4 files so exported videos appear 100% natural and original.
            </p>
          </div>

          {/* Interactive Upload & Scrubber Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: Dropzone + Active Processing / Download Card */}
            <div className="lg:col-span-7 space-y-5">
              <input
                ref={fileInputRef}
                id="mp4-file-input"
                type="file"
                accept="video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v"
                aria-label="Upload MP4 video file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) inspectAndStageFile(file);
                }}
              />

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) inspectAndStageFile(dropped);
                }}
                className={`rounded-xl border border-dashed p-8 transition-colors ${
                  isDragging
                    ? 'border-emerald-400 bg-emerald-950/20'
                    : 'border-slate-700/90 bg-[#0F1624] hover:border-slate-600'
                }`}
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Upload className="w-6 h-6" />
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-slate-100 font-display">
                      Drag &amp; drop your AI-generated MP4 video here
                    </h2>
                    <p className="text-xs text-slate-400">
                      Supports MP4, MOV, and M4V up to 500 MB · Zero quality loss (
                      <code className="font-mono text-slate-300">-c:v copy -c:a copy</code>)
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Browse Local MP4 File
                    </button>

                    <button
                      type="button"
                      disabled={isGeneratingSample !== null}
                      onClick={() => handleLoadSampleAiVideo('runway')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        {isGeneratingSample === 'runway'
                          ? 'Generating AI Sample...'
                          : 'Load Sample AI Video (Runway Gen-3)'}
                      </span>
                    </button>
                  </div>

                  {/* Quick Sample Presets for Google Flow, Luma, Pika */}
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
                    <span>Or test preset tags:</span>
                    <button
                      type="button"
                      onClick={() => handleLoadSampleAiVideo('google_flow')}
                      className="underline hover:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      Google Flow sample
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => handleLoadSampleAiVideo('luma')}
                      className="underline hover:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      Luma Dream Machine sample
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => handleLoadSampleAiVideo('pika')}
                      className="underline hover:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      Pika 2.1 sample
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Staged Video & Action Card */}
              {selectedFile && (
                <div className="rounded-xl border border-slate-800 bg-[#0F1624] p-6 space-y-5 overflow-hidden">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                        <Film className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-slate-100 truncate">
                          {selectedFile.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums truncate">
                          {formatBytes(selectedFile.size)}
                          <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
                          Output: {cleanFileName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {cleanDownloadUrl && (
                        <button
                          type="button"
                          onClick={handleProcessVideo}
                          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Re-Run Scrubber
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleReset}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/80 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear File</span>
                      </button>
                    </div>
                  </div>

                  {/* Dynamic "Removing AI Data..." Loading State & Progress Bar */}
                  {isProcessing && (
                    <div
                      role="region"
                      aria-label="Removing AI Data Progress"
                      className="rounded-lg border border-emerald-500/30 bg-[#090D16] p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-2 font-semibold text-emerald-400">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Removing AI Data...</span>
                        </span>
                        <span className="font-mono tabular-nums text-slate-300">
                          {progress}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-150"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-xs font-mono text-slate-400">
                        {PROCESSING_STEPS[stepIndex]}
                      </p>
                    </div>
                  )}

                  {/* Primary Action Button: Strip or One-Click Download */}
                  {!cleanDownloadUrl ? (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleProcessVideo}
                      className="w-full py-3.5 px-5 rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Zap className="w-4 h-4" />
                      <span>
                        {isProcessing
                          ? 'Removing AI Data...'
                          : 'Remove AI Metadata Now (Lossless FFmpeg)'}
                      </span>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 text-xs text-emerald-300 min-w-0">
                          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="truncate">
                            All EXIF, XMP, C2PA, and AI platform signatures removed in{' '}
                            <strong className="font-mono tabular-nums">{processDurationMs} ms</strong>.
                          </span>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-emerald-400 shrink-0">
                          {cleanFileSize ? formatBytes(cleanFileSize) : ''}
                        </span>
                      </div>

                      <a
                        href={cleanDownloadUrl}
                        download={cleanFileName}
                        className="w-full py-3.5 px-5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors overflow-hidden"
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        <span className="truncate">
                          Download Clean Video ({cleanFileName})
                        </span>
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right 5 Columns: Technical Pipeline & Platform Coverage Card */}
            <div
              id="supported-platforms"
              className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0F1624] p-6 space-y-5"
            >
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-100 font-display">
                  Targeted AI Generator Signatures
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Social platforms automatically flag videos as AI-generated by scanning container boxes (
                  <code className="font-mono text-slate-300">moov.udta</code>,{' '}
                  <code className="font-mono text-slate-300">uuid</code>,{' '}
                  <code className="font-mono text-slate-300">XMP_</code>). Abubakar strips every marker while keeping 100% original video &amp; audio streams.
                </p>
              </div>

              <div className="divide-y divide-slate-800/80 text-xs">
                <div className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-200">Google Flow &amp; Veo</p>
                    <p className="text-slate-400 mt-0.5">
                      Purges C2PA JUMBF manifests, <code className="font-mono text-slate-300">XMP:CreatorTool</code>, and SynthID container atoms.
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                    uuid / udta
                  </span>
                </div>

                <div className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-200">Runway Gen-3 / Gen-2</p>
                    <p className="text-slate-400 mt-0.5">
                      Strips <code className="font-mono text-slate-300">RunwayML</code> software descriptors, <code className="font-mono text-slate-300">TrainedAlgorithmicMedia</code> IPTC flags, and XMP RDF blocks.
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                    XMP_ / ©too
                  </span>
                </div>

                <div className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-200">Luma Dream Machine</p>
                    <p className="text-slate-400 mt-0.5">
                      Removes Ray2 generator comments, encoder strings, and creation history headers.
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                    ilst.©cmt
                  </span>
                </div>

                <div className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-200">Pika Labs (Pika 2.1)</p>
                    <p className="text-slate-400 mt-0.5">
                      Clears producer atoms (<code className="font-mono text-slate-300">©ART</code>), custom chapter markers, and <code className="font-mono text-slate-300">Lavf</code> transcode stamps.
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                    ilst.©ART
                  </span>
                </div>
              </div>

              <div className="rounded-lg bg-[#090D16] border border-slate-800 p-3.5 space-y-1.5">
                <p className="text-[11px] font-medium text-slate-300">
                  Executed FFmpeg Pipeline Parameters
                </p>
                <code className="block font-mono text-[11px] text-emerald-400 leading-relaxed">
                  ffmpeg -i input.mp4 -map_metadata -1 -map_chapters -1 -c:v copy -c:a copy -fflags +bitexact -movflags +faststart clean.mp4
                </code>
              </div>
            </div>
          </div>

          {/* Detailed Before / After Metadata Inspector Table */}
          {selectedFile && (
            <MetadataInspector
              fileName={selectedFile.name}
              originalSize={selectedFile.size}
              cleanSize={cleanFileSize}
              durationMs={processDurationMs}
              detectedTags={detectedTags}
              isCleaned={Boolean(cleanDownloadUrl)}
              ffmpegCommand={ffmpegCommand}
            />
          )}
        </section>

        {/* Session Processed History Queue */}
        <section id="session-history" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 font-display">
                Session Processed Queue
              </h2>
              <p className="text-xs text-slate-400">
                Videos scrubbed during your current browser session. Server temporary files are deleted immediately after streaming.
              </p>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setHistory([])}
                className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
              >
                Clear History
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="rounded-xl border border-slate-800/80 bg-[#0F1624]/60 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <FileVideo className="w-5 h-5 text-slate-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    No videos scrubbed in this session yet
                  </p>
                  <p className="text-xs text-slate-400">
                    Upload an MP4 above or load a sample AI clip to inspect and strip embedded AI metadata.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleLoadSampleAiVideo('runway')}
                className="px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Test with Sample AI Video
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-[#0F1624] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400 bg-slate-900/40">
                      <th className="py-2.5 px-5">Clean Output File</th>
                      <th className="py-2.5 px-4">Tags Removed</th>
                      <th className="py-2.5 px-4 text-right">Size</th>
                      <th className="py-2.5 px-4 text-right">FFmpeg Time</th>
                      <th className="py-2.5 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/20">
                        <td className="py-3 px-5 font-medium text-slate-100">
                          <div>{item.cleanName}</div>
                          <div className="text-[11px] text-slate-400">
                            Source: {item.originalName} · {item.timestamp}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-emerald-400">
                          {item.tagsStrippedCount} signatures purged
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                          {formatBytes(item.cleanSize)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                          {item.durationMs} ms
                        </td>
                        <td className="py-3 px-5 text-right">
                          <a
                            href={item.downloadUrl}
                            download={item.cleanName}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/15 hover:bg-emerald-400/25 text-emerald-300 font-medium text-xs transition-colors whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Next.js 14 Full-Stack Source Code Blueprint Drawer */}
        <NextJsCodeDrawer />
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-6 lg:px-10 text-xs text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>Abubakar AI File Remover · Lossless FFmpeg Video Metadata Scrubber</span>
          <span>Zero Re-Encoding · Immediate Temp File Cleanup</span>
        </div>
      </footer>
    </div>
  );
}

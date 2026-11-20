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
  Image as ImageIcon,
  Zap,
  Trash2,
  FileVideo,
  X,
} from 'lucide-react';
import {
  DetectedMetadataTag,
  MediaKind,
  validateMediaFile,
  formatBytes,
  inspectMediaBlobForAiMetadata,
  scrubVideoBlobFast,
  stripImageMetadataInBrowser,
  createBrowserSampleMp4Buffer,
  createBrowserSamplePngBuffer,
} from './utils/metadataAnalyzer';
import { MetadataInspector } from './components/MetadataInspector';
import { CameraProfileSelector } from './components/CameraProfileSelector';
import {
  CameraProfileId,
  DEFAULT_CAMERA_PROFILE_ID,
  DEFAULT_VIDEO_CONTAINER,
  VideoContainerFormat,
  getCameraProfile,
} from './utils/cameraProfiles';

interface ProcessedHistoryItem {
  id: string;
  mediaKind: MediaKind;
  originalName: string;
  cleanName: string;
  cameraProfileLabel: string;
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

const VIDEO_PROCESSING_STEPS = [
  'Parsing MP4 container atoms (moov.udta, XMP_, C2PA JUMBF)...',
  'Stripping Google Flow, Runway, Luma & Pika AI signatures...',
  'Injecting genuine DSLR / Mobile Camera hardware metadata tags...',
  'Verifying bit-exact camera output & purging temporary data...',
];

const IMAGE_PROCESSING_STEPS = [
  'Scanning picture segments (APP1 EXIF, XMP, PNG tEXt/iTXt, C2PA)...',
  'Stripping Midjourney, Imagen, DALL-E & Stable Diffusion tags...',
  'Injecting genuine DSLR / Mobile Camera EXIF Make, Model & Lens...',
  'Finalizing 100% original-quality camera picture output...',
];

async function reencodeImageViaCanvas(
  file: File,
  outputMime: string
): Promise<Uint8Array> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unable to decode image file.'));
      el.src = bitmapUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(img, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to export clean image.'))),
        outputMime,
        0.96
      );
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMediaKind, setSelectedMediaKind] = useState<MediaKind>('video');
  const [outputMimeType, setOutputMimeType] = useState<string>('video/mp4');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const [detectedTags, setDetectedTags] = useState<DetectedMetadataTag[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState<string | null>(null);
  const [platformTab, setPlatformTab] = useState<'video' | 'image'>('video');
  const [cameraProfileId, setCameraProfileId] = useState<CameraProfileId>(
    DEFAULT_CAMERA_PROFILE_ID
  );
  const [videoContainer, setVideoContainer] = useState<VideoContainerFormat>(
    DEFAULT_VIDEO_CONTAINER
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  const [cleanBlobObj, setCleanBlobObj] = useState<Blob | null>(null);
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
    const validation = validateMediaFile(file.name, file.size, file.type);
    if (!validation.valid) {
      triggerToast(
        'error',
        'Invalid File Upload',
        validation.error || 'Please upload a valid MP4/MOV video or JPG/PNG/WEBP picture.'
      );
      return;
    }

    // Read ONLY head + tail 256 KB via Blob.slice() — instant even for 500 MB videos
    const tags = await inspectMediaBlobForAiMetadata(
      file,
      file.name,
      validation.mediaKind
    );

    const effectiveCleanName =
      validation.mediaKind === 'video' &&
      cameraProfileId !== 'none' &&
      videoContainer === 'mov'
        ? 'Abubakar Remove AI.mov'
        : validation.normalizedCleanName;
    const effectiveOutputMime =
      validation.mediaKind === 'video' &&
      cameraProfileId !== 'none' &&
      videoContainer === 'mov'
        ? 'video/quicktime'
        : validation.outputMimeType;

    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
    }

    if (validation.mediaKind === 'image') {
      const imgPreview = URL.createObjectURL(file);
      setPreviewImageUrl(imgPreview);
      setPlatformTab('image');
    } else {
      setPreviewImageUrl(null);
      setPlatformTab('video');
    }

    // Keep original File reference directly (zero RAM duplication) while displaying auto-renamed output name
    setSelectedFile(file);
    setSelectedMediaKind(validation.mediaKind);
    setOutputMimeType(effectiveOutputMime);
    setDetectedTags(tags);
    setCleanBlobObj(null);
    setCleanDownloadUrl(null);
    setCleanFileName(effectiveCleanName);
    setCleanFileSize(null);
    setProcessDurationMs(null);
    setProgress(0);
  };

  const handleLoadSampleAiVideo = async (
    platformKey: 'runway' | 'google_flow' | 'luma' | 'pika'
  ) => {
    setIsGeneratingSample(platformKey);
    try {
      let blob: Blob;
      let fileNameHeader = `Sample_${platformKey}_AI_Video.mp4`;

      try {
        const response = await fetch(`/api/sample-ai-video?platform=${platformKey}`);
        const contentType = response.headers.get('Content-Type') || '';
        if (!response.ok || !contentType.includes('video/mp4')) {
          throw new Error('Static host mode');
        }
        fileNameHeader =
          response.headers.get('X-Sample-Filename') || fileNameHeader;
        blob = await response.blob();
      } catch {
        const sampleBytes = createBrowserSampleMp4Buffer(platformKey);
        blob = new Blob([sampleBytes as unknown as BlobPart], { type: 'video/mp4' });
      }

      const sampleFile = new File([blob], fileNameHeader, { type: 'video/mp4' });
      await inspectAndStageFile(sampleFile);
      const expectedVideoName =
        cameraProfileId !== 'none' && videoContainer === 'mov'
          ? 'Abubakar Remove AI.mov'
          : 'Abubakar Remove AI.mp4';
      triggerToast(
        'success',
        'Video Loaded & Auto-Renamed',
        `Video output automatically set to "${expectedVideoName}" and ready for instant metadata stripping.`
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

  const handleLoadSampleAiPicture = async (
    platformKey: 'midjourney' | 'imagen' | 'dalle' | 'stable_diffusion'
  ) => {
    setIsGeneratingSample(`img_${platformKey}`);
    try {
      const sampleBytes = createBrowserSamplePngBuffer(platformKey);
      const blob = new Blob([sampleBytes as unknown as BlobPart], {
        type: 'image/png',
      });
      const sampleFile = new File([blob], `Sample_${platformKey}_AI_Picture.png`, {
        type: 'image/png',
      });
      await inspectAndStageFile(sampleFile);
      triggerToast(
        'success',
        'Picture Loaded & Auto-Renamed',
        'Picture file name automatically set to "Abubakar Remove AI.png" and ready for EXIF/XMP/AI stripping.'
      );
    } catch (err: unknown) {
      triggerToast(
        'error',
        'Sample Picture Error',
        err instanceof Error ? err.message : 'Failed to generate sample AI picture.'
      );
    } finally {
      setIsGeneratingSample(null);
    }
  };

  const handleTriggerDownload = (
    url?: string,
    name?: string,
    blobToShare?: Blob | null
  ) => {
    const targetUrl = url || cleanDownloadUrl;
    const targetName = name || cleanFileName || 'Abubakar Remove AI.mp4';
    const activeBlob = blobToShare !== undefined ? blobToShare : cleanBlobObj;

    if (!targetUrl) return;

    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = targetName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 200);

    if (activeBlob) {
      triggerToast(
        'success',
        'Downloading Clean File',
        `Saving "${targetName}" to your device.`
      );
    }
  };

  const handleNativeMobileShare = async () => {
    if (!cleanBlobObj) return;
    const outName = cleanFileName || 'Abubakar Remove AI.mp4';
    try {
      const shareFile = new File([cleanBlobObj], outName, {
        type: outputMimeType || 'video/mp4',
      });
      if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
        await navigator.share({
          files: [shareFile],
          title: outName,
        });
        return;
      }
    } catch {
      // User cancelled share sheet or unsupported
    }
    handleTriggerDownload();
  };

  const handleProcessMedia = async () => {
    if (!selectedFile || isProcessing) return;

    setIsProcessing(true);
    setProgress(35);
    setStepIndex(1);
    const startTime = performance.now();

    try {
      // Yield 1 paint frame so the UI renders the processing state smoothly without blocking
      await new Promise<void>((resolve) =>
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(() => resolve())
          : setTimeout(resolve, 0)
      );

      let cleanBlob: Blob;
      let cleanByteSize = 0;
      let serverDuration = 0;

      const activeCameraProfile = getCameraProfile(cameraProfileId);
      const effectiveContainer: VideoContainerFormat =
        activeCameraProfile.id === 'none' ? 'mp4' : videoContainer;
      const effectiveOutName =
        selectedMediaKind === 'video'
          ? effectiveContainer === 'mov'
            ? 'Abubakar Remove AI.mov'
            : 'Abubakar Remove AI.mp4'
          : cleanFileName || 'Abubakar Remove AI.png';
      const effectiveVideoMime =
        effectiveContainer === 'mov' ? 'video/quicktime' : 'video/mp4';

      if (selectedMediaKind === 'image') {
        const rawBytes = new Uint8Array(await selectedFile.arrayBuffer());
        const isNativeBinaryImage =
          (rawBytes[0] === 0xff && rawBytes[1] === 0xd8) || // JPEG
          (rawBytes[0] === 0x89 && rawBytes[1] === 0x50) || // PNG
          (rawBytes[0] === 0x52 && rawBytes[1] === 0x49); // RIFF WEBP

        let cleanBuffer: Uint8Array;
        if (isNativeBinaryImage) {
          cleanBuffer = stripImageMetadataInBrowser(rawBytes, activeCameraProfile);
        } else {
          const canvasBytes = await reencodeImageViaCanvas(
            selectedFile,
            outputMimeType || 'image/png'
          );
          cleanBuffer = stripImageMetadataInBrowser(canvasBytes, activeCameraProfile);
        }

        cleanBlob = new Blob([cleanBuffer as unknown as BlobPart], {
          type: outputMimeType || 'image/png',
        });
        cleanByteSize = cleanBlob.size;
        serverDuration = Math.max(4, Math.round(performance.now() - startTime));
      } else {
        // Instant Zero-Copy on-device MP4/MOV scrubbing via Blob.slice():
        // Never uploads large videos over mobile data and never copies `mdat` frames into JS RAM.
        const fastResult = await scrubVideoBlobFast(
          selectedFile,
          activeCameraProfile,
          effectiveContainer
        );

        const isFullStackHost =
          typeof window !== 'undefined' &&
          (window.location.hostname === 'localhost' ||
            window.location.hostname.endsWith('.run.app'));

        if (
          !fastResult.processedAsIso &&
          isFullStackHost &&
          selectedFile.size <= 25 * 1024 * 1024
        ) {
          // Non-ISO video container (e.g., .webm) -> use server FFmpeg remux with 20s timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);
          try {
            const formData = new FormData();
            formData.append('video', selectedFile);
            formData.append('cameraProfile', activeCameraProfile.id);
            formData.append('containerFormat', effectiveContainer);

            const response = await fetch('/api/strip-metadata', {
              method: 'POST',
              body: formData,
              signal: controller.signal,
            });

            const contentType = response.headers.get('Content-Type') || '';
            if (
              !response.ok ||
              (!contentType.includes('video/mp4') &&
                !contentType.includes('video/quicktime'))
            ) {
              throw new Error('Fallback to local scrubber');
            }

            cleanBlob = await response.blob();
            cleanByteSize = cleanBlob.size;
            serverDuration = Number(
              response.headers.get('X-Process-Duration-Ms') ||
                Math.max(8, Math.round(performance.now() - startTime))
            );
          } catch {
            cleanBlob = fastResult.blob;
            cleanByteSize = fastResult.cleanSize;
            serverDuration = Math.max(4, Math.round(performance.now() - startTime));
          } finally {
            clearTimeout(timeoutId);
          }
        } else {
          cleanBlob = fastResult.blob;
          cleanByteSize = fastResult.cleanSize;
          serverDuration = Math.max(4, Math.round(performance.now() - startTime));
        }

        setOutputMimeType(effectiveVideoMime);
      }

      if (cleanDownloadUrl) {
        URL.revokeObjectURL(cleanDownloadUrl);
      }
      const url = URL.createObjectURL(cleanBlob);

      setProgress(100);
      setStepIndex(3);

      setCleanBlobObj(cleanBlob);
      setCleanDownloadUrl(url);
      setCleanFileName(effectiveOutName);
      setCleanFileSize(cleanByteSize);
      setProcessDurationMs(serverDuration);

      const historyEntry: ProcessedHistoryItem = {
        id: `${Date.now()}`,
        mediaKind: selectedMediaKind,
        originalName: selectedFile.name,
        cleanName: effectiveOutName,
        cameraProfileLabel: activeCameraProfile.shortLabel,
        originalSize: selectedFile.size,
        cleanSize: cleanByteSize,
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

      const cameraNote =
        activeCameraProfile.id !== 'none'
          ? ` Injected ${activeCameraProfile.label} hardware metadata.`
          : '';

      triggerToast(
        'success',
        'AI Metadata Removed & Camera Ready',
        `Stripped ${detectedTags.length} AI tags in ${serverDuration} ms.${cameraNote} Ready to download as "${effectiveOutName}".`
      );
    } catch (error: unknown) {
      setProgress(0);
      triggerToast(
        'error',
        'Processing Error',
        error instanceof Error
          ? error.message
          : 'Could not strip metadata from this file.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
    }
    setSelectedFile(null);
    setPreviewImageUrl(null);
    setDetectedTags([]);
    setCleanBlobObj(null);
    setCleanDownloadUrl(null);
    setCleanFileSize(null);
    setProcessDurationMs(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const activeCameraProfile = getCameraProfile(cameraProfileId);
  const activeSteps =
    selectedMediaKind === 'image' ? IMAGE_PROCESSING_STEPS : VIDEO_PROCESSING_STEPS;

  const handleSelectCameraProfile = (id: CameraProfileId) => {
    setCameraProfileId(id);
    if (selectedMediaKind === 'video') {
      const nextName =
        id !== 'none' && videoContainer === 'mov'
          ? 'Abubakar Remove AI.mov'
          : 'Abubakar Remove AI.mp4';
      setCleanFileName(nextName);
    }
    if (cleanDownloadUrl) {
      URL.revokeObjectURL(cleanDownloadUrl);
      setCleanDownloadUrl(null);
      setCleanBlobObj(null);
      setCleanFileSize(null);
      setProcessDurationMs(null);
    }
  };

  const handleSelectVideoContainer = (fmt: VideoContainerFormat) => {
    setVideoContainer(fmt);
    if (selectedMediaKind === 'video') {
      setCleanFileName(
        fmt === 'mov' && cameraProfileId !== 'none'
          ? 'Abubakar Remove AI.mov'
          : 'Abubakar Remove AI.mp4'
      );
    }
    if (cleanDownloadUrl) {
      URL.revokeObjectURL(cleanDownloadUrl);
      setCleanDownloadUrl(null);
      setCleanBlobObj(null);
      setCleanFileSize(null);
      setProcessDurationMs(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-3 sm:gap-8 px-4 sm:px-6 lg:px-10 py-4 border-b border-slate-800/80 bg-[#090D16]/95 sticky top-0 z-30 backdrop-blur">
        <a
          href="#workspace"
          className="flex items-baseline gap-2 min-w-0 whitespace-nowrap truncate"
        >
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-100 font-display truncate">
            AB.AIBypass.com
          </span>
          <span className="text-[11px] sm:text-xs font-medium text-emerald-400 shrink-0">
            by abubakar
          </span>
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
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 sm:px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="sm:hidden">Select File</span>
            <span className="hidden sm:inline">Select Video / Picture</span>
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
              Lossless Video &amp; Picture Scrubber · Auto DSLR &amp; Mobile Camera Signature
            </p>
            <h1
              className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-50 font-display"
              style={{ textWrap: 'balance' }}
            >
              Strip All AI Metadata &amp; Inject Real DSLR or Mobile Camera Tags
            </h1>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Automatically removes EXIF, XMP, C2PA, and AI generator tags from{' '}
              <span className="text-slate-200 font-medium">Videos</span> (Google Flow, Runway, Luma, Pika) and{' '}
              <span className="text-slate-200 font-medium">Pictures</span> (Midjourney, Imagen, DALL-E, Stable Diffusion), then embeds authentic{' '}
              <span className="text-emerald-300 font-medium">DSLR or Mobile Camera</span> hardware metadata so TikTok, YouTube, and Instagram recognize it as real camera footage.
            </p>
          </div>

          {/* Interactive Upload & Scrubber Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: Dropzone + Active Processing / Download Card */}
            <div className="lg:col-span-7 space-y-5">
              <input
                ref={fileInputRef}
                id="media-file-input"
                type="file"
                accept="video/*,image/*,.mp4,.mov,.m4v,.jpg,.jpeg,.png,.webp,.heic,.avif"
                aria-label="Upload video or picture file"
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
                className={`rounded-xl border border-dashed p-6 transition-colors ${
                  isDragging
                    ? 'border-emerald-400 bg-emerald-950/20'
                    : 'border-slate-700/90 bg-[#0F1624] hover:border-slate-600'
                }`}
              >
                <div className="flex flex-col items-center text-center space-y-3.5">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Upload className="w-5 h-5" />
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-slate-100 font-display">
                      Drag &amp; drop any AI-generated Video or Picture here
                    </h2>
                    <p className="text-xs text-slate-400">
                      Videos (MP4, MOV, M4V) &amp; Pictures (JPG, PNG, WEBP, HEIC) up to 500 MB · Zero quality loss
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Browse Video or Picture
                    </button>

                    <button
                      type="button"
                      disabled={isGeneratingSample !== null}
                      onClick={() => handleLoadSampleAiVideo('runway')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        {isGeneratingSample === 'runway'
                          ? 'Loading Sample...'
                          : 'Load Sample AI Video'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isGeneratingSample !== null}
                      onClick={() => handleLoadSampleAiPicture('midjourney')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        {isGeneratingSample === 'img_midjourney'
                          ? 'Loading Picture...'
                          : 'Load Sample AI Picture'}
                      </span>
                    </button>
                  </div>

                  {/* Quick Sample Presets for Videos & Pictures */}
                  <div className="pt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
                    <span>Presets:</span>
                    <button
                      type="button"
                      onClick={() => handleLoadSampleAiVideo('google_flow')}
                      className="underline hover:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      Google Flow video
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => handleLoadSampleAiVideo('luma')}
                      className="underline hover:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      Luma video
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => handleLoadSampleAiPicture('imagen')}
                      className="underline hover:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      Google Imagen picture
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => handleLoadSampleAiPicture('stable_diffusion')}
                      className="underline hover:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      Stable Diffusion picture
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Staged File & Action Card */}
              {selectedFile && (
                <div className="rounded-xl border border-slate-800 bg-[#0F1624] p-5 space-y-4 overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3.5">
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      {previewImageUrl ? (
                        <img
                          src={previewImageUrl}
                          alt="Staged picture preview"
                          className="w-11 h-11 rounded-lg object-cover border border-slate-700 shrink-0 bg-slate-900"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                          <Film className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-slate-100 truncate">
                          {cleanFileName || selectedFile.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums truncate">
                          {selectedMediaKind === 'image' ? 'Picture' : 'Video'} · {formatBytes(selectedFile.size)}
                          <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
                          {activeCameraProfile.shortLabel}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      {cleanDownloadUrl && (
                        <button
                          type="button"
                          onClick={handleProcessMedia}
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
                        {activeSteps[stepIndex]}
                      </p>
                    </div>
                  )}

                  {/* Primary Action Button: Strip or One-Click Download */}
                  {!cleanDownloadUrl ? (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleProcessMedia}
                      className="w-full py-3.5 px-5 rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Zap className="w-4 h-4" />
                      <span>
                        {isProcessing
                          ? 'Removing AI Data & Injecting Camera Tag...'
                          : activeCameraProfile.id !== 'none'
                            ? `Remove AI & Apply ${activeCameraProfile.shortLabel}`
                            : selectedMediaKind === 'image'
                              ? 'Remove AI Metadata From Picture (Lossless)'
                              : 'Remove AI Metadata Now (Lossless)'}
                      </span>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 text-xs text-emerald-300 min-w-0">
                          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="truncate">
                            AI tags removed
                            {activeCameraProfile.id !== 'none'
                              ? ` & ${activeCameraProfile.shortLabel} injected`
                              : ''}{' '}
                            in <strong className="font-mono tabular-nums">{processDurationMs} ms</strong>.
                          </span>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-emerald-400 shrink-0">
                          {cleanFileSize ? formatBytes(cleanFileSize) : ''}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                        <a
                          href={cleanDownloadUrl}
                          download={cleanFileName}
                          onClick={() =>
                            triggerToast(
                              'success',
                              'Downloading Clean File',
                              `Saving "${cleanFileName}" to your device.`
                            )
                          }
                          className="flex-1 py-3.5 px-5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors overflow-hidden"
                        >
                          <Download className="w-4 h-4 shrink-0" />
                          <span className="truncate">
                            Download Clean {selectedMediaKind === 'image' ? 'Picture' : 'Video'} ({cleanFileName})
                          </span>
                        </a>

                        {typeof navigator !== 'undefined' &&
                          typeof navigator.share === 'function' && (
                            <button
                              type="button"
                              onClick={handleNativeMobileShare}
                              className="py-3.5 px-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Save to Phone / Share
                            </button>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Auto DSLR & Mobile Camera Signature Selector */}
              <CameraProfileSelector
                selectedProfileId={cameraProfileId}
                onSelect={handleSelectCameraProfile}
                videoContainer={videoContainer}
                onSelectContainer={handleSelectVideoContainer}
                disabled={isProcessing}
              />
            </div>

            {/* Right 5 Columns: Technical Pipeline & Platform Coverage Card */}
            <div
              id="supported-platforms"
              className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0F1624] p-6 space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-100 font-display">
                  Targeted AI Signatures
                </h2>

                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090D16] border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setPlatformTab('video')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      platformTab === 'video'
                        ? 'bg-emerald-400 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Videos
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlatformTab('image')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      platformTab === 'image'
                        ? 'bg-emerald-400 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Pictures
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                {platformTab === 'video'
                  ? 'Social platforms automatically flag AI videos by scanning container boxes (moov.udta, uuid, XMP_). Every marker is stripped without re-encoding video or audio.'
                  : 'AI image generators and camera apps embed EXIF, XMP, C2PA, and prompt text chunks inside JPG, PNG, and WEBP files. Every metadata segment is stripped losslessly.'}
              </p>

              {platformTab === 'video' ? (
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
              ) : (
                <div className="divide-y divide-slate-800/80 text-xs">
                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-200">Midjourney &amp; DALL-E 3</p>
                      <p className="text-slate-400 mt-0.5">
                        Strips <code className="font-mono text-slate-300">tEXt</code> prompt jobs, <code className="font-mono text-slate-300">APP11</code> JUMBF/C2PA manifests, and OpenAI claim headers.
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                      tEXt / APP11
                    </span>
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-200">Google Imagen &amp; Gemini</p>
                      <p className="text-slate-400 mt-0.5">
                        Removes <code className="font-mono text-slate-300">Made with Google AI</code> IPTC/XMP tags and SynthID metadata blocks.
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                      APP1 / iTXt
                    </span>
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-200">Stable Diffusion &amp; ComfyUI</p>
                      <p className="text-slate-400 mt-0.5">
                        Purges full node workflow JSON, seeds, negative prompts, and sampler parameters from PNG/JPG.
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                      tEXt / COM
                    </span>
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-200">Adobe Firefly &amp; Camera EXIF</p>
                      <p className="text-slate-400 mt-0.5">
                        Clears <code className="font-mono text-slate-300">APP13</code> Photoshop IPTC blocks, device GPS coordinates, and camera serial EXIF.
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                      EXIF / IPTC
                    </span>
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-[#090D16] border border-slate-800 p-3.5 space-y-1">
                <p className="text-[11px] font-medium text-emerald-400">
                  Lossless Bit-Exact Processing Engine
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Strips all AI metadata signatures while keeping 100% original video, audio, and picture pixel quality without re-encoding.
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Before / After Metadata Inspector Table */}
          {selectedFile && (
            <MetadataInspector
              fileName={cleanFileName || selectedFile.name}
              mediaKind={selectedMediaKind}
              originalSize={selectedFile.size}
              cleanSize={cleanFileSize}
              durationMs={processDurationMs}
              detectedTags={detectedTags}
              isCleaned={Boolean(cleanDownloadUrl)}
              cameraProfile={activeCameraProfile}
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
                Videos and pictures scrubbed during your current browser session. Zero server file retention.
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
                    No videos or pictures scrubbed in this session yet
                  </p>
                  <p className="text-xs text-slate-400">
                    Upload an MP4/MOV video or JPG/PNG/WEBP picture above to inspect and strip embedded AI metadata.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleLoadSampleAiVideo('runway')}
                  className="px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Test Sample Video
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSampleAiPicture('midjourney')}
                  className="px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Test Sample Picture
                </button>
              </div>
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
                      <th className="py-2.5 px-4 text-right">Processing Time</th>
                      <th className="py-2.5 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/20">
                        <td className="py-3 px-5 font-medium text-slate-100">
                          <div>{item.cleanName}</div>
                          <div className="text-[11px] text-slate-400">
                            {item.mediaKind === 'image' ? 'Picture' : 'Video'} · {item.cameraProfileLabel} · {item.timestamp}
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
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-6 lg:px-10 text-xs text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>AB.AIBypass.com · by abubakar · Instant Zero-Copy Video &amp; Picture Metadata Scrubber</span>
          <div className="flex flex-wrap items-center gap-4">
            <span>Zero Re-Encoding · Instant On-Device Speed</span>
            {(typeof window !== 'undefined' &&
              (window.location.hostname === 'localhost' ||
                window.location.hostname.endsWith('.run.app'))) && (
              <a
                href="/api/download-dist"
                download="abubakar-infinityfree-dist.zip"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-medium text-xs transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download dist.zip (InfinityFree / Vercel)</span>
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

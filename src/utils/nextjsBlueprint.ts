export interface CodeBlueprintFile {
  id: string;
  title: string;
  path: string;
  language: string;
  description: string;
  code: string;
}

export const NEXTJS_PROJECT_STRUCTURE = `abubakar-ai-file-remover/
├── app/
│   ├── api/
│   │   └── strip-metadata/
│   │       └── route.ts          # Next.js 14 App Router API Route (fluent-ffmpeg)
│   ├── globals.css               # Tailwind CSS dark-mode styling
│   ├── layout.tsx                # Root layout & metadata
│   └── page.tsx                  # Main drag-and-drop video scrubber UI
├── components/
│   └── MetadataInspector.tsx     # Before/After EXIF, XMP & C2PA atom diff table
├── public/
├── next.config.mjs               # Next.js 14 serverExternalPackages config for fluent-ffmpeg
├── package.json                  # Dependencies (next 14, fluent-ffmpeg, lucide-react)
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json`;

export const NEXTJS_BLUEPRINT_FILES: CodeBlueprintFile[] = [
  {
    id: 'structure',
    title: 'Project Structure',
    path: 'Directory Tree',
    language: 'text',
    description: 'Complete Next.js 14 App Router project structure for Abubakar AI File Remover.',
    code: NEXTJS_PROJECT_STRUCTURE,
  },
  {
    id: 'api-route',
    title: 'Backend API Route (FFmpeg)',
    path: 'app/api/strip-metadata/route.ts',
    language: 'typescript',
    description:
      'Next.js 14 Route Handler using fluent-ffmpeg with -map_metadata -1 -c:v copy -c:a copy and automatic temp file cleanup.',
    code: `import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function safeCleanup(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch {
    // File already deleted or never created
  }
}

export async function POST(req: NextRequest) {
  const tempDir = os.tmpdir();
  const jobId = crypto.randomUUID();
  const inputPath = path.join(tempDir, \`input_\${jobId}.mp4\`);
  const outputPath = path.join(tempDir, \`clean_\${jobId}.mp4\`);

  try {
    const formData = await req.formData();
    const file = formData.get('video') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No MP4 video file uploaded.' },
        { status: 400 }
      );
    }

    // Write uploaded buffer to temporary file for FFmpeg stream copy
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(inputPath, Buffer.from(arrayBuffer));

    // Strip all EXIF, XMP, C2PA, and AI tool tags (Google Flow, Runway, Luma, Pika)
    // without re-encoding video or audio streams
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-map_metadata -1',
          '-map_chapters -1',
          '-c:v copy',
          '-c:a copy',
          '-fflags +bitexact',
          '-flags:v +bitexact',
          '-flags:a +bitexact',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const cleanVideoBuffer = await fs.readFile(outputPath);

    // Clean up temporary files immediately
    await Promise.all([safeCleanup(inputPath), safeCleanup(outputPath)]);

    const cleanFileName = 'Abubakar Remove AI.mp4';

    return new NextResponse(cleanVideoBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': \`attachment; filename="\${cleanFileName}"\`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    await Promise.all([safeCleanup(inputPath), safeCleanup(outputPath)]);
    const message = error instanceof Error ? error.message : 'FFmpeg processing error';
    return NextResponse.json(
      { error: 'Failed to strip AI metadata from video.', details: message },
      { status: 500 }
    );
  }
}`,
  },
  {
    id: 'main-page',
    title: 'Main Page (Frontend UI)',
    path: 'app/page.tsx',
    language: 'tsx',
    description:
      'Next.js 14 Client Component with drag-and-drop upload, automatic renaming to "Abubakar Remove AI.mp4", dynamic "Removing AI Data..." progress state, and one-click download.',
    code: `'use client';

import React, { useState, useRef } from 'react';
import { Upload, Download, CheckCircle2, AlertTriangle, Film } from 'lucide-react';

const AUTO_FILENAME = 'Abubakar Remove AI.mp4';

export default function AbubakarAiFileRemoverPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cleanVideoUrl, setCleanVideoUrl] = useState<string | null>(null);
  const [cleanFileName, setCleanFileName] = useState<string>(AUTO_FILENAME);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const handleFileSelect = (selected: File | null) => {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.mp4') && selected.type !== 'video/mp4') {
      showToast('error', 'Please upload a valid MP4 video file.');
      return;
    }
    if (cleanVideoUrl) URL.revokeObjectURL(cleanVideoUrl);
    // Automatically rename any uploaded video to "Abubakar Remove AI.mp4"
    const renamedFile = new File([selected], AUTO_FILENAME, { type: 'video/mp4' });
    setFile(renamedFile);
    setCleanFileName(AUTO_FILENAME);
    setCleanVideoUrl(null);
    setProgress(0);
  };

  const processVideo = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress(18);

    const timer = setInterval(() => {
      setProgress((prev) => (prev < 88 ? prev + 14 : prev));
    }, 180);

    try {
      const formData = new FormData();
      formData.append('video', file);

      const response = await fetch('/api/strip-metadata', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to strip metadata.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      clearInterval(timer);
      setProgress(100);
      setCleanVideoUrl(url);
      setCleanFileName(AUTO_FILENAME);
      showToast('success', 'All AI metadata stripped. File renamed to Abubakar Remove AI.mp4.');
    } catch (err: unknown) {
      clearInterval(timer);
      setProgress(0);
      showToast('error', err instanceof Error ? err.message : 'Processing failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090D16] text-slate-100 px-6 py-12">
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Abubakar AI File Remover</h1>
          <p className="text-slate-400 text-sm">
            Lossless FFmpeg stream scrubber for Google Flow, Runway, Luma, and Pika MP4 videos.
          </p>
        </header>

        <section
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileSelect(e.dataTransfer.files?.[0] || null);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={\`cursor-pointer rounded-xl border border-dashed p-10 text-center transition-colors \${
            isDragging ? 'border-emerald-400 bg-emerald-950/20' : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
          }\`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,.mp4"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
          />
          <Upload className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
          <p className="text-base font-medium">Drag and drop your AI-generated MP4 video here</p>
          <p className="text-xs text-slate-400 mt-1">Zero re-encoding (-map_metadata -1 -c:v copy -c:a copy)</p>
        </section>

        {file && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Film className="w-5 h-5 text-emerald-400" />
                <span className="font-medium text-sm">{file.name}</span>
              </div>
              <button
                onClick={processVideo}
                disabled={isProcessing}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-sm hover:bg-emerald-400 disabled:opacity-50"
              >
                {isProcessing ? 'Removing AI Data...' : 'Remove AI Metadata'}
              </button>
            </div>

            {isProcessing && (
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-400 h-full transition-all duration-200" style={{ width: \`\${progress}%\` }} />
              </div>
            )}

            {cleanVideoUrl && (
              <a
                href={cleanVideoUrl}
                download={cleanFileName}
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-sm hover:bg-emerald-400"
              >
                <Download className="w-4 h-4" />
                Download Clean Video ({cleanFileName})
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}`,
  },
  {
    id: 'package-json',
    title: 'package.json Dependencies',
    path: 'package.json',
    language: 'json',
    description:
      'Required Next.js 14, React 18, Tailwind CSS, and fluent-ffmpeg dependencies.',
    code: `{
  "name": "abubakar-ai-file-remover",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "fluent-ffmpeg": "^2.1.3",
    "lucide-react": "^0.454.0",
    "next": "14.2.16",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.27",
    "@types/node": "^20.17.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3"
  }
}`,
  },
];

import express, { Request, Response } from 'express';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  DEFAULT_CAMERA_PROFILE_ID,
  DEFAULT_VIDEO_CONTAINER,
  DEFAULT_VIDEO_SCRUB_MODE,
  VideoContainerFormat,
  VideoScrubMode,
  getCameraProfile,
  buildFfmpegCameraMetadataArgs,
  buildFfmpegDeepBypassArgs,
} from './src/utils/cameraProfiles';
import { stripMp4MetadataInBrowser } from './src/utils/metadataAnalyzer';

const PORT = 3000;

// Configure multer to store temporary uploads in os.tmpdir()
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, os.tmpdir());
    },
    filename: (_req, file, cb) => {
      const uniqueId = crypto.randomUUID();
      const ext = path.extname(file.originalname || '.mp4') || '.mp4';
      cb(null, `abubakar_in_${uniqueId}${ext}`);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB max
  },
});

async function safeUnlink(filePath: string | undefined) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // Ignore if already removed
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  /**
   * Generates a real, playable 2-second MP4 video file injected with genuine AI platform
   * metadata tags (Google Flow, Runway Gen-3, Luma Dream Machine, Pika, C2PA) so users
   * can test real end-to-end FFmpeg metadata stripping immediately.
   */
  app.get('/api/sample-ai-video', async (req: Request, res: Response) => {
    const platform = String(req.query.platform || 'runway').toLowerCase();
    const sampleId = crypto.randomUUID();
    const tempSamplePath = path.join(os.tmpdir(), `sample_ai_${sampleId}.mp4`);

    const platformMetadata: Record<string, { name: string; tool: string; comment: string; color: string }> = {
      runway: {
        name: 'Runway_Gen3_Alpha_Turbo_Clip.mp4',
        tool: 'Runway Gen-3 Alpha Turbo (runwayml.com)',
        comment: 'c2pa.jumbf | iptc:TrainedAlgorithmicMedia | Generated with Runway Gen-3 Alpha | Google Flow | Luma | Pika',
        color: '0x1e293b',
      },
      google_flow: {
        name: 'Google_Flow_Veo2_Cinema_Render.mp4',
        tool: 'Google Flow Studio (Veo Pipeline / C2PA SynthID)',
        comment: 'c2pa.jumbf | Google Flow AI Video | SynthID Watermark Header | Runway | Luma | Pika',
        color: '0x0f172a',
      },
      luma: {
        name: 'Luma_Dream_Machine_Ray2_Shot.mp4',
        tool: 'Luma AI Dream Machine v1.6 Ray2 (lumalabs.ai)',
        comment: 'c2pa.jumbf | Luma Dream Machine AI_GENERATED | Runway | Google Flow | Pika',
        color: '0x172554',
      },
      pika: {
        name: 'Pika_2_1_Motion_Render.mp4',
        tool: 'Pika Labs AI Video Engine v2.1 (pika.art)',
        comment: 'c2pa.jumbf | Pika Labs AI_GENERATED | Google Flow | Runway | Luma',
        color: '0x1e1b4b',
      },
    };

    const meta = platformMetadata[platform] || platformMetadata.runway;

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(`color=c=${meta.color}:s=640x360:d=1.5`)
          .inputFormat('lavfi')
          .input('anullsrc=channel_layout=stereo:sample_rate=44100')
          .inputFormat('lavfi')
          .outputOptions([
            '-shortest',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-preset',
            'ultrafast',
            '-c:a',
            'aac',
            '-b:a',
            '64k',
            '-metadata',
            `title=AI_GENERATED_${platform.toUpperCase()}`,
            '-metadata',
            `artist=${meta.tool}`,
            '-metadata',
            `comment=${meta.comment}`,
            '-metadata',
            `encoder=${meta.tool}`,
            '-metadata',
            'copyright=C2PA TrainedAlgorithmicMedia AI_GENERATED',
          ])
          .save(tempSamplePath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });

      const fileBuffer = await fs.promises.readFile(tempSamplePath);
      await safeUnlink(tempSamplePath);

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `inline; filename="${meta.name}"`);
      res.setHeader('X-Sample-Filename', meta.name);
      res.send(fileBuffer);
    } catch (error) {
      await safeUnlink(tempSamplePath);
      console.error('Error generating sample AI video:', error);
      res.status(500).json({
        error: 'Failed to generate sample AI video with FFmpeg.',
      });
    }
  });

  /**
   * Core API Route: POST /api/strip-metadata
   * Uses fluent-ffmpeg with `-map_metadata -1 -c:v copy -c:a copy` to strip all
   * EXIF, XMP, C2PA, and AI generator tags without re-encoding the video stream.
   */
  const handleStripMetadata = async (req: Request, res: Response) => {
    const startTime = Date.now();
    const uploadedFile = req.file;

    if (!uploadedFile) {
      res.status(400).json({ error: 'No video file provided in request.' });
      return;
    }

    const inputPath = uploadedFile.path;
    const outputId = crypto.randomUUID();
    const requestedProfileId =
      typeof req.body?.cameraProfile === 'string'
        ? req.body.cameraProfile
        : DEFAULT_CAMERA_PROFILE_ID;
    const cameraProfile = getCameraProfile(requestedProfileId);
    const requestedContainer: VideoContainerFormat =
      req.body?.containerFormat === 'mp4'
        ? 'mp4'
        : req.body?.containerFormat === 'mov'
          ? 'mov'
          : DEFAULT_VIDEO_CONTAINER;
    const scrubMode: VideoScrubMode =
      req.body?.scrubMode === 'instant' ? 'instant' : DEFAULT_VIDEO_SCRUB_MODE;
    const effectiveFormat: VideoContainerFormat =
      cameraProfile.id === 'none' ? 'mp4' : requestedContainer;
    const isMov = effectiveFormat === 'mov';

    const outputPath = path.join(
      os.tmpdir(),
      `abubakar_clean_${outputId}.${effectiveFormat}`
    );
    const downloadFileName = isMov
      ? 'Abubakar Remove AI.mov'
      : 'Abubakar Remove AI.mp4';
    const outputMime = isMov ? 'video/quicktime' : 'video/mp4';
    const cameraFfmpegArgs = buildFfmpegCameraMetadataArgs(
      cameraProfile,
      effectiveFormat
    );
    const deepBypassArgs = buildFfmpegDeepBypassArgs(
      cameraProfile,
      effectiveFormat
    );

    const runFfmpegPass = (options: string[]) =>
      new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions(options)
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

    try {
      if (scrubMode === 'deep') {
        try {
          await runFfmpegPass(deepBypassArgs);
        } catch {
          // If input has unusual codec/filter incompatibility, fallback to lossless stream copy + SEI scrub
          await runFfmpegPass([
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            '-map_metadata',
            '-1',
            '-map_chapters',
            '-1',
            '-c:v',
            'copy',
            '-c:a',
            'copy',
            ...cameraFfmpegArgs,
          ]);
        }
      } else {
        await runFfmpegPass([
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-map_metadata',
          '-1',
          '-map_chapters',
          '-1',
          '-c:v',
          'copy',
          '-c:a',
          'copy',
          ...cameraFfmpegArgs,
        ]);
      }

      const [inStat, ffmpegOutBuffer] = await Promise.all([
        fs.promises.stat(inputPath),
        fs.promises.readFile(outputPath),
      ]);

      // Apply exact Apple QuickTime `moov.meta` (direct child of `moov`), video track
      // `moov.trak[vide].meta` (LensModel + FocalLength), `moov.udta`, wipe `stsd` Lavc strings,
      // neutralize any residual SEI NAL units, rewrite `hdlr`, and patch `stco`/`co64`
      const finalUint8 = stripMp4MetadataInBrowser(
        new Uint8Array(ffmpegOutBuffer),
        cameraProfile,
        effectiveFormat
      );
      const cleanBuffer = Buffer.from(finalUint8);

      const durationMs = Math.max(1, Date.now() - startTime);

      // Immediately clean up temporary files from the server
      await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);

      res.setHeader('Content-Type', outputMime);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${downloadFileName}"`
      );
      res.setHeader('X-Original-Size', String(inStat.size));
      res.setHeader('X-Clean-Size', String(cleanBuffer.byteLength));
      res.setHeader('X-Process-Duration-Ms', String(durationMs));
      res.setHeader('X-Clean-Filename', downloadFileName);
      res.setHeader('X-Camera-Profile', cameraProfile.id);
      res.setHeader('X-Scrub-Mode', scrubMode);
      res.setHeader(
        'Access-Control-Expose-Headers',
        'X-Original-Size, X-Clean-Size, X-Process-Duration-Ms, X-Clean-Filename, X-Camera-Profile, X-Scrub-Mode'
      );

      res.status(200).send(cleanBuffer);
    } catch (error: unknown) {
      // Fallback: if FFmpeg stream copy encounters a non-standard QuickTime data track,
      // perform lossless ISO MP4/MOV atom scrubbing + native QuickTime camera injection directly
      try {
        const rawBuf = await fs.promises.readFile(inputPath);
        const scrubbedArr = stripMp4MetadataInBrowser(
          new Uint8Array(rawBuf),
          cameraProfile,
          effectiveFormat
        );
        const cleanBuffer = Buffer.from(scrubbedArr);
        const durationMs = Math.max(1, Date.now() - startTime);

        await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);

        res.setHeader('Content-Type', outputMime);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${downloadFileName}"`
        );
        res.setHeader('X-Original-Size', String(rawBuf.byteLength));
        res.setHeader('X-Clean-Size', String(cleanBuffer.byteLength));
        res.setHeader('X-Process-Duration-Ms', String(durationMs));
        res.setHeader('X-Clean-Filename', downloadFileName);
        res.setHeader('X-Camera-Profile', cameraProfile.id);
        res.setHeader(
          'Access-Control-Expose-Headers',
          'X-Original-Size, X-Clean-Size, X-Process-Duration-Ms, X-Clean-Filename, X-Camera-Profile'
        );
        res.status(200).send(cleanBuffer);
      } catch (fallbackErr: unknown) {
        await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);
        const message =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : 'Unable to process video file.';
        console.error('Video processing error:', error, message);
        res.status(422).json({
          error: 'Unable to process video file.',
          details: message,
        });
      }
    }
  };

  app.post('/api/strip-metadata', upload.single('video'), handleStripMetadata);
  app.post('/api/remove-metadata', upload.single('video'), handleStripMetadata);

  app.get('/api/download-dist', async (_req: Request, res: Response) => {
    const zipPath = path.join(process.cwd(), 'abubakar-infinityfree-dist.zip');
    if (!fs.existsSync(zipPath)) {
      res.status(404).json({ error: 'dist.zip package not found.' });
      return;
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="abubakar-infinityfree-dist.zip"'
    );
    const zipBuffer = await fs.promises.readFile(zipPath);
    res.status(200).send(zipBuffer);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AB.AIBypass.com (by abubakar) running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

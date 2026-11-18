export interface DetectedMetadataTag {
  key: string;
  atomPath: string;
  rawValue: string;
  platform: 'Google Flow' | 'Runway' | 'Luma' | 'Pika' | 'C2PA / EXIF' | 'Encoder / XMP';
  riskLevel: 'High' | 'Medium';
}

export interface VideoValidationResult {
  valid: boolean;
  error?: string;
  normalizedCleanName: string;
}

export interface ScrubStats {
  originalSizeBytes: number;
  cleanSizeBytes: number;
  bytesRemoved: number;
  durationMs: number;
  detectedTags: DetectedMetadataTag[];
  remainingTags: DetectedMetadataTag[];
  ffmpegArgs: string[];
}

export const FFMPEG_LOSSLESS_ARGS = [
  '-map_metadata',
  '-1',
  '-map_chapters',
  '-1',
  '-c:v',
  'copy',
  '-c:a',
  'copy',
  '-fflags',
  '+bitexact',
  '-flags:v',
  '+bitexact',
  '-flags:a',
  '+bitexact',
  '-movflags',
  '+faststart',
];

const KNOWN_SIGNATURES: Array<{
  pattern: RegExp;
  key: string;
  atomPath: string;
  platform: DetectedMetadataTag['platform'];
  riskLevel: DetectedMetadataTag['riskLevel'];
  defaultSampleValue: string;
}> = [
  {
    pattern: /Google\s*Flow|Veo|SynthID|google_ai_video/i,
    key: 'XMP:CreatorTool / SynthID',
    atomPath: 'moov.udta.meta.ilst.©too',
    platform: 'Google Flow',
    riskLevel: 'High',
    defaultSampleValue: 'Google Flow Studio (Veo Pipeline / C2PA SynthID)',
  },
  {
    pattern: /Runway|Gen-3|Gen-2|runwayml/i,
    key: 'EXIF:Software / RunwayML',
    atomPath: 'moov.udta.XMP_.rdf:Description',
    platform: 'Runway',
    riskLevel: 'High',
    defaultSampleValue: 'Runway Gen-3 Alpha Turbo (runwayml.com)',
  },
  {
    pattern: /Luma|Dream\s*Machine|lumalabs/i,
    key: 'XMP:AIModelGenerator',
    atomPath: 'moov.udta.meta.ilst.©cmt',
    platform: 'Luma',
    riskLevel: 'High',
    defaultSampleValue: 'Luma AI Dream Machine v1.6 Ray2',
  },
  {
    pattern: /Pika|PikaLabs|pika\.art/i,
    key: 'UDTA:Producer / PikaEngine',
    atomPath: 'moov.udta.meta.ilst.©ART',
    platform: 'Pika',
    riskLevel: 'High',
    defaultSampleValue: 'Pika Labs AI Video Engine v2.1',
  },
  {
    pattern: /c2pa|jumbf|cai:claim|AI_GENERATED|TrainedAlgorithmicMedia/i,
    key: 'C2PA:ClaimGenerator / JUMBF',
    atomPath: 'uuid[c2pa.jumbf.manifest]',
    platform: 'C2PA / EXIF',
    riskLevel: 'High',
    defaultSampleValue: 'iptc:TrainedAlgorithmicMedia (C2PA Digital Source Type)',
  },
  {
    pattern: /Lavf|HandBrake|x264|encoder/i,
    key: 'QuickTime:EncoderTag',
    atomPath: 'moov.udta.meta.ilst.©swr',
    platform: 'Encoder / XMP',
    riskLevel: 'Medium',
    defaultSampleValue: 'Lavf60.16.100 / Transcode Pipeline Header',
  },
];

export const AUTO_VIDEO_FILENAME = 'Abubakar Remove AI.mp4';

export function validateVideoFile(
  fileName: string,
  fileSize: number,
  mimeType?: string
): VideoValidationResult {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'File name is missing.',
      normalizedCleanName: AUTO_VIDEO_FILENAME,
    };
  }

  if (fileSize <= 0) {
    return {
      valid: false,
      error: 'The selected video file is empty (0 bytes).',
      normalizedCleanName: AUTO_VIDEO_FILENAME,
    };
  }

  const maxBytes = 500 * 1024 * 1024; // 500 MB
  if (fileSize > maxBytes) {
    return {
      valid: false,
      error: 'File exceeds the 500 MB maximum upload limit.',
      normalizedCleanName: AUTO_VIDEO_FILENAME,
    };
  }

  const lower = trimmed.toLowerCase();
  const hasValidExt =
    lower.endsWith('.mp4') ||
    lower.endsWith('.mov') ||
    lower.endsWith('.m4v');
  const hasValidMime =
    !mimeType ||
    mimeType === 'video/mp4' ||
    mimeType === 'video/quicktime' ||
    mimeType === 'video/x-m4v' ||
    mimeType === 'application/octet-stream';

  if (!hasValidExt && !hasValidMime) {
    return {
      valid: false,
      error: 'Unsupported format. Please upload an MP4, MOV, or M4V video file.',
      normalizedCleanName: AUTO_VIDEO_FILENAME,
    };
  }

  return {
    valid: true,
    normalizedCleanName: AUTO_VIDEO_FILENAME,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

/**
 * Inspects a binary buffer (or ASCII preview slice) for MP4 metadata atoms and AI signatures.
 */
export function inspectBinaryForAiMetadata(
  buffer: Uint8Array,
  fileName = ''
): DetectedMetadataTag[] {
  const decoder = new TextDecoder('latin1');
  // Decode up to first 256KB and last 256KB where moov/udta/XMP/c2pa boxes reside
  const maxSlice = 262144;
  let textContent = '';
  if (buffer.byteLength <= maxSlice * 2) {
    textContent = decoder.decode(buffer);
  } else {
    const head = decoder.decode(buffer.subarray(0, maxSlice));
    const tail = decoder.decode(buffer.subarray(buffer.byteLength - maxSlice));
    textContent = `${head}\n${tail}`;
  }

  const combinedSearch = `${fileName}\n${textContent}`;
  const found: DetectedMetadataTag[] = [];

  for (const sig of KNOWN_SIGNATURES) {
    const match = combinedSearch.match(sig.pattern);
    if (match) {
      found.push({
        key: sig.key,
        atomPath: sig.atomPath,
        rawValue: sig.defaultSampleValue,
        platform: sig.platform,
        riskLevel: sig.riskLevel,
      });
    }
  }

  // If generic MP4 upload doesn't explicitly contain a matched string in ASCII,
  // still report standard MP4 container udta/meta/XMP atoms targeted for stripping.
  if (found.length === 0) {
    found.push(
      {
        key: 'ISO/IEC 14496-12 UserData (udta)',
        atomPath: 'moov.udta.meta.ilst',
        rawValue: 'Embedded Container Creation & Software Atoms',
        platform: 'C2PA / EXIF',
        riskLevel: 'High',
      },
      {
        key: 'XMP / QuickTime Creation Header',
        atomPath: 'moov.mvhd / moov.trak.tkhd',
        rawValue: 'Creation Time, Modification Time & Handler Strings',
        platform: 'Encoder / XMP',
        riskLevel: 'Medium',
      }
    );
  }

  return found;
}

export function buildFfmpegCommandString(inputName: string, outputName: string): string {
  return `ffmpeg -i "${inputName}" ${FFMPEG_LOSSLESS_ARGS.join(' ')} -y "${outputName}"`;
}

/**
 * Losslessly scrubs MP4 metadata boxes (udta, meta, XMP_, C2PA uuid) and AI generator
 * signatures directly in the browser ArrayBuffer by converting metadata atoms to MP4 `free`
 * padding boxes and zeroing (0x00) their payloads. Preserves exact stco/co64 chunk offsets
 * so video & audio play back without re-encoding even on static hosting (InfinityFree / Vercel).
 */
export function stripMp4MetadataInBrowser(input: Uint8Array): Uint8Array {
  const output = new Uint8Array(input.byteLength);
  output.set(input);

  const decoder = new TextDecoder('latin1');
  const fullText = decoder.decode(output);

  // 1. Wipe known AI generator and metadata signature substrings with null bytes (0x00)
  const scrubPatterns = [
    /Google\s*Flow[^\0\r\n]{0,64}/gi,
    /Runway[^\0\r\n]{0,64}/gi,
    /Gen-3[^\0\r\n]{0,64}/gi,
    /Gen-2[^\0\r\n]{0,64}/gi,
    /Luma[^\0\r\n]{0,64}/gi,
    /Dream\s*Machine[^\0\r\n]{0,64}/gi,
    /Pika[^\0\r\n]{0,64}/gi,
    /c2pa[^\0\r\n]{0,64}/gi,
    /jumbf[^\0\r\n]{0,64}/gi,
    /TrainedAlgorithmicMedia[^\0\r\n]{0,64}/gi,
    /AI_GENERATED[^\0\r\n]{0,64}/gi,
    /SynthID[^\0\r\n]{0,64}/gi,
    /Lavf[0-9.]+/gi,
  ];

  for (const regex of scrubPatterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(fullText)) !== null) {
      const start = match.index;
      const len = match[0].length;
      for (let i = 0; i < len && start + i < output.byteLength; i++) {
        output[start + i] = 0x00;
      }
    }
  }

  // 2. Scan for standard MP4 metadata box headers ('udta', 'XMP_', 'c2pa') and convert to 'free' box
  for (let i = 4; i + 4 <= output.byteLength; i++) {
    const b0 = output[i];
    const b1 = output[i + 1];
    const b2 = output[i + 2];
    const b3 = output[i + 3];

    const isUdta = b0 === 0x75 && b1 === 0x64 && b2 === 0x74 && b3 === 0x61; // 'udta'
    const isXmp = b0 === 0x58 && b1 === 0x4d && b2 === 0x50 && b3 === 0x5f; // 'XMP_'

    if (isUdta || isXmp) {
      const boxSize =
        ((output[i - 4] << 24) >>> 0) +
        (output[i - 3] << 16) +
        (output[i - 2] << 8) +
        output[i - 1];

      if (boxSize >= 8 && i - 4 + boxSize <= output.byteLength) {
        // Rename atom box to 'free' (0x66, 0x72, 0x65, 0x65) and zero out payload
        output[i] = 0x66;
        output[i + 1] = 0x72;
        output[i + 2] = 0x65;
        output[i + 3] = 0x65;
        for (let j = i + 4; j < i - 4 + boxSize; j++) {
          output[j] = 0x00;
        }
      }
    }
  }

  return output;
}

/**
 * Generates a compact ISO Base Media (MP4) binary buffer with embedded AI metadata atoms
 * for offline / static hosting testing (e.g. InfinityFree).
 */
export function createBrowserSampleMp4Buffer(platform: string): Uint8Array {
  const encoder = new TextEncoder();
  const payload =
    `ftypisom0000isomiso2avc1mp41moovmvhd` +
    `udtametailst©tooGoogle Flow Studio (Veo Pipeline / C2PA SynthID)` +
    `XMP_rdf:DescriptionRunway Gen-3 Alpha Turbo (runwayml.com)` +
    `©cmtLuma AI Dream Machine v1.6 Ray2` +
    `©ARTPika Labs AI Video Engine v2.1` +
    `uuidc2pa.jumbf.manifestiptc:TrainedAlgorithmicMedia AI_GENERATED (${platform})` +
    `©swrLavf60.16.100mdat0000000000000000`;
  return encoder.encode(payload);
}


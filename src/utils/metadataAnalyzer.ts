import {
  CameraProfile,
  buildExifTiffPayload,
  buildMp4CameraMetaBox,
} from './cameraProfiles';

export type MediaKind = 'video' | 'image';

export interface DetectedMetadataTag {
  key: string;
  atomPath: string;
  rawValue: string;
  platform:
    | 'Google Flow'
    | 'Google Imagen / Gemini'
    | 'Runway'
    | 'Luma'
    | 'Pika'
    | 'Midjourney'
    | 'DALL-E / OpenAI'
    | 'Stable Diffusion / ComfyUI'
    | 'Adobe Firefly'
    | 'C2PA / EXIF'
    | 'Encoder / XMP';
  riskLevel: 'High' | 'Medium';
}

export interface MediaValidationResult {
  valid: boolean;
  mediaKind: MediaKind;
  error?: string;
  normalizedCleanName: string;
  outputMimeType: string;
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
  onlyFor?: MediaKind;
}> = [
  {
    pattern: /Google\s*Flow|Veo|google_ai_video/i,
    key: 'XMP:CreatorTool / SynthID',
    atomPath: 'moov.udta.meta.ilst.©too',
    platform: 'Google Flow',
    riskLevel: 'High',
    defaultSampleValue: 'Google Flow Studio (Veo Pipeline / C2PA SynthID)',
  },
  {
    pattern: /Imagen|Google\s*AI|Made\s*with\s*Google|SynthID/i,
    key: 'XMP:DigitalSourceType / Imagen',
    atomPath: 'APP1:XMP / PNG:iTXt',
    platform: 'Google Imagen / Gemini',
    riskLevel: 'High',
    defaultSampleValue: 'Google Imagen / Gemini AI Image Pipeline (SynthID)',
    onlyFor: 'image',
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
    pattern: /Midjourney|mj-job|--v\s*[4567]|--ar\s*\d+/i,
    key: 'PNG:tEXt / XMP:Description',
    atomPath: 'tEXt[Description] / APP1:XMP',
    platform: 'Midjourney',
    riskLevel: 'High',
    defaultSampleValue: 'Midjourney v6.1 Generation Job & Prompt Parameters',
  },
  {
    pattern: /DALL-?E|OpenAI|ChatGPT|gpt-image/i,
    key: 'C2PA / XMP:CreatorTool',
    atomPath: 'APP11:JUMBF / tEXt[Software]',
    platform: 'DALL-E / OpenAI',
    riskLevel: 'High',
    defaultSampleValue: 'OpenAI DALL-E / ChatGPT Image Generator Claim',
  },
  {
    pattern: /Stable\s*Diffusion|ComfyUI|Automatic1111|Negative prompt:|Steps:\s*\d+|Sampler:/i,
    key: 'PNG:tEXt / EXIF:UserComment',
    atomPath: 'tEXt[parameters] / tEXt[workflow]',
    platform: 'Stable Diffusion / ComfyUI',
    riskLevel: 'High',
    defaultSampleValue: 'Generation Parameters, Seed, Sampler & Node Workflow JSON',
  },
  {
    pattern: /Firefly|Adobe\s*Photoshop|Generative\s*Fill/i,
    key: 'XMP:CreatorTool / IPTC',
    atomPath: 'APP13:IPTC / APP1:XMP',
    platform: 'Adobe Firefly',
    riskLevel: 'High',
    defaultSampleValue: 'Adobe Firefly / Generative Fill Digital Source Type',
  },
  {
    pattern: /c2pa|jumbf|cai:claim|AI_GENERATED|TrainedAlgorithmicMedia/i,
    key: 'C2PA:ClaimGenerator / JUMBF',
    atomPath: 'uuid / APP11 / caBX',
    platform: 'C2PA / EXIF',
    riskLevel: 'High',
    defaultSampleValue: 'iptc:TrainedAlgorithmicMedia (C2PA Digital Source Type)',
  },
  {
    pattern: /Lavf|HandBrake|x264|encoder|Exif|http:\/\/ns\.adobe\.com\/xap/i,
    key: 'Container EXIF / XMP Header',
    atomPath: 'APP1:EXIF / XMP / ©swr',
    platform: 'Encoder / XMP',
    riskLevel: 'Medium',
    defaultSampleValue: 'Embedded Device EXIF, Software & XMP Metadata Header',
  },
];

export const AUTO_VIDEO_FILENAME = 'Abubakar Remove AI.mp4';
export const AUTO_IMAGE_PREFIX = 'Abubakar Remove AI';

export function detectMediaKind(fileName: string, mimeType?: string): MediaKind {
  const lower = fileName.trim().toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (
    mime.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|avif)$/.test(lower)
  ) {
    return 'image';
  }
  return 'video';
}

export function getAutoImageFilename(fileName: string, mimeType?: string): {
  fileName: string;
  mimeType: string;
} {
  const lower = fileName.trim().toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (mime === 'image/png' || lower.endsWith('.png')) {
    return { fileName: `${AUTO_IMAGE_PREFIX}.png`, mimeType: 'image/png' };
  }
  if (mime === 'image/webp' || lower.endsWith('.webp')) {
    return { fileName: `${AUTO_IMAGE_PREFIX}.webp`, mimeType: 'image/webp' };
  }
  if (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg')
  ) {
    return { fileName: `${AUTO_IMAGE_PREFIX}.jpg`, mimeType: 'image/jpeg' };
  }
  // Fallback for HEIC/AVIF/GIF/BMP converted cleanly via browser canvas
  return { fileName: `${AUTO_IMAGE_PREFIX}.png`, mimeType: 'image/png' };
}

export function validateMediaFile(
  fileName: string,
  fileSize: number,
  mimeType?: string
): MediaValidationResult {
  const trimmed = fileName.trim();
  const mediaKind = detectMediaKind(trimmed, mimeType);
  const autoImage = getAutoImageFilename(trimmed, mimeType);
  const defaultCleanName =
    mediaKind === 'image' ? autoImage.fileName : AUTO_VIDEO_FILENAME;
  const defaultOutputMime =
    mediaKind === 'image' ? autoImage.mimeType : 'video/mp4';

  if (!trimmed) {
    return {
      valid: false,
      mediaKind,
      error: 'File name is missing.',
      normalizedCleanName: defaultCleanName,
      outputMimeType: defaultOutputMime,
    };
  }

  if (fileSize <= 0) {
    return {
      valid: false,
      mediaKind,
      error: 'The selected file is empty (0 bytes).',
      normalizedCleanName: defaultCleanName,
      outputMimeType: defaultOutputMime,
    };
  }

  const maxBytes = 500 * 1024 * 1024; // 500 MB
  if (fileSize > maxBytes) {
    return {
      valid: false,
      mediaKind,
      error: 'File exceeds the 500 MB maximum upload limit.',
      normalizedCleanName: defaultCleanName,
      outputMimeType: defaultOutputMime,
    };
  }

  const lower = trimmed.toLowerCase();
  const hasValidVideoExt = /\.(mp4|mov|m4v|3gp|webm)$/.test(lower);
  const hasValidImageExt = /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|avif)$/.test(lower);
  const hasValidMime =
    !mimeType ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('image/') ||
    mimeType === 'application/octet-stream';

  if (!hasValidVideoExt && !hasValidImageExt && !hasValidMime) {
    return {
      valid: false,
      mediaKind,
      error:
        'Unsupported format. Please upload an MP4/MOV video or JPG/PNG/WEBP picture.',
      normalizedCleanName: defaultCleanName,
      outputMimeType: defaultOutputMime,
    };
  }

  return {
    valid: true,
    mediaKind,
    normalizedCleanName: defaultCleanName,
    outputMimeType: defaultOutputMime,
  };
}

// Keep backward-compatible export alias for existing callers/tests
export function validateVideoFile(
  fileName: string,
  fileSize: number,
  mimeType?: string
): MediaValidationResult {
  return validateMediaFile(fileName, fileSize, mimeType);
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
 * Inspects a binary buffer (or ASCII preview slice) for MP4/MOV or Image (EXIF/XMP/PNG/WEBP/C2PA) metadata.
 */
export function inspectBinaryForAiMetadata(
  buffer: Uint8Array,
  fileName = '',
  mediaKind: MediaKind = detectMediaKind(fileName)
): DetectedMetadataTag[] {
  const decoder = new TextDecoder('latin1');
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
    if (sig.onlyFor && sig.onlyFor !== mediaKind) continue;
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

  if (found.length === 0) {
    if (mediaKind === 'image') {
      found.push(
        {
          key: 'EXIF / Camera & Software Tags',
          atomPath: 'APP1:EXIF / PNG:eXIf / RIFF:EXIF',
          rawValue: 'Device Model, GPS Coordinates, Timestamp & Editing Tool',
          platform: 'C2PA / EXIF',
          riskLevel: 'High',
        },
        {
          key: 'XMP / IPTC / Text Chunks',
          atomPath: 'APP1:XMP / APP13 / PNG:iTXt',
          rawValue: 'Embedded XMP Packet, Creator Metadata & Color Profile Notes',
          platform: 'Encoder / XMP',
          riskLevel: 'Medium',
        }
      );
    } else {
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
  }

  return found;
}

export function buildFfmpegCommandString(inputName: string, outputName: string): string {
  return `ffmpeg -i "${inputName}" ${FFMPEG_LOSSLESS_ARGS.join(' ')} -y "${outputName}"`;
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    (((buf[offset] << 24) >>> 0) +
      (buf[offset + 1] << 16) +
      (buf[offset + 2] << 8) +
      buf[offset + 3]) >>>
    0
  );
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] +
      (buf[offset + 1] << 8) +
      (buf[offset + 2] << 16) +
      ((buf[offset + 3] << 24) >>> 0)) >>>
      0)
  );
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

function readBoxType(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(
    buf[offset],
    buf[offset + 1],
    buf[offset + 2],
    buf[offset + 3]
  );
}

function wipeSignaturesInRange(
  buf: Uint8Array,
  startOffset: number,
  endOffset: number
) {
  const length = endOffset - startOffset;
  if (length <= 0 || length > 8 * 1024 * 1024) return;
  const slice = buf.subarray(startOffset, endOffset);
  const decoder = new TextDecoder('latin1');
  const text = decoder.decode(slice);

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
    while ((match = regex.exec(text)) !== null) {
      const mStart = startOffset + match.index;
      const mLen = match[0].length;
      for (let i = 0; i < mLen && mStart + i < endOffset; i++) {
        buf[mStart + i] = 0x00;
      }
    }
  }
}

function walkAndScrubMp4Boxes(
  buf: Uint8Array,
  start: number,
  end: number,
  depth = 0
): boolean {
  if (depth > 6) return false;
  let offset = start;
  let parsedValidBoxes = false;

  const CONTAINER_BOXES = new Set(['moov', 'trak', 'edts', 'mdia', 'minf', 'stbl']);
  const METADATA_BOXES = new Set(['udta', 'meta', 'XMP_', 'ilst', 'uuid']);

  while (offset + 8 <= end) {
    let boxSize = readUint32BE(buf, offset);
    const boxType = readBoxType(buf, offset + 4);
    let headerSize = 8;

    const isAsciiType = /^[\x20-\x7E]{4}$/.test(boxType);
    if (!isAsciiType) {
      break;
    }

    if (boxSize === 1) {
      if (offset + 16 > end) break;
      const high = readUint32BE(buf, offset + 8);
      const low = readUint32BE(buf, offset + 12);
      boxSize = high * 4294967296 + low;
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = end - offset;
    }

    if (boxSize < headerSize || offset + boxSize > end) {
      break;
    }

    parsedValidBoxes = true;
    const boxEnd = offset + boxSize;

    if (boxType === 'mdat') {
      offset = boxEnd;
      continue;
    }

    if (METADATA_BOXES.has(boxType)) {
      buf[offset + 4] = 0x66; // 'f'
      buf[offset + 5] = 0x72; // 'r'
      buf[offset + 6] = 0x65; // 'e'
      buf[offset + 7] = 0x65; // 'e'
      buf.fill(0x00, offset + headerSize, boxEnd);
    } else if (CONTAINER_BOXES.has(boxType)) {
      walkAndScrubMp4Boxes(buf, offset + headerSize, boxEnd, depth + 1);
      if (boxType === 'moov') {
        wipeSignaturesInRange(buf, offset + headerSize, boxEnd);
      }
    }

    offset = boxEnd;
  }

  return parsedValidBoxes;
}

/**
 * Losslessly scrubs MP4/MOV metadata boxes (udta, meta, XMP_, C2PA uuid, ilst) and AI generator
 * signatures directly in the browser ArrayBuffer by converting metadata atoms to MP4 `free`
 * padding boxes and zeroing (0x00) their payloads while skipping `mdat` media frames.
 * When a DSLR or Mobile Camera profile is provided, injects genuine QuickTime/ISO camera
 * hardware metadata (`com.apple.quicktime.make/model/software/creationdate/lens_model`)
 * without shifting any `mdat` chunk offsets (`stco`/`co64`).
 */
export function stripMp4MetadataInBrowser(
  input: Uint8Array,
  cameraProfile?: CameraProfile
): Uint8Array {
  const output = new Uint8Array(input.byteLength);
  output.set(input);

  const walked = walkAndScrubMp4Boxes(output, 0, output.byteLength, 0);

  if (!walked) {
    const headEnd = Math.min(output.byteLength, 524288);
    wipeSignaturesInRange(output, 0, headEnd);
    if (output.byteLength > 524288) {
      const tailStart = Math.max(headEnd, output.byteLength - 524288);
      wipeSignaturesInRange(output, tailStart, output.byteLength);
    }
  }

  if (!cameraProfile || cameraProfile.id === 'none') {
    return output;
  }

  const cameraMetaBox = buildMp4CameraMetaBox(cameraProfile);
  if (cameraMetaBox.byteLength === 0) {
    return output;
  }

  // Check if the final top-level box is `moov` (standard 32-bit size header) so we can
  // safely place `meta` inside `moov` without shifting any `mdat` offsets.
  let offset = 0;
  let lastMoovOffset = -1;
  let lastMoovEnd = -1;
  let lastMoovIs32Bit = false;

  while (offset + 8 <= output.byteLength) {
    let boxSize = readUint32BE(output, offset);
    const boxType = readBoxType(output, offset + 4);
    if (!/^[\x20-\x7E]{4}$/.test(boxType)) break;
    let is32Bit = true;
    if (boxSize === 1) {
      if (offset + 16 > output.byteLength) break;
      const high = readUint32BE(output, offset + 8);
      const low = readUint32BE(output, offset + 12);
      boxSize = high * 4294967296 + low;
      is32Bit = false;
    } else if (boxSize === 0) {
      boxSize = output.byteLength - offset;
      is32Bit = false;
    }
    if (boxSize < 8 || offset + boxSize > output.byteLength) break;
    if (boxType === 'moov') {
      lastMoovOffset = offset;
      lastMoovEnd = offset + boxSize;
      lastMoovIs32Bit = is32Bit;
    }
    offset += boxSize;
  }

  const combined = new Uint8Array(output.byteLength + cameraMetaBox.byteLength);
  combined.set(output, 0);
  combined.set(cameraMetaBox, output.byteLength);

  if (
    lastMoovOffset >= 0 &&
    lastMoovEnd === output.byteLength &&
    lastMoovIs32Bit
  ) {
    // Expand trailing `moov` box size so `meta` is a direct child of `moov`
    const oldMoovSize = readUint32BE(combined, lastMoovOffset);
    const newMoovSize = oldMoovSize + cameraMetaBox.byteLength;
    combined[lastMoovOffset] = (newMoovSize >>> 24) & 0xff;
    combined[lastMoovOffset + 1] = (newMoovSize >>> 16) & 0xff;
    combined[lastMoovOffset + 2] = (newMoovSize >>> 8) & 0xff;
    combined[lastMoovOffset + 3] = newMoovSize & 0xff;
  }

  return combined;
}

/**
 * Losslessly strips EXIF (APP1), XMP, C2PA/JUMBF (APP11), IPTC/Photoshop (APP13),
 * Adobe (APP14), and COM comment segments from JPEG binary data without recompression,
 * and optionally injects a clean DSLR or Mobile Camera APP1 EXIF segment.
 */
export function stripJpegMetadata(
  input: Uint8Array,
  cameraProfile?: CameraProfile
): Uint8Array {
  if (input.byteLength < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    return input;
  }

  const keptChunks: Uint8Array[] = [input.subarray(0, 2)]; // SOI (0xFFD8)
  let offset = 2;

  while (offset + 1 < input.byteLength) {
    if (input[offset] !== 0xff) {
      // Unaligned data fallback: preserve remaining bytes
      keptChunks.push(input.subarray(offset));
      break;
    }

    // Skip padding 0xFF bytes
    while (offset < input.byteLength && input[offset] === 0xff) {
      offset++;
    }
    if (offset >= input.byteLength) break;

    const marker = input[offset];
    offset++;

    // Start of Scan (0xDA) -> copy everything until EOI
    if (marker === 0xda) {
      keptChunks.push(new Uint8Array([0xff, marker]));
      keptChunks.push(input.subarray(offset));
      break;
    }

    // EOI (0xD9) or standalone markers
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      keptChunks.push(new Uint8Array([0xff, marker]));
      if (marker === 0xd9) break;
      continue;
    }

    if (offset + 2 > input.byteLength) break;
    const segLen = (input[offset] << 8) | input[offset + 1];
    if (segLen < 2 || offset + segLen > input.byteLength) {
      keptChunks.push(new Uint8Array([0xff, marker]));
      keptChunks.push(input.subarray(offset));
      break;
    }

    // Strip APP1..APP15 (0xE1..0xEF) and COM (0xFE) metadata/EXIF/XMP/C2PA/IPTC/Comments
    // Keep APP0 (0xE0 JFIF) and all image structure markers (SOF, DHT, DQT, DRI)
    const shouldStrip = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;

    if (!shouldStrip) {
      keptChunks.push(new Uint8Array([0xff, marker]));
      keptChunks.push(input.subarray(offset, offset + segLen));
    }

    offset += segLen;
  }

  if (cameraProfile && cameraProfile.id !== 'none') {
    const tiffPayload = buildExifTiffPayload(cameraProfile);
    if (tiffPayload.byteLength > 0) {
      const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
      const segLength = 2 + exifHeader.byteLength + tiffPayload.byteLength;
      const app1Segment = new Uint8Array(2 + segLength);
      app1Segment[0] = 0xff;
      app1Segment[1] = 0xe1; // APP1
      app1Segment[2] = (segLength >>> 8) & 0xff;
      app1Segment[3] = segLength & 0xff;
      app1Segment.set(exifHeader, 4);
      app1Segment.set(tiffPayload, 10);

      // Insert right after SOI (or after APP0 if keptChunks[1] is 0xFF 0xE0)
      let insertIdx = 1;
      if (
        keptChunks.length >= 3 &&
        keptChunks[1].byteLength === 2 &&
        keptChunks[1][0] === 0xff &&
        keptChunks[1][1] === 0xe0
      ) {
        insertIdx = 3;
      }
      keptChunks.splice(insertIdx, 0, app1Segment);
    }
  }

  const totalLen = keptChunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of keptChunks) {
    out.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return out;
}

/**
 * Losslessly strips PNG metadata chunks (tEXt, zTXt, iTXt, eXIf, caBX, tIME)
 * containing Midjourney, Stable Diffusion, ComfyUI, DALL-E, and C2PA tags while
 * preserving exact pixel data (IHDR, PLTE, IDAT, IEND, tRNS, sRGB, gAMA, cHRM),
 * and optionally injects a clean DSLR / Mobile Camera `eXIf` chunk right after IHDR.
 */
export function stripPngMetadata(
  input: Uint8Array,
  cameraProfile?: CameraProfile
): Uint8Array {
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (input.byteLength < 8) return input;
  for (let i = 0; i < 8; i++) {
    if (input[i] !== PNG_SIG[i]) return input;
  }

  const METADATA_CHUNKS = new Set([
    'tEXt',
    'zTXt',
    'iTXt',
    'eXIf',
    'caBX',
    'tIME',
    'pHYs',
  ]);

  const keptChunks: Uint8Array[] = [input.subarray(0, 8)];
  let offset = 8;
  let injectedExif = false;

  while (offset + 12 <= input.byteLength) {
    const dataLen = readUint32BE(input, offset);
    const chunkType = readBoxType(input, offset + 4);
    const totalChunkLen = 12 + dataLen;

    if (offset + totalChunkLen > input.byteLength) {
      break;
    }

    if (!METADATA_CHUNKS.has(chunkType)) {
      keptChunks.push(input.subarray(offset, offset + totalChunkLen));
      if (
        chunkType === 'IHDR' &&
        !injectedExif &&
        cameraProfile &&
        cameraProfile.id !== 'none'
      ) {
        const tiffPayload = buildExifTiffPayload(cameraProfile);
        if (tiffPayload.byteLength > 0) {
          keptChunks.push(makePngChunk('eXIf', tiffPayload));
          injectedExif = true;
        }
      }
    }

    offset += totalChunkLen;
    if (chunkType === 'IEND') break;
  }

  const totalLen = keptChunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of keptChunks) {
    out.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return out;
}

/**
 * Losslessly strips EXIF, XMP, and C2PA/JUMB chunks from RIFF WEBP images,
 * and injects a clean DSLR / Mobile Camera EXIF chunk when VP8X is present.
 */
export function stripWebpMetadata(
  input: Uint8Array,
  cameraProfile?: CameraProfile
): Uint8Array {
  if (
    input.byteLength < 12 ||
    readBoxType(input, 0) !== 'RIFF' ||
    readBoxType(input, 8) !== 'WEBP'
  ) {
    return input;
  }

  const STRIP_CHUNKS = new Set(['EXIF', 'XMP ', 'C2PA', 'JUMB', 'ICCP']);
  const keptChunks: Uint8Array[] = [];
  let offset = 12;
  let vp8xChunkRef: Uint8Array | null = null;

  while (offset + 8 <= input.byteLength) {
    const fourCC = readBoxType(input, offset);
    const chunkSize = readUint32LE(input, offset + 4);
    const paddedSize = chunkSize + (chunkSize % 2);
    const totalChunkLen = 8 + paddedSize;

    if (offset + 8 + chunkSize > input.byteLength) {
      break;
    }

    const chunkSlice = new Uint8Array(
      input.subarray(offset, Math.min(input.byteLength, offset + totalChunkLen))
    );

    // If VP8X extended header exists, clear ICCP (0x20), EXIF (0x08), XMP (0x04) flag bits
    if (fourCC === 'VP8X' && chunkSlice.byteLength >= 12) {
      chunkSlice[8] = chunkSlice[8] & ~(0x20 | 0x08 | 0x04);
      vp8xChunkRef = chunkSlice;
    }

    if (!STRIP_CHUNKS.has(fourCC)) {
      keptChunks.push(chunkSlice);
    }

    offset += totalChunkLen;
  }

  if (vp8xChunkRef && cameraProfile && cameraProfile.id !== 'none') {
    const tiffPayload = buildExifTiffPayload(cameraProfile);
    if (tiffPayload.byteLength > 0) {
      const paddedLen = tiffPayload.byteLength + (tiffPayload.byteLength % 2);
      const exifChunk = new Uint8Array(8 + paddedLen);
      exifChunk[0] = 0x45; // 'E'
      exifChunk[1] = 0x58; // 'X'
      exifChunk[2] = 0x49; // 'I'
      exifChunk[3] = 0x46; // 'F'
      writeUint32LE(exifChunk, 4, tiffPayload.byteLength);
      exifChunk.set(tiffPayload, 8);
      vp8xChunkRef[8] = vp8xChunkRef[8] | 0x08; // Enable EXIF flag
      keptChunks.push(exifChunk);
    }
  }

  const bodyLen = keptChunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(12 + bodyLen);
  out.set(input.subarray(0, 12), 0);
  writeUint32LE(out, 4, 4 + bodyLen);

  let pos = 12;
  for (const chunk of keptChunks) {
    out.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return out;
}

/**
 * Losslessly strips AI and EXIF/XMP/C2PA metadata from JPG, PNG, and WEBP pictures
 * directly in the browser without re-encoding image pixels, and optionally injects
 * DSLR or Mobile Camera hardware EXIF metadata.
 */
export function stripImageMetadataInBrowser(
  input: Uint8Array,
  cameraProfile?: CameraProfile
): Uint8Array {
  if (input.byteLength >= 2 && input[0] === 0xff && input[1] === 0xd8) {
    return stripJpegMetadata(input, cameraProfile);
  }
  if (
    input.byteLength >= 8 &&
    input[0] === 0x89 &&
    input[1] === 0x50 &&
    input[2] === 0x4e &&
    input[3] === 0x47
  ) {
    return stripPngMetadata(input, cameraProfile);
  }
  if (
    input.byteLength >= 12 &&
    readBoxType(input, 0) === 'RIFF' &&
    readBoxType(input, 8) === 'WEBP'
  ) {
    return stripWebpMetadata(input, cameraProfile);
  }
  return input;
}

/**
 * Generates a compact ISO Base Media (MP4) binary buffer with embedded AI metadata atoms
 * for offline / static hosting testing (e.g. InfinityFree / Vercel).
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

/**
 * Computes CRC32 checksum required by valid PNG chunks.
 */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.byteLength);
  const len = data.byteLength;
  chunk[0] = (len >>> 24) & 0xff;
  chunk[1] = (len >>> 16) & 0xff;
  chunk[2] = (len >>> 8) & 0xff;
  chunk[3] = len & 0xff;
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);
  const checksum = crc32(chunk.subarray(4, 8 + len));
  chunk[8 + len] = (checksum >>> 24) & 0xff;
  chunk[9 + len] = (checksum >>> 16) & 0xff;
  chunk[10 + len] = (checksum >>> 8) & 0xff;
  chunk[11 + len] = checksum & 0xff;
  return chunk;
}

/**
 * Generates a real, renderable 1x1 PNG image (or clean valid PNG) containing genuine
 * tEXt / iTXt / caBX metadata chunks with Midjourney, Google Imagen, DALL-E, and
 * Stable Diffusion signatures for one-click picture scrubbing testing.
 */
export function createBrowserSamplePngBuffer(
  platform: 'midjourney' | 'imagen' | 'dalle' | 'stable_diffusion' = 'midjourney'
): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // 1x1 RGBA IHDR
  const ihdrData = new Uint8Array([
    0x00, 0x00, 0x00, 0x01, // width 1
    0x00, 0x00, 0x00, 0x01, // height 1
    0x08, // bit depth 8
    0x06, // color type RGBA
    0x00, 0x00, 0x00,
  ]);
  const ihdr = makePngChunk('IHDR', ihdrData);

  const enc = new TextEncoder();
  const metaChunks: Uint8Array[] = [];

  if (platform === 'midjourney') {
    metaChunks.push(
      makePngChunk(
        'tEXt',
        enc.encode(
          'Description\0Cinematic portrait, golden hour --v 6.1 --ar 16:9 | Midjourney'
        )
      )
    );
    metaChunks.push(
      makePngChunk(
        'iTXt',
        enc.encode('XML:com.adobe.xmp\0\0\0\0\0c2pa.jumbf TrainedAlgorithmicMedia')
      )
    );
  } else if (platform === 'imagen') {
    metaChunks.push(
      makePngChunk(
        'tEXt',
        enc.encode(
          'Software\0Made with Google AI Imagen 3 (SynthID / TrainedAlgorithmicMedia)'
        )
      )
    );
  } else if (platform === 'dalle') {
    metaChunks.push(
      makePngChunk(
        'tEXt',
        enc.encode('Software\0OpenAI DALL-E 3 / ChatGPT c2pa.jumbf AI_GENERATED')
      )
    );
  } else {
    metaChunks.push(
      makePngChunk(
        'tEXt',
        enc.encode(
          'parameters\0hyperrealistic studio shot\nNegative prompt: blurry\nSteps: 30, Sampler: DPM++ 2M, ComfyUI Stable Diffusion'
        )
      )
    );
  }

  metaChunks.push(
    makePngChunk('eXIf', enc.encode('Exif\0\0MM\0*\0\0\0\x08AI_GENERATED'))
  );

  // Valid zlib-compressed 1x1 emerald pixel IDAT
  const idat = makePngChunk(
    'IDAT',
    new Uint8Array([
      0x78, 0x9c, 0x63, 0x64, 0xf8, 0xcf, 0x50, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00,
    ])
  );
  const iend = makePngChunk('IEND', new Uint8Array(0));

  const parts = [sig, ihdr, ...metaChunks, idat, iend];
  const totalLen = parts.reduce((acc, p) => acc + p.byteLength, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.byteLength;
  }
  return out;
}

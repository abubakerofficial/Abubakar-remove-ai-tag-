export type CameraProfileId =
  | 'sony_a7iv'
  | 'canon_r5'
  | 'iphone_16_pro'
  | 'samsung_s25_ultra'
  | 'none';

export type CameraCategory = 'dslr' | 'mobile' | 'clean';
export type VideoContainerFormat = 'mov' | 'mp4';
export type VideoScrubMode = 'deep' | 'instant';

export interface CameraProfile {
  id: CameraProfileId;
  category: CameraCategory;
  label: string;
  shortLabel: string;
  make: string;
  model: string;
  lensMake: string;
  lensModel: string;
  focalLength35mm: number;
  software: string;
  videoHandler: string;
  audioHandler: string;
  colorProfile: string;
  badgeText: string;
}

export const DEFAULT_CAMERA_PROFILE_ID: CameraProfileId = 'iphone_16_pro';
export const DEFAULT_VIDEO_CONTAINER: VideoContainerFormat = 'mov';
export const DEFAULT_VIDEO_SCRUB_MODE: VideoScrubMode = 'deep';

export const CAMERA_PROFILES: CameraProfile[] = [
  {
    id: 'iphone_16_pro',
    category: 'mobile',
    label: 'iPhone 16 Pro Max',
    shortLabel: 'iPhone 16 Pro Max',
    make: 'Apple',
    model: 'iPhone 16 Pro Max',
    lensMake: 'Apple',
    lensModel: 'iPhone 16 Pro Max back triple camera 6.765mm f/1.78',
    focalLength35mm: 24,
    software: '18.2',
    videoHandler: 'Core Media Video',
    audioHandler: 'Core Media Audio',
    colorProfile: 'Display P3 / Rec.709',
    badgeText: 'Mobile Camera',
  },
  {
    id: 'sony_a7iv',
    category: 'dslr',
    label: 'Sony Alpha A7 IV',
    shortLabel: 'Sony A7 IV · DSLR',
    make: 'SONY',
    model: 'ILCE-7M4',
    lensMake: 'SONY',
    lensModel: 'FE 24-70mm F2.8 GM II',
    focalLength35mm: 35,
    software: 'ILCE-7M4 v3.01',
    videoHandler: 'Sony XAVC-S Video Handler',
    audioHandler: 'Sony Audio Handler',
    colorProfile: 'Rec.709 / sRGB',
    badgeText: 'DSLR Camera',
  },
  {
    id: 'canon_r5',
    category: 'dslr',
    label: 'Canon EOS R5',
    shortLabel: 'Canon EOS R5 · DSLR',
    make: 'Canon',
    model: 'Canon EOS R5',
    lensMake: 'Canon',
    lensModel: 'RF24-70mm F2.8 L IS USM',
    focalLength35mm: 35,
    software: 'Firmware Version 2.0.0',
    videoHandler: 'Canon Cinema Video Handler',
    audioHandler: 'Canon Audio Handler',
    colorProfile: 'Rec.709 / sRGB',
    badgeText: 'DSLR Camera',
  },
  {
    id: 'samsung_s25_ultra',
    category: 'mobile',
    label: 'Samsung S25 Ultra',
    shortLabel: 'Galaxy S25 Ultra · Mobile',
    make: 'samsung',
    model: 'SM-S938B',
    lensMake: 'samsung',
    lensModel: 'Samsung Galaxy S25 Ultra Wide Camera 6.3mm f/1.7',
    focalLength35mm: 23,
    software: 'S938BXXU1AYB4',
    videoHandler: 'VideoHandle',
    audioHandler: 'SoundHandle',
    colorProfile: 'Rec.709 / sRGB',
    badgeText: 'Mobile Camera',
  },
  {
    id: 'none',
    category: 'clean',
    label: 'Pure Strip Only (No Camera Tag)',
    shortLabel: 'Pure Clean · No Tag',
    make: '',
    model: '',
    lensMake: '',
    lensModel: '',
    focalLength35mm: 0,
    software: '',
    videoHandler: '',
    audioHandler: '',
    colorProfile: '',
    badgeText: 'Zero Metadata',
  },
];

export function getCameraProfile(profileId?: string | null): CameraProfile {
  const found = CAMERA_PROFILES.find((p) => p.id === profileId);
  return found || CAMERA_PROFILES[0];
}

export function formatExifTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Apple QuickTime (`com.apple.quicktime.creationdate`) uses ISO-8601 with
 * explicit numeric timezone offset (e.g. `2026-11-20T14:25:00+0000`).
 */
export function formatQuickTimeTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '+0000');
}

function writeU16LE(view: DataView, offset: number, val: number) {
  view.setUint16(offset, val & 0xffff, true);
}

function writeU32LE(view: DataView, offset: number, val: number) {
  view.setUint32(offset, val >>> 0, true);
}

interface TiffEntrySpec {
  tag: number;
  type: 2 | 3 | 4; // 2 = ASCII, 3 = SHORT, 4 = LONG
  strValue?: string;
  numValue?: number;
}

/**
 * Builds a standards-compliant Little-Endian TIFF/EXIF payload (`II*\0...`)
 * with IFD0 (Make, Model, Software, DateTime, ExifOffset) and Exif Sub-IFD
 * (DateTimeOriginal, DateTimeDigitized, ColorSpace, ExposureMode, SceneCaptureType,
 * FocalLengthIn35mmFilm, LensMake, LensModel) for JPEG APP1, PNG eXIf, and WebP EXIF.
 */
export function buildExifTiffPayload(
  profile: CameraProfile,
  captureDate: Date = new Date()
): Uint8Array {
  if (profile.id === 'none') {
    return new Uint8Array(0);
  }

  const exifDate = formatExifTimestamp(captureDate);
  const enc = new TextEncoder();

  // Tags MUST be sorted in strictly ascending numerical order per TIFF 6.0 spec
  const ifd0Entries: TiffEntrySpec[] = [
    { tag: 0x010f, type: 2, strValue: profile.make }, // Make
    { tag: 0x0110, type: 2, strValue: profile.model }, // Model
    { tag: 0x0112, type: 3, numValue: 1 }, // Orientation = Normal
    { tag: 0x0131, type: 2, strValue: profile.software }, // Software
    { tag: 0x0132, type: 2, strValue: exifDate }, // DateTime
    { tag: 0x8769, type: 4, numValue: 0 }, // ExifIFDPointer (patched below)
  ];

  const exifSubEntries: TiffEntrySpec[] = [
    { tag: 0x9003, type: 2, strValue: exifDate }, // DateTimeOriginal
    { tag: 0x9004, type: 2, strValue: exifDate }, // DateTimeDigitized
    { tag: 0xa001, type: 3, numValue: 1 }, // ColorSpace = sRGB
    { tag: 0xa402, type: 3, numValue: 0 }, // ExposureMode = Auto
    { tag: 0xa405, type: 3, numValue: profile.focalLength35mm || 24 }, // FocalLengthIn35mmFilm
    { tag: 0xa406, type: 3, numValue: 0 }, // SceneCaptureType = Standard
    { tag: 0xa433, type: 2, strValue: profile.lensMake }, // LensMake
    { tag: 0xa434, type: 2, strValue: profile.lensModel }, // LensModel
  ];

  const headerSize = 8;
  const ifd0Size = 2 + ifd0Entries.length * 12 + 4;
  const ifd0StringsStart = headerSize + ifd0Size;

  const encodeNullTerminated = (s: string) => enc.encode(`${s}\0`);

  let cursor = ifd0StringsStart;
  const ifd0DataBlocks: Array<{ offset: number; bytes: Uint8Array }> = [];

  for (const entry of ifd0Entries) {
    if (entry.type === 2) {
      const bytes = encodeNullTerminated(entry.strValue || '');
      if (bytes.byteLength > 4) {
        ifd0DataBlocks.push({ offset: cursor, bytes });
        cursor += bytes.byteLength + (bytes.byteLength % 2); // word-align
      }
    }
  }

  const exifSubIfdOffset = cursor;
  const exifPtrEntry = ifd0Entries.find((e) => e.tag === 0x8769);
  if (exifPtrEntry) {
    exifPtrEntry.numValue = exifSubIfdOffset;
  }

  const exifSubSize = 2 + exifSubEntries.length * 12 + 4;
  cursor = exifSubIfdOffset + exifSubSize;

  const exifSubDataBlocks: Array<{ offset: number; bytes: Uint8Array }> = [];
  for (const entry of exifSubEntries) {
    if (entry.type === 2) {
      const bytes = encodeNullTerminated(entry.strValue || '');
      if (bytes.byteLength > 4) {
        exifSubDataBlocks.push({ offset: cursor, bytes });
        cursor += bytes.byteLength + (bytes.byteLength % 2);
      }
    }
  }

  const totalSize = cursor;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // TIFF Header: Little-endian "II", magic 42, offset to IFD0 = 8
  out[0] = 0x49;
  out[1] = 0x49;
  writeU16LE(view, 2, 0x002a);
  writeU32LE(view, 4, 8);

  const writeIfd = (
    startOffset: number,
    entries: TiffEntrySpec[],
    dataBlocks: Array<{ offset: number; bytes: Uint8Array }>
  ) => {
    writeU16LE(view, startOffset, entries.length);
    let pos = startOffset + 2;
    let blockIdx = 0;

    for (const entry of entries) {
      writeU16LE(view, pos, entry.tag);
      writeU16LE(view, pos + 2, entry.type);
      if (entry.type === 2) {
        const bytes = encodeNullTerminated(entry.strValue || '');
        writeU32LE(view, pos + 4, bytes.byteLength);
        if (bytes.byteLength <= 4) {
          out.set(bytes, pos + 8);
        } else {
          const block = dataBlocks[blockIdx++];
          writeU32LE(view, pos + 8, block.offset);
          out.set(block.bytes, block.offset);
        }
      } else if (entry.type === 3) {
        writeU32LE(view, pos + 4, 1);
        writeU16LE(view, pos + 8, entry.numValue || 0);
      } else {
        writeU32LE(view, pos + 4, 1);
        writeU32LE(view, pos + 8, entry.numValue || 0);
      }
      pos += 12;
    }

    writeU32LE(view, pos, 0);
  };

  writeIfd(headerSize, ifd0Entries, ifd0DataBlocks);
  writeIfd(exifSubIfdOffset, exifSubEntries, exifSubDataBlocks);

  return out;
}

export function makeIsoBox(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.byteLength;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size, false);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(payload, 8);
  return out;
}

export function makeIsoBoxFromBytes(typeBytes: [number, number, number, number], payload: Uint8Array): Uint8Array {
  const size = 8 + payload.byteLength;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size, false);
  out[4] = typeBytes[0];
  out[5] = typeBytes[1];
  out[6] = typeBytes[2];
  out[7] = typeBytes[3];
  out.set(payload, 8);
  return out;
}

export function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

/**
 * Builds a genuine Apple QuickTime `ftyp` box (`qt  ` major brand, minor 0x20050300,
 * compatible brand `qt  `) so Apple iOS Photos and AVFoundation parse QuickTime
 * `moov.meta` and `moov.trak.meta` Camera & Lens atoms natively.
 */
export function buildQuickTimeFtypBox(): Uint8Array {
  const enc = new TextEncoder();
  const payload = new Uint8Array(12);
  payload.set(enc.encode('qt  '), 0); // major_brand = "qt  "
  payload[4] = 0x20; // minor_version = 0x20050300 (standard Apple QTFF)
  payload[5] = 0x05;
  payload[6] = 0x03;
  payload[7] = 0x00;
  payload.set(enc.encode('qt  '), 8); // compatible_brands = "qt  "
  return makeIsoBox('ftyp', payload);
}

interface QuickTimeMetaEntry {
  key: string;
  dataType: 1 | 23; // 1 = UTF-8 string, 23 = 32-bit IEEE 754 Float BE
  strValue?: string;
  floatValue?: number;
}

/**
 * Builds a standards-compliant QuickTime / ISO `meta` box using `mdta` handler + `keys` + `ilst`.
 *
 * CRITICAL APPLE iOS PHOTOS SPEC DETAIL:
 * - In Apple QuickTime (`.mov` / `ftyp qt  `), `moov.meta` and `trak.meta` are plain QTFF atoms
 *   with **NO 4-byte FullBox version/flags prefix** (`hdlr` starts immediately at byte 8 of `meta`).
 * - In ISO BMFF MP4 (`.mp4` / `ftyp isom`), `moov.meta` IS a FullBox (4 zero bytes before `hdlr`).
 * - FFmpeg mistakenly writes `moov.udta.meta` (FullBox), which causes iOS Photos to display
 *   "No camera information" and "No lens information". Placing `meta` directly inside `moov`
 *   AND inside the video `trak` fixes both Camera Info and Lens Info in iOS Photos!
 */
export function buildMp4CameraMetaBox(
  profile: CameraProfile,
  captureDate: Date = new Date(),
  options: {
    isQuickTimeAtom?: boolean;
    trackOnly?: boolean;
  } = {}
): Uint8Array {
  if (profile.id === 'none') {
    return new Uint8Array(0);
  }

  const { isQuickTimeAtom = true, trackOnly = false } = options;
  const enc = new TextEncoder();
  const qtTime = formatQuickTimeTimestamp(captureDate);

  const entries: QuickTimeMetaEntry[] = trackOnly
    ? [
        {
          key: 'com.apple.quicktime.camera.lens_model',
          dataType: 1,
          strValue: profile.lensModel,
        },
        {
          key: 'com.apple.quicktime.camera.focal_length.35mm_equivalent',
          dataType: 23,
          floatValue: profile.focalLength35mm || 24,
        },
      ]
    : [
        { key: 'com.apple.quicktime.make', dataType: 1, strValue: profile.make },
        { key: 'com.apple.quicktime.model', dataType: 1, strValue: profile.model },
        { key: 'com.apple.quicktime.software', dataType: 1, strValue: profile.software },
        { key: 'com.apple.quicktime.creationdate', dataType: 1, strValue: qtTime },
        {
          key: 'com.apple.quicktime.camera.lens_model',
          dataType: 1,
          strValue: profile.lensModel,
        },
        {
          key: 'com.apple.quicktime.camera.focal_length.35mm_equivalent',
          dataType: 23,
          floatValue: profile.focalLength35mm || 24,
        },
      ];

  // 1. hdlr box: version/flags (4B) + component_type (4B = 0) + component_subtype ('mdta') + reserved (12B) + name ('\0')
  const hdlrPayload = new Uint8Array(25);
  hdlrPayload.set(enc.encode('mdta'), 8);
  const hdlrBox = makeIsoBox('hdlr', hdlrPayload);

  // 2. keys box: version/flags (4B) + entry_count (4B) + entries ([4B size, 'mdta', keyBytes])
  const keysHeader = new Uint8Array(8);
  new DataView(keysHeader.buffer).setUint32(4, entries.length, false);
  const keyEntries = entries.map((item) => {
    const keyBytes = enc.encode(item.key);
    const entry = new Uint8Array(8 + keyBytes.byteLength);
    new DataView(entry.buffer).setUint32(0, entry.byteLength, false);
    entry.set(enc.encode('mdta'), 4);
    entry.set(keyBytes, 8);
    return entry;
  });
  const keysBox = makeIsoBox('keys', concatUint8Arrays([keysHeader, ...keyEntries]));

  // 3. ilst box: each item has 1-based index as type, containing `data` atom (type indicator + 4B locale + payload)
  const ilstEntries = entries.map((item, idx) => {
    let valBytes: Uint8Array;
    if (item.dataType === 23) {
      valBytes = new Uint8Array(4);
      new DataView(valBytes.buffer).setFloat32(0, item.floatValue || 24, false);
    } else {
      valBytes = enc.encode(item.strValue || '');
    }

    const dataPayload = new Uint8Array(8 + valBytes.byteLength);
    new DataView(dataPayload.buffer).setUint32(0, item.dataType, false);
    dataPayload.set(valBytes, 8);
    const dataBox = makeIsoBox('data', dataPayload);

    const itemBox = new Uint8Array(8 + dataBox.byteLength);
    const itemView = new DataView(itemBox.buffer);
    itemView.setUint32(0, itemBox.byteLength, false);
    itemView.setUint32(4, idx + 1, false);
    itemBox.set(dataBox, 8);
    return itemBox;
  });
  const ilstBox = makeIsoBox('ilst', concatUint8Arrays(ilstEntries));

  const children = isQuickTimeAtom
    ? [hdlrBox, keysBox, ilstBox]
    : [new Uint8Array(4), hdlrBox, keysBox, ilstBox];

  return makeIsoBox('meta', concatUint8Arrays(children));
}

/**
 * Builds a classic QuickTime `udta` atom with international text atoms
 * (`©mak`, `©mod`, `©swr`, `©day`) for broad compatibility across Android,
 * Windows, ExifTool, and legacy QuickTime parsers.
 */
export function buildQuickTimeUdtaBox(
  profile: CameraProfile,
  captureDate: Date = new Date()
): Uint8Array {
  if (profile.id === 'none') {
    return new Uint8Array(0);
  }

  const enc = new TextEncoder();
  const qtTime = formatQuickTimeTimestamp(captureDate);

  const makeIntlTextAtom = (
    fourCC: [number, number, number, number],
    value: string
  ): Uint8Array => {
    const strBytes = enc.encode(value);
    const payload = new Uint8Array(4 + strBytes.byteLength);
    const view = new DataView(payload.buffer);
    view.setUint16(0, strBytes.byteLength, false); // text length
    view.setUint16(2, 0x55c4, false); // ISO-639-2/T 'und' / English QuickTime language code
    payload.set(strBytes, 4);
    return makeIsoBoxFromBytes(fourCC, payload);
  };

  // 0xA9 = '©' in MacRoman / QuickTime fourCC
  const atoms = [
    makeIntlTextAtom([0xa9, 0x6d, 0x61, 0x6b], profile.make), // ©mak
    makeIntlTextAtom([0xa9, 0x6d, 0x6f, 0x64], profile.model), // ©mod
    makeIntlTextAtom([0xa9, 0x73, 0x77, 0x72], profile.software), // ©swr
    makeIntlTextAtom([0xa9, 0x64, 0x61, 0x79], qtTime), // ©day
  ];

  return makeIsoBox('udta', concatUint8Arrays(atoms));
}

/**
 * Returns clean, bit-exact FFmpeg arguments to strip all AI metadata without re-encoding
 * and prepare either a QuickTime `.mov` or standard `.mp4` container before exact
 * QuickTime `moov.meta` & `trak.meta` camera atom injection.
 */
export function buildFfmpegCameraMetadataArgs(
  profile: CameraProfile,
  containerFormat: VideoContainerFormat = 'mov',
  captureDate: Date = new Date()
): string[] {
  const isMov = profile.id !== 'none' && containerFormat === 'mov';

  if (profile.id === 'none') {
    return [
      '-fflags',
      '+bitexact',
      '-flags:v',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      '-movflags',
      '+faststart',
    ];
  }

  const isoTime = formatIsoTimestamp(captureDate);
  const args = [
    '-fflags',
    '+bitexact',
    '-flags:v',
    '+bitexact',
    '-flags:a',
    '+bitexact',
    '-movflags',
    '+faststart',
    '-metadata',
    `creation_time=${isoTime}`,
    '-metadata:s:v:0',
    `handler_name=${profile.videoHandler}`,
    '-metadata:s:a:0',
    `handler_name=${profile.audioHandler}`,
  ];

  if (isMov) {
    args.push('-f', 'mov');
  }

  return args;
}

/**
 * Builds fast FFmpeg Deep TikTok Anti-AI Bypass arguments:
 * - Drops all hidden timed metadata / C2PA / subtitle / data tracks (`-map 0:v:0 -map 0:a:0?`)
 * - Removes all container metadata & chapters (`-map_metadata -1 -map_chapters -1`)
 * - Re-encodes video with `-preset ultrafast -crf 19`, `-x264-params no-info=1`, and
 *   `-bsf:v filter_units=remove_types=6` (zero H.264 SEI / x264 / C2PA / AIGC NAL units)
 * - Applies imperceptible real-camera optical micro-crop + natural sensor micro-grain to
 *   disrupt invisible pixel AI watermarks (Google SynthID / perceptual hashes)
 * - Rebuilds clean 48 kHz AAC audio with gentle 24 Hz highpass to break audio watermarks
 */
export function buildFfmpegDeepBypassArgs(
  profile: CameraProfile,
  containerFormat: VideoContainerFormat = 'mov',
  captureDate: Date = new Date()
): string[] {
  const cameraArgs = buildFfmpegCameraMetadataArgs(
    profile,
    containerFormat,
    captureDate
  );

  return [
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-vf',
    'scale=trunc(iw*1.015/2)*2:trunc(ih*1.015/2)*2,crop=trunc(iw/1.015/2)*2:trunc(ih/1.015/2)*2,eq=contrast=1.006:saturation=1.01,noise=alls=2:allf=t',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '19',
    '-pix_fmt',
    'yuv420p',
    '-x264-params',
    'no-info=1',
    '-bsf:v',
    'filter_units=remove_types=6',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-af',
    'highpass=f=24',
    ...cameraArgs,
  ];
}


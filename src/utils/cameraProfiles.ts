export type CameraProfileId =
  | 'sony_a7iv'
  | 'canon_r5'
  | 'iphone_16_pro'
  | 'samsung_s25_ultra'
  | 'none';

export type CameraCategory = 'dslr' | 'mobile' | 'clean';

export interface CameraProfile {
  id: CameraProfileId;
  category: CameraCategory;
  label: string;
  shortLabel: string;
  make: string;
  model: string;
  lensMake: string;
  lensModel: string;
  software: string;
  videoHandler: string;
  colorProfile: string;
  badgeText: string;
}

export const DEFAULT_CAMERA_PROFILE_ID: CameraProfileId = 'sony_a7iv';

export const CAMERA_PROFILES: CameraProfile[] = [
  {
    id: 'sony_a7iv',
    category: 'dslr',
    label: 'Sony Alpha A7 IV',
    shortLabel: 'Sony A7 IV · DSLR',
    make: 'SONY',
    model: 'ILCE-7M4',
    lensMake: 'SONY',
    lensModel: 'FE 24-70mm F2.8 GM II',
    software: 'ILCE-7M4 v3.01',
    videoHandler: 'Sony XAVC-S Video Handler',
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
    software: 'Firmware Version 2.0.0',
    videoHandler: 'Canon Cinema Video Handler',
    colorProfile: 'Rec.709 / sRGB',
    badgeText: 'DSLR Camera',
  },
  {
    id: 'iphone_16_pro',
    category: 'mobile',
    label: 'iPhone 16 Pro Max',
    shortLabel: 'iPhone 16 Pro · Mobile',
    make: 'Apple',
    model: 'iPhone 16 Pro Max',
    lensMake: 'Apple',
    lensModel: 'iPhone 16 Pro Max back triple camera 6.765mm f/1.78',
    software: '18.2',
    videoHandler: 'Core Media Video',
    colorProfile: 'Display P3 / Rec.709',
    badgeText: 'Mobile Camera',
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
    software: 'S938BXXU1AYB4',
    videoHandler: 'VideoHandle',
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
    software: '',
    videoHandler: '',
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
 * LensMake, LensModel) for JPEG APP1, PNG eXIf, and WebP EXIF injection.
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
  // Patch ExifIFDPointer in ifd0Entries
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
  out[0] = 0x49; // 'I'
  out[1] = 0x49; // 'I'
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

    // Next IFD offset = 0
    writeU32LE(view, pos, 0);
  };

  writeIfd(headerSize, ifd0Entries, ifd0DataBlocks);
  writeIfd(exifSubIfdOffset, exifSubEntries, exifSubDataBlocks);

  return out;
}

function makeIsoBox(type: string, payload: Uint8Array): Uint8Array {
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

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
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
 * Builds a valid ISO/QuickTime `meta` box using `mdta` handler + `keys` + `ilst`
 * containing genuine DSLR / Mobile Camera metadata atoms:
 *   - com.apple.quicktime.make
 *   - com.apple.quicktime.model
 *   - com.apple.quicktime.software
 *   - com.apple.quicktime.creationdate
 *   - com.apple.quicktime.camera.lens_model
 */
export function buildMp4CameraMetaBox(
  profile: CameraProfile,
  captureDate: Date = new Date()
): Uint8Array {
  if (profile.id === 'none') {
    return new Uint8Array(0);
  }

  const enc = new TextEncoder();
  const isoTime = formatIsoTimestamp(captureDate);

  const kvPairs: Array<[string, string]> = [
    ['com.apple.quicktime.make', profile.make],
    ['com.apple.quicktime.model', profile.model],
    ['com.apple.quicktime.software', profile.software],
    ['com.apple.quicktime.creationdate', isoTime],
    ['com.apple.quicktime.camera.lens_model', profile.lensModel],
  ];

  // 1. hdlr box (fullbox: version/flags = 0, pre_defined = 0, handler_type = 'mdta', reserved[3] = 0, name = '\0')
  const hdlrPayload = new Uint8Array(25);
  hdlrPayload.set(enc.encode('mdta'), 8);
  const hdlrBox = makeIsoBox('hdlr', hdlrPayload);

  // 2. keys box (fullbox: 4 bytes version/flags, 4 bytes entry_count, entries: [4-byte size, 'mdta', keyBytes])
  const keysHeader = new Uint8Array(8);
  new DataView(keysHeader.buffer).setUint32(4, kvPairs.length, false);
  const keyEntries = kvPairs.map(([key]) => {
    const keyBytes = enc.encode(key);
    const entry = new Uint8Array(8 + keyBytes.byteLength);
    new DataView(entry.buffer).setUint32(0, entry.byteLength, false);
    entry.set(enc.encode('mdta'), 4);
    entry.set(keyBytes, 8);
    return entry;
  });
  const keysBox = makeIsoBox('keys', concatUint8Arrays([keysHeader, ...keyEntries]));

  // 3. ilst box: each item box has 4-byte 1-based index as type, containing a `data` box (type=1 UTF-8, locale=0)
  const ilstEntries = kvPairs.map(([, val], idx) => {
    const valBytes = enc.encode(val);
    const dataPayload = new Uint8Array(8 + valBytes.byteLength);
    new DataView(dataPayload.buffer).setUint32(0, 1, false); // UTF-8 string type
    dataPayload.set(valBytes, 8);
    const dataBox = makeIsoBox('data', dataPayload);

    const itemBox = new Uint8Array(8 + dataBox.byteLength);
    const itemView = new DataView(itemBox.buffer);
    itemView.setUint32(0, itemBox.byteLength, false);
    itemView.setUint32(4, idx + 1, false); // 1-based key index
    itemBox.set(dataBox, 8);
    return itemBox;
  });
  const ilstBox = makeIsoBox('ilst', concatUint8Arrays(ilstEntries));

  // FullBox version+flags (4 zero bytes) + hdlr + keys + ilst
  const metaFullBoxPayload = concatUint8Arrays([
    new Uint8Array(4),
    hdlrBox,
    keysBox,
    ilstBox,
  ]);
  return makeIsoBox('meta', metaFullBoxPayload);
}

/**
 * Returns FFmpeg `-metadata` CLI arguments to inject genuine DSLR or Mobile Camera
 * hardware metadata after `-map_metadata -1` strips all AI tags.
 */
export function buildFfmpegCameraMetadataArgs(
  profile: CameraProfile,
  captureDate: Date = new Date()
): string[] {
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
  return [
    '-fflags',
    '+bitexact',
    '-movflags',
    '+use_metadata_tags+faststart',
    '-metadata',
    `com.apple.quicktime.make=${profile.make}`,
    '-metadata',
    `com.apple.quicktime.model=${profile.model}`,
    '-metadata',
    `com.apple.quicktime.software=${profile.software}`,
    '-metadata',
    `com.apple.quicktime.creationdate=${isoTime}`,
    '-metadata',
    `com.apple.quicktime.camera.lens_model=${profile.lensModel}`,
    '-metadata',
    `make=${profile.make}`,
    '-metadata',
    `model=${profile.model}`,
    '-metadata',
    `creation_time=${isoTime}`,
    '-metadata:s:v:0',
    `handler_name=${profile.videoHandler}`,
  ];
}

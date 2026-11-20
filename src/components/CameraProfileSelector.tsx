import React from 'react';
import { Camera, Smartphone, ShieldCheck } from 'lucide-react';
import {
  CAMERA_PROFILES,
  CameraProfile,
  CameraProfileId,
  VideoContainerFormat,
} from '../utils/cameraProfiles';

interface CameraProfileSelectorProps {
  selectedProfileId: CameraProfileId;
  onSelect: (id: CameraProfileId) => void;
  videoContainer: VideoContainerFormat;
  onSelectContainer: (fmt: VideoContainerFormat) => void;
  disabled?: boolean;
}

export const CameraProfileSelector: React.FC<CameraProfileSelectorProps> = ({
  selectedProfileId,
  onSelect,
  videoContainer,
  onSelectContainer,
  disabled = false,
}) => {
  const activeProfile: CameraProfile =
    CAMERA_PROFILES.find((p) => p.id === selectedProfileId) || CAMERA_PROFILES[0];

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0F1624] p-4 sm:p-5 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {activeProfile.category === 'mobile' ? (
            <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : activeProfile.category === 'clean' ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <h2 className="text-sm font-semibold text-slate-100 font-display">
            Auto DSLR &amp; Mobile Camera Signature
          </h2>
        </div>
        <span className="font-mono text-[11px] text-emerald-400">
          {activeProfile.category === 'clean'
            ? 'Strip Only'
            : `Auto-Inject: ${activeProfile.badgeText}`}
        </span>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Replaces <span className="text-slate-200">&ldquo;No camera information&rdquo;</span> &amp; <span className="text-slate-200">&ldquo;No lens information&rdquo;</span> in iPhone Photos, Android, TikTok &amp; YouTube with genuine QuickTime camera &amp; lens hardware metadata.
      </p>

      <div
        role="radiogroup"
        aria-label="Camera Hardware Signature Profile"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        {CAMERA_PROFILES.map((profile) => {
          const isSelected = profile.id === selectedProfileId;
          const Icon =
            profile.category === 'mobile'
              ? Smartphone
              : profile.category === 'clean'
                ? ShieldCheck
                : Camera;

          return (
            <button
              key={profile.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onSelect(profile.id)}
              className={`text-left rounded-lg border px-3 py-2.5 transition-colors cursor-pointer disabled:opacity-50 ${
                profile.id === 'none' ? 'sm:col-span-2' : ''
              } ${
                isSelected
                  ? 'border-emerald-400/80 bg-emerald-500/10 text-slate-100'
                  : 'border-slate-800 bg-[#090D16] hover:border-slate-700 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs font-semibold truncate">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSelected ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{profile.label}</span>
                </span>
                <span
                  className={`font-mono text-[10px] shrink-0 ${
                    isSelected ? 'text-emerald-300' : 'text-slate-500'
                  }`}
                >
                  {profile.badgeText}
                </span>
              </div>
              {profile.id !== 'none' && (
                <p className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                  {profile.make} {profile.model} · {profile.lensModel}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {activeProfile.id !== 'none' && (
        <div className="pt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <span className="text-slate-400">
            Video Container Format:
          </span>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090D16] border border-slate-800">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelectContainer('mov')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 ${
                videoContainer === 'mov'
                  ? 'bg-emerald-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              QuickTime .MOV (iPhone &amp; DSLR Native)
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelectContainer('mp4')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 ${
                videoContainer === 'mp4'
                  ? 'bg-emerald-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Standard .MP4
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


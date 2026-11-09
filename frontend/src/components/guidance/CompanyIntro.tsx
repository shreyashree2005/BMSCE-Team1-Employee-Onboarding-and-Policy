import { useState } from "react";
import { ArrowRight, ExternalLink, Play, VideoOff } from "lucide-react";
import { COMPANY, videoEmbedUrl, videoThumbnailUrl, videoWatchUrl } from "../../config/company";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

/**
 * A short welcome to the company with an optional video. Nothing loads from YouTube until the employee chooses to
 * play it (a lightweight thumbnail first), and they can skip straight to onboarding at any time.
 */
export function CompanyIntro({ onClose }: { onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const { video } = COMPANY;

  return (
    <Modal
      open
      size="lg"
      title={`Welcome to ${COMPANY.name}!`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Skip video
          </Button>
          <Button onClick={onClose}>
            Continue to onboarding
            <ArrowRight size={15} aria-hidden="true" />
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">{COMPANY.tagline}</p>
          {COMPANY.about.map((paragraph) => (
            <p key={paragraph} className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-navy-950">
          {thumbnailFailed ? (
            // The video can't be reached (offline, blocked network...): offer the official channel instead.
            <div role="status" className="flex aspect-video flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
              <VideoOff size={28} className="text-slate-400" aria-hidden="true" />
              <p className="text-[13px] text-slate-600">The video couldn't be loaded right now.</p>
              <a href={COMPANY.channelUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-1.5 rounded text-[13px] font-semibold text-primary-600 hover:underline">
                Visit the official {COMPANY.name} YouTube channel
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
          ) : playing ? (
            <iframe
              className="aspect-video w-full"
              src={videoEmbedUrl(video.id)}
              title={`${COMPANY.name}: ${video.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button type="button" onClick={() => setPlaying(true)} className="focus-ring group relative block aspect-video w-full" aria-label={`Play video: ${video.title}`}>
              <img
                src={videoThumbnailUrl(video.id)}
                alt=""
                loading="lazy"
                onError={() => setThumbnailFailed(true)}
                className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-primary-600 shadow-pop transition-transform group-hover:scale-105">
                  <Play size={24} className="ml-0.5" fill="currentColor" aria-hidden="true" />
                </span>
              </span>
              <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-navy-950/80 to-transparent px-4 pb-3 pt-8 text-left text-[13px] font-semibold text-white">
                {video.title}
              </span>
            </button>
          )}
        </div>
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Optional · from the official {COMPANY.name} YouTube channel</span>
          <a href={videoWatchUrl(video.id)} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-1 rounded font-semibold text-primary-600 hover:underline">
            Watch on YouTube
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </p>
      </div>
    </Modal>
  );
}

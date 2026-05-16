"use client";

import { InfiniteListSentinel, useInfiniteList } from "@/components/useInfiniteList";
import type { MediaPack, MediaPackSoundSample, MusicTrack } from "@/lib/media";
import { uniqueTags } from "@/lib/tags";

const PAGE_SIZE = 30;

type MediaPackTrackListProps = {
  pack: MediaPack;
};

export function MediaPackTrackList({ pack }: MediaPackTrackListProps) {
  const items = pack.kind === "music" ? pack.musicTracks : pack.soundSamples;
  const infinite = useInfiniteList({
    total: items.length,
    pageSize: PAGE_SIZE,
    resetKey: pack.slug,
  });
  const visible = items.slice(0, infinite.visibleCount);

  return (
    <>
      <div className="track-list media-pack-list">
        {pack.kind === "music"
          ? (visible as MusicTrack[]).map((track) => <MusicRow key={track.path} track={track} />)
          : (visible as MediaPackSoundSample[]).map((sample) => (
              <SoundRow key={sample.path} sample={sample} />
            ))}
      </div>
      <InfiniteListSentinel
        className="media-pack-list-sentinel"
        hasMore={infinite.hasMore}
        label={pack.kind === "music" ? "Loading tracks" : "Loading samples"}
        onLoadMore={infinite.loadMore}
        pageSize={PAGE_SIZE}
        remaining={infinite.remaining}
        sentinelRef={infinite.sentinelRef}
      />
    </>
  );
}

function MusicRow({ track }: { track: MusicTrack }) {
  return (
    <article className="track-row">
      <div className="media-row-kicker">
        <span className="sound-org sound-org-music">Music</span>
        <span>{track.source}</span>
      </div>
      <div className="media-title">{track.title}</div>
      <div className="media-detail">{track.path}</div>
      <audio className="media-pack-audio" controls preload="none" src={track.src} />
      <p>{track.description}</p>
      <div className="inline-tags">
        {uniqueTags(track.tags).slice(0, 5).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </article>
  );
}

function SoundRow({ sample }: { sample: MediaPackSoundSample }) {
  return (
    <article className="track-row">
      <div className="media-row-kicker">
        <span className={`sound-org sound-org-${sample.organization}`}>
          {sample.organization === "creator-pack" ? "Pack" : "Collection"}
        </span>
        <span>{sample.source}</span>
      </div>
      <div className="media-title">{sample.label}</div>
      <div className="media-detail">{sample.category} · {sample.path}</div>
      <audio className="media-pack-audio" controls preload="none" src={sample.src} />
      <p>{sample.description}</p>
      <div className="inline-tags">
        {uniqueTags(sample.tags).slice(0, 5).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SoundPad } from "@/components/SoundPad";
import type { SoundCollection } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";

const SAMPLE_AUDIO_URL =
  "https://assets.gamedev.trebeljahr.com/sounds/music/020216-space-ambient-music-fragmentwav-66481.mp3";

const sampleCollection: SoundCollection = {
  id: "pixabay-browser-audio-editor-sample",
  title: "Browser Audio Editor",
  description:
    "Trim an MP3 in the browser, cut an audio range online, change speed, and export MP3 or WAV without uploading the source file.",
  organization: "source-pattern",
  organizationLabel: "Sample sound",
  category: "audio-editor",
  themes: ["Audio editing"],
  useCases: ["trim mp3 in browser", "cut audio online", "speed up audio web"],
  source: "Pixabay",
  path: "sounds/music/020216-space-ambient-music-fragmentwav-66481.mp3",
  license: "Pixabay License",
  notes: "Permissive catalog sample used to initialize the standalone browser audio editor.",
  tags: ["trim mp3 in browser", "cut audio online", "speed up audio web", "mp3 export"],
  searchText: "trim mp3 in browser cut audio online speed up audio web mp3 export wav export",
  samples: [
    {
      collectionId: "pixabay-browser-audio-editor-sample",
      path: "sounds/music/020216-space-ambient-music-fragmentwav-66481.mp3",
      src: SAMPLE_AUDIO_URL,
      label: "Space Ambient Music Fragmentwav",
      kind: "ambient",
      description: "Pixabay-License sample loaded on first visit for browser-only trimming and export.",
      category: "audio-editor",
      subcategory: "sample",
      themes: ["Audio editing"],
      useCases: ["trim mp3 in browser", "cut audio online", "speed up audio web"],
      tags: ["Pixabay License", "MP3", "browser audio editor"],
      searchText: "space ambient music fragmentwav pixabay license trim mp3 cut audio speed",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Trim MP3 in Browser, Cut Audio Online, Speed Up Audio Web",
  description:
    "Trim MP3 in browser, cut audio online, change playback speed, and export MP3 or WAV locally with a Web Worker audio editor. No login, no upload.",
  pathname: "/sounds/editor",
  imagePathname: "/sounds/editor",
  imageAlt: "Trim MP3 in browser and cut audio online with a local web audio editor",
});

export default function SoundEditorPage() {
  return (
    <>
      <SiteHeader active="sounds" meta="Trim MP3 in browser / Cut audio online / Speed up audio web" />

      <main className="sound-editor-page">
        <section className="sound-editor-hero" aria-labelledby="sound-editor-title">
          <div>
            <div className="landing-kicker">Audio editor</div>
            <h2 id="sound-editor-title">Trim MP3 in browser</h2>
            <p>
              Cut audio online, speed up or slow down the sample, then export MP3 or WAV locally.
              The source file stays in your browser.
            </p>
          </div>
          <div className="sound-editor-proof" aria-label="Editor constraints">
            <span>No login</span>
            <span>No upload</span>
            <span>Worker MP3 export</span>
          </div>
        </section>

        <SoundPad collection={sampleCollection} packHref={null} />

        <footer className="sound-editor-footer">
          <p>
            Starts with a Pixabay-License catalog sample. Browse more source audio in{" "}
            <Link href="/media?view=sounds&type=all">the sound library</Link>.
          </p>
        </footer>
      </main>
    </>
  );
}

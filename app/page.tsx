import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { ReelAnalyzer } from '@/components/reel/ReelAnalyzer';
import { Callout } from '@/components/ui/Callout';

/**
 * The single page of the app.
 *
 * A Server Component. Only `ReelAnalyzer` is a client component, because only
 * it needs state and an event handler.
 */
export default function HomePage() {
  return (
    <>
      <Header />

      <main className="mx-auto max-w-[1120px] px-5 py-10">
        <h1 className="font-display text-ink-1 mb-4 text-[clamp(2.125rem,7vw,3rem)] font-medium text-balance">
          Study a reel, then shoot your own
        </h1>
        <p className="text-ink-2 mb-10 max-w-[65ch] text-sm">
          Paste a reel. A video model watches it, works out how it is built, and writes you an
          original shooting script that uses the same craft on your idea.
        </p>

        <ReelAnalyzer />

        <section className="mt-12 flex flex-col gap-6">
          <h2 className="font-display text-ink-1 text-[26px] font-normal text-balance">
            How this works
          </h2>

          <Callout title="1. The video is downloaded">
            Instagram does not serve reels to logged-out clients, so a deployment needs a session
            cookie to fetch one automatically. Without a cookie, paste a direct link to the MP4 file
            instead. That path needs no credentials and always works.
          </Callout>

          <Callout title="2. A model watches it">
            The file is sent to a model that accepts video input, as a base64 data URL. The reply
            reports how many video tokens were read, so you can tell the difference between a real
            reading and a guess.
          </Callout>

          <Callout title="3. A director writes the script">
            The model returns two things: a factual reading of the source, and an original script
            written in the same style. The script borrows shot grammar, cutting rhythm and
            structure. It does not borrow words, captions or music.
          </Callout>
        </section>
      </main>

      <Footer />
    </>
  );
}

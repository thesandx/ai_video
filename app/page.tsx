import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { StudioApp } from '@/components/studio/StudioApp';

/**
 * The studio. A Server Component that renders one client component, because
 * only the run itself needs state.
 */
export default function HomePage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1120px] px-5 py-10">
        <h1 className="font-display text-ink-1 mb-4 text-[clamp(2.125rem,7vw,3rem)] font-medium text-balance">
          Reel in, animated reel out
        </h1>
        <p className="text-ink-2 mb-10 max-w-[65ch] text-sm">
          Every stage waits for your approval, and you can generate or upload at each one. Nothing
          reaches the expensive stage until the checks pass.
        </p>
        <StudioApp />
      </main>
      <Footer />
    </>
  );
}

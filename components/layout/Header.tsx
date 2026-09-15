import Link from 'next/link';

/**
 * The page masthead. It scrolls with the page: the design system specifies
 * nothing fixed or sticky.
 */
export function Header() {
  return (
    <header className="border-hairline border-b">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-5">
        <Link href="/" className="font-display text-ink-1 text-lg font-medium">
          Reel Director
        </Link>
        <p className="text-ink-3 hidden text-sm sm:block">Reel in, shooting script out</p>
      </div>
    </header>
  );
}

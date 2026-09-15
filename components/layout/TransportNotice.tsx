import { Callout } from '@/components/ui/Callout';

export interface TransportNoticeProps {
  transport: 'local' | 'neon';
}

/**
 * States where the run is kept.
 *
 * A browser-only run is invisible in the interface and would be misleading on
 * screen: everything looks saved, and then a cleared browser loses a run that
 * cost real money to produce. The notice hides itself once Postgres is in use,
 * because then there is nothing surprising to say.
 */
export function TransportNotice({ transport }: TransportNoticeProps) {
  if (transport === 'neon') return null;

  return (
    <Callout title="This run is saved in this browser only">
      It will not follow you to another machine, and clearing site data loses it along with every
      image and clip it holds. Set <code>NEXT_PUBLIC_RUN_TRANSPORT=neon</code> with a{' '}
      <code>DATABASE_URL</code> to keep runs in Postgres instead.
    </Callout>
  );
}

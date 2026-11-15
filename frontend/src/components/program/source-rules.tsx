// Archived: not used by the live app (not routed). The live UI is components/hub/; see app/(opendoor)/_archive/legacy-dashboard/README.md.
import type { Program } from "@/lib/types";

/** Each requirement in the provider's own words, with a link to where it says so. */
export function SourceRules({ program }: { program: Program }) {
  if (!program.requirements.length) {
    return <p className="text-[12.5px] text-muted-foreground">The provider doesn&apos;t list rules. Call to ask.</p>;
  }
  return (
    <div>
      {program.requirements.map((r) => (
        <div key={r.id} className="mb-[9px] border-l-[3px] border-line py-0.5 pl-3 text-[12.5px] leading-[1.65] text-muted-foreground">
          {r.text}
          {!r.verified ? <span className="ml-1 text-[11px] font-bold text-amber-ink">(call to confirm)</span> : null}
          <br />
          <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-brand-text underline underline-offset-2">
            Source<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      ))}
    </div>
  );
}

// Archived: not used by the live app (not routed). The live UI is components/hub/; see app/(opendoor)/_archive/legacy-dashboard/README.md.
import { cn } from "@/lib/utils";

/** The house with a door that opens. Decorative. */
export function HouseArt({ open, className, label }: { open?: boolean; className?: string; label?: string }) {
  return (
    <div
      className={cn("od-art", open && "open", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div className="sun" />
      <div className="h1" />
      <div className="h2" />
      <div className="h3" />
      <div className="house">
        <div className="door" />
      </div>
    </div>
  );
}

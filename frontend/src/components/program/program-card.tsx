"use client";

// Archived: not used by the live app (not routed). The live UI is components/hub/; see app/(opendoor)/_archive/legacy-dashboard/README.md.
import { CircleHelp } from "lucide-react";

import { CallChip, CatIcon, StatusPill } from "@/components/od/ui";
import { useAnswer } from "@/components/session/answer-provider";
import { useApp } from "@/components/session/session-provider";
import { asksFor, openIds, phoneOf, reasonLine, statusLabel, toneOf } from "@/lib/derive";
import { lowerFirst } from "@/lib/format";
import type { ProgramCard as Card } from "@/lib/types";
import { cn } from "@/lib/utils";

import { useDrawer } from "./drawer";

/**
 * One program, as a card. Tapping it opens the drawer. A program that is one question
 * away shows that question inline, answered with a tap.
 */
export function ProgramCard({ card, noInline }: { card: Card; noInline?: boolean }) {
  const { snapshot } = useApp();
  const { answer, moved, working } = useAnswer();
  const { openProgram, openQuestion } = useDrawer();
  if (!snapshot) return null;
  const p = card.program;
  const open = openIds(snapshot);
  const tone = toneOf(card);
  const firstAsk = tone === "maybe" && !noInline ? asksFor(card, open)[0] : undefined;
  const oq = firstAsk ? snapshot.open_questions.find((o) => o.question.id === firstAsk) : undefined;
  const askLine = oq ? card.assessment?.checks.find((c) => c.question_id === oq.question.id)?.text : undefined;
  const label = snapshot.field_labels[oq?.question.target_field ?? ""] ?? oq?.question.prompt ?? "";

  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a,input,label")) return;
        openProgram(p.id);
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-[13px] rounded-2xl border border-line bg-surface p-[15px] text-left transition-[border-color,box-shadow] duration-300 hover:border-brand-line",
        moved.has(p.id) && "shadow-[0_0_0_3px_var(--brand-line)]",
      )}
    >
      <CatIcon category={p.categories[0]} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => openProgram(p.id)}
              className="text-left text-sm font-extrabold tracking-[-0.2px] text-ink hover:underline"
            >
              {p.name}
            </button>
            <div className="mt-0.5 text-[11px] font-bold text-faint">{p.provider}</div>
          </div>
          <StatusPill tone={tone}>{statusLabel(card, open)}</StatusPill>
        </div>
        <p className="mt-[7px] line-clamp-3 text-xs leading-[1.55] text-muted-foreground">{reasonLine(card)}</p>

        {oq ? (
          <div className="mt-[11px] border-t border-dashed border-line pt-[11px]">
            <p className="mb-2 flex items-start gap-[7px] text-[12.5px] font-extrabold">
              <CircleHelp aria-hidden className="mt-px size-[15px] shrink-0 text-amber-ink" />
              <span>{oq.question.prompt}</span>
            </p>
            {askLine ? <p className="-mt-1 mb-2 line-clamp-2 text-[11px] font-bold text-faint">{askLine}</p> : null}
            <div className="flex flex-wrap gap-1.5">
              {oq.question.type === "single_select" ? (
                oq.question.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={working}
                    onClick={() => void answer({ question_id: oq.question.id, selected_option_ids: [o.id] })}
                    className={cn(
                      "rounded-full border border-line bg-surface px-[11px] py-1.5 text-xs font-bold hover:border-brand hover:text-brand-text disabled:opacity-50",
                      o.id === "unsure" && "text-muted-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => openQuestion(oq.question)}
                  className="rounded-full border border-line bg-surface px-[11px] py-1.5 text-xs font-bold hover:border-brand hover:text-brand-text"
                >
                  Answer: {lowerFirst(label)}
                </button>
              )}
            </div>
          </div>
        ) : null}

        {(tone === "fit" || tone === "open" || tone === "have") && phoneOf(p.contact) ? (
          <div className="mt-[11px]">
            <CallChip phone={phoneOf(p.contact)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

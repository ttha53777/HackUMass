import { Button } from "@/components/ui/button";
import type { AnsweredItem } from "@/lib/types";

type Props = {
  items: AnsweredItem[];
  disabled: boolean;
  /** Question currently open for editing, if any. */
  editingId: string | null;
  onEdit: (questionId: string) => void;
};

/** Compact history of earlier answers, each with a way to change it. */
export function AnsweredList({ items, disabled, editingId, onEdit }: Props) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="answered-heading" className="flex flex-col gap-2">
      <h2 id="answered-heading" className="text-sm font-medium text-muted-foreground">
        Your answers
      </h2>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((item) => (
          <li key={item.question_id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">{item.prompt}</p>
              <p className={item.skipped ? "text-muted-foreground italic" : "font-medium"}>
                {item.display_value}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || editingId === item.question_id}
              onClick={() => onEdit(item.question_id)}
              aria-label={`Change your answer to: ${item.prompt}`}
              className="h-11 px-4 text-sm"
            >
              {editingId === item.question_id ? "Editing" : "Edit"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

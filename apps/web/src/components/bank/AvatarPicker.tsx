import { AVATAR_COLORS, AVATAR_EMOJIS } from "@/lib/avatarOptions";
import { cn } from "@/lib/cn";

export interface AvatarPickerProps {
  color: string;
  emoji: string | null;
  onChangeColor: (color: string) => void;
  onChangeEmoji: (emoji: string | null) => void;
}

export function AvatarPicker({ color, emoji, onChangeColor, onChangeEmoji }: AvatarPickerProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Color</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChangeColor(c)}
              aria-label={`Choose color ${c}`}
              aria-pressed={c === color}
              className={cn(
                "h-8 w-8 rounded-full ring-offset-2 transition-shadow",
                c === color ? "ring-2 ring-brand-800" : "hover:ring-2 hover:ring-line",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Icon</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onChangeEmoji(e === emoji ? null : e)}
              aria-label={`Choose icon ${e}`}
              aria-pressed={e === emoji}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border text-lg",
                e === emoji ? "border-brand-800 bg-brand-50" : "border-line hover:bg-surface",
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

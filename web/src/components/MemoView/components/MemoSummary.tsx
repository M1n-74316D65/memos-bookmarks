import { ArrowUpRightIcon, BookmarkIcon, EyeIcon, FileTextIcon, PinIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import VisibilityIcon from "@/components/VisibilityIcon";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { getVisibilityOption } from "@/utils/memo";
import { getBentoCoverUrl, getBentoTileSnippet, getBentoTileSourceUrl, getBentoTileTitle } from "../bentoCover";
import { useMemoViewContext } from "../MemoViewContext";
import { createMemoNavigationState } from "../navigation";
import type { MemoHeaderProps } from "../types";
import MemoSpaceBadge from "./MemoSpaceBadge";

const MemoSummary = ({ showCreator, showPinned, showSpace, showVisibility }: MemoHeaderProps) => {
  const { memo, creator, parentPage, shareToken, blurred, showBlurredContent, toggleBlurVisibility } = useMemoViewContext();
  const [failedCover, setFailedCover] = useState<string>();
  const t = useTranslate();

  if (blurred && !showBlurredContent) {
    return (
      <div className="flex min-h-48 w-full flex-1 items-center justify-center p-4">
        <Button variant="outline" size="sm" className="max-w-full whitespace-normal" onClick={toggleBlurVisibility}>
          <EyeIcon aria-hidden className="size-3.5 shrink-0" />
          {t("memo.click-to-show-sensitive-content")}
        </Button>
      </div>
    );
  }

  const cover = getBentoCoverUrl(memo, shareToken);
  const visibleCover = cover === failedCover ? undefined : cover;
  const title = getBentoTileTitle(memo) || memo.name.split("/").pop() || memo.name;
  const snippet = visibleCover ? "" : getBentoTileSnippet(memo);
  const sourceUrl = getBentoTileSourceUrl(memo);
  const visibilityOption = getVisibilityOption(memo.visibility);
  const SummaryIcon = sourceUrl ? BookmarkIcon : FileTextIcon;

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <Link
        to={`/${memo.name}`}
        state={createMemoNavigationState(parentPage)}
        aria-label={title}
        className="flex min-h-0 min-w-0 flex-1 flex-col hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {visibleCover && (
          <div aria-hidden className="relative min-h-20 flex-1 basis-28 overflow-hidden bg-muted">
            <img
              src={visibleCover}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
              onError={() => setFailedCover(visibleCover)}
            />
          </div>
        )}
        <div className={cn("min-w-0 p-4", visibleCover ? "shrink-0" : "flex flex-1 items-center gap-3 bg-muted/20 p-3")}>
          {!visibleCover && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground">
              <SummaryIcon aria-hidden className="size-4" strokeWidth={1.8} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "break-words font-semibold text-card-foreground",
                visibleCover ? "line-clamp-2 text-sm leading-5" : cn(showCreator ? "line-clamp-1" : "line-clamp-2", "text-base leading-5"),
              )}
            >
              {title}
            </p>
            {snippet && <p className="mt-1 line-clamp-1 break-words text-xs leading-4 text-muted-foreground">{snippet}</p>}
            {showCreator && creator && (
              <p className="mt-1 truncate text-xs leading-4 text-muted-foreground">{creator.displayName || creator.username}</p>
            )}
          </div>
        </div>
      </Link>
      {(sourceUrl || (showSpace && memo.space) || (showPinned && memo.pinned) || (showVisibility && visibilityOption)) && (
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          {sourceUrl && (
            <a
              href={sourceUrl.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 max-w-full items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate font-mono">{sourceUrl.hostname.replace(/^www\./, "")}</span>
              <ArrowUpRightIcon aria-hidden className="size-3 shrink-0" />
            </a>
          )}
          {showSpace && memo.space && <MemoSpaceBadge spaceName={memo.space} />}
          {showVisibility && visibilityOption && (
            <span className="flex items-center gap-1">
              <VisibilityIcon visibility={memo.visibility} className="size-3" />
              {t(visibilityOption.labelKey)}
            </span>
          )}
          {showPinned && memo.pinned && (
            <span className="flex items-center gap-1 text-primary">
              <PinIcon aria-hidden className="size-3" />
              {t("common.pinned")}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default MemoSummary;

import { create } from "@bufbuild/protobuf";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { ArchiveIcon, ArchiveRestoreIcon, ArrowUpRightIcon, BookmarkIcon, EyeIcon, FileTextIcon, HeartIcon, PinIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import RelativeTime from "@/components/RelativeTime";
import { Button } from "@/components/ui/button";
import VisibilityIcon from "@/components/VisibilityIcon";
import { useUpdateMemo } from "@/hooks/useMemoQueries";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import { type Bookmark, BookmarkSchema } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { getVisibilityOption } from "@/utils/memo";
import { getBentoCoverUrl, getBentoTileSnippet, getBentoTileSourceUrl, getBentoTileTitle } from "../bentoCover";
import { useMemoViewContext } from "../MemoViewContext";
import { createMemoNavigationState } from "../navigation";
import type { MemoHeaderProps } from "../types";
import MemoSpaceBadge from "./MemoSpaceBadge";

const BookmarkActions = ({ name, bookmark, isArchived }: { name: string; bookmark: Bookmark; isArchived: boolean }) => {
  const t = useTranslate();
  const { mutate: updateMemo } = useUpdateMemo();

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <Button
        variant="quiet"
        size="icon-sm"
        aria-label={bookmark.favorited ? t("bookmarks.remove-favorite") : t("bookmarks.add-favorite")}
        onClick={() =>
          updateMemo({
            update: {
              name,
              bookmark: create(BookmarkSchema, {
                type: bookmark.type,
                sourceUrl: bookmark.sourceUrl,
                favorited: !bookmark.favorited,
              }),
            },
            updateMask: ["bookmark.favorited"],
          })
        }
      >
        <HeartIcon className="size-3.5" fill={bookmark.favorited ? "currentColor" : "none"} />
      </Button>
      <Button
        variant="quiet"
        size="icon-sm"
        aria-label={isArchived ? t("common.restore") : t("common.archive")}
        onClick={() =>
          updateMemo({
            update: { name, state: isArchived ? State.NORMAL : State.ARCHIVED },
            updateMask: ["state"],
          })
        }
      >
        {isArchived ? <ArchiveRestoreIcon className="size-3.5" /> : <ArchiveIcon className="size-3.5" />}
      </Button>
    </div>
  );
};

const MemoSummary = ({ showCreator, showPinned, showSpace, showVisibility }: MemoHeaderProps) => {
  const { memo, creator, parentPage, shareToken, blurred, showBlurredContent, toggleBlurVisibility, readonly, isArchived } =
    useMemoViewContext();
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
  const createTime = memo.createTime ? timestampDate(memo.createTime) : undefined;
  const visibleTags = memo.tags.slice(0, 2);

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
            {visibleTags.length > 0 && (
              <div className="mt-1.5 flex min-w-0 items-center gap-1 overflow-hidden text-[11px] leading-4 text-primary/80">
                {visibleTags.map((tag) => (
                  <span key={tag} className="max-w-24 shrink truncate rounded-full bg-primary/10 px-1.5">
                    #{tag}
                  </span>
                ))}
                {memo.tags.length > visibleTags.length && (
                  <span className="shrink-0 text-muted-foreground">+{memo.tags.length - visibleTags.length}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </Link>
      {(sourceUrl ||
        createTime ||
        memo.bookmark ||
        (showSpace && memo.space) ||
        (showPinned && memo.pinned) ||
        (showVisibility && visibilityOption)) && (
        <div className="flex min-w-0 shrink-0 items-center gap-3 overflow-hidden border-t border-border/60 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          {sourceUrl && (
            <a
              href={sourceUrl.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate font-mono">{sourceUrl.hostname.replace(/^www\./, "")}</span>
              <ArrowUpRightIcon aria-hidden className="size-3 shrink-0" />
            </a>
          )}
          {createTime && (
            <span className="shrink-0" title={`${t("common.created-at")}: ${createTime.toLocaleString()}`}>
              <RelativeTime date={createTime} />
            </span>
          )}
          {showSpace && memo.space && (
            <span className="hidden min-w-0 @min-[520px]/card:block">
              <MemoSpaceBadge spaceName={memo.space} />
            </span>
          )}
          {showVisibility && visibilityOption && (
            <span className="hidden shrink-0 items-center gap-1 @min-[320px]/card:flex">
              <VisibilityIcon visibility={memo.visibility} className="size-3" />
              {t(visibilityOption.labelKey)}
            </span>
          )}
          {showPinned && memo.pinned && (
            <span className="hidden shrink-0 items-center gap-1 text-primary @min-[400px]/card:flex">
              <PinIcon aria-hidden className="size-3" />
              {t("common.pinned")}
            </span>
          )}
          {memo.bookmark && !readonly && <BookmarkActions name={memo.name} bookmark={memo.bookmark} isArchived={isArchived} />}
        </div>
      )}
    </div>
  );
};

export default MemoSummary;

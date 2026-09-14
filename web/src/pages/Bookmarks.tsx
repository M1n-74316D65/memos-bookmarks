import { BookmarkIcon, CheckIcon, ImportIcon, PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import BookmarksImportDialog from "@/components/BookmarksImport/BookmarksImportDialog";
import MemoDisplaySettingMenu from "@/components/MemoDisplaySettingMenu";
import MemoView from "@/components/MemoView";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSidebar } from "@/contexts/AppSidebarContext";
import { type MemoFilter, stringifyFilters, useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { useSpaceContext } from "@/contexts/SpaceContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import { useBookmarkCoverRefresh } from "@/hooks/useBookmarkCoverRefresh";
import useCurrentUser from "@/hooks/useCurrentUser";
import { combineCELFilters } from "@/lib/cel-filter";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/router/routes";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

/** Shared quiet header action: 13px muted label, hairline hover wash, no chrome. */
const HeaderAction = ({
  icon,
  label,
  onClick,
  to,
  disabled,
  primary,
  busy,
  description,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
  primary?: boolean;
  busy?: boolean;
  description?: string;
}) => {
  const className = cn(
    "flex size-10 shrink-0 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-8 sm:w-auto sm:px-2.5",
    primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
    "disabled:cursor-not-allowed disabled:opacity-50",
  );
  const content = (
    <>
      {icon}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={className} title={description ?? label}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-busy={busy} title={description ?? label}>
      {content}
    </button>
  );
};

type BookmarkView = "all" | "unread" | "favorites" | "archive";

const isUnreadFilter = (filter: MemoFilter) => filter.factor === "tagSearch" && filter.value === "unread";
const isBookmarkViewFilter = (filter: MemoFilter) => isUnreadFilter(filter) || filter.factor === "pinned";

const Bookmarks = () => {
  const user = useCurrentUser();
  const t = useTranslate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setQuickFindOpen } = useAppSidebar();
  const { filters, hasActiveFilters } = useMemoFilterContext();
  const { memoFilter: spaceFilter } = useSpaceContext();
  const [importOpen, setImportOpen] = useState(false);
  const { coverRefresh, refreshCovers, cancelRefresh } = useBookmarkCoverRefresh();
  const capturePath = `${ROUTES.BOOKMARK}?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
  const bookmarkView: BookmarkView =
    searchParams.get("view") === "archive"
      ? "archive"
      : filters.some((filter) => filter.factor === "pinned")
        ? "favorites"
        : filters.some(isUnreadFilter)
          ? "unread"
          : "all";
  const memoState = bookmarkView === "archive" ? State.ARCHIVED : State.NORMAL;

  const changeBookmarkView = (view: string) => {
    const nextView = view as BookmarkView;
    const nextFilters = filters.filter((filter) => !isBookmarkViewFilter(filter));
    if (nextView === "unread") {
      nextFilters.push({ factor: "tagSearch", value: "unread" });
    } else if (nextView === "favorites") {
      nextFilters.push({ factor: "pinned", value: "" });
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    const nextFilterQuery = stringifyFilters(nextFilters);
    if (nextFilterQuery) {
      nextSearchParams.set("filter", nextFilterQuery);
    } else {
      nextSearchParams.delete("filter");
    }
    if (nextView === "archive") {
      nextSearchParams.set("view", "archive");
    } else {
      nextSearchParams.delete("view");
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  const memoFilter = useMemoFilters({
    creatorName: user?.name,
    includeMemoViews: true,
    includePinned: true,
  });

  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: true,
    state: memoState,
  });

  const refreshStatus =
    coverRefresh.status === "running"
      ? coverRefresh.failed > 0
        ? t("bookmarks.refreshing-covers-progress", {
            updated: coverRefresh.updated.toString(),
            failed: coverRefresh.failed.toString(),
            pages: coverRefresh.pages.toString(),
          })
        : t("bookmarks.refreshing-covers-progress-no-failed", {
            updated: coverRefresh.updated.toString(),
            pages: coverRefresh.pages.toString(),
          })
      : coverRefresh.status === "done"
        ? coverRefresh.failed > 0
          ? t("bookmarks.refresh-covers-result", { updated: coverRefresh.updated.toString(), failed: coverRefresh.failed.toString() })
          : t("bookmarks.refresh-covers-updated", { updated: coverRefresh.updated.toString() })
        : coverRefresh.status === "error"
          ? t("bookmarks.refresh-covers-error")
          : coverRefresh.status === "cancelled"
            ? t("bookmarks.refresh-covers-cancelled")
            : null;

  return (
    <>
      <section className="@container flex min-h-full w-full flex-col items-center">
        <div className="mx-auto w-full px-4 pb-8 pt-3 sm:px-6 md:pt-6">
          <PagedMemoList
            renderer={(memo: Memo, { variant }) => (
              <MemoView
                key={getMemoKey(memo)}
                memo={memo}
                showVisibility
                showSpace
                showPinned
                compact
                variant="bento"
                className={variant !== "bento" ? "mb-3 min-h-40" : undefined}
              />
            )}
            listSort={listSort}
            state={memoState}
            orderBy={orderBy}
            filter={memoFilter}
            contextFilter={combineCELFilters("has_link", spaceFilter)}
            emptyMessage={t(
              bookmarkView === "archive" ? "bookmarks.empty-archive" : hasActiveFilters ? "bookmarks.no-results" : "bookmarks.empty",
            )}
            emptyActions={
              bookmarkView === "all" && !hasActiveFilters ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Link to={capturePath} className={cn(buttonVariants({ size: "sm" }), "h-10 px-3 sm:h-7 sm:px-2")}>
                    <PlusIcon aria-hidden className="size-3.5" />
                    {t("common.save-link")}
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 px-3 sm:h-7 sm:px-2"
                    onClick={() => setImportOpen(true)}
                  >
                    <ImportIcon aria-hidden className="size-3.5" />
                    {t("bookmarks.import")}
                  </Button>
                </div>
              ) : undefined
            }
            renderHeader={() => (
              <header className="mb-4 flex flex-col gap-3 border-b border-border/80 px-1 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BookmarkIcon className="size-4" strokeWidth={1.9} />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("common.bookmarks")}</h1>
                    <p className="hidden text-xs text-muted-foreground sm:block">{t("bookmarks.description")}</p>
                  </div>
                  <div className="ml-auto shrink-0">
                    <HeaderAction
                      to={capturePath}
                      icon={<PlusIcon className="size-3.5" strokeWidth={1.8} />}
                      label={t("common.save-link")}
                      primary
                    />
                  </div>
                </div>
                <Tabs value={bookmarkView} onValueChange={changeBookmarkView}>
                  <TabsList aria-label={t("bookmarks.views-label")} className="w-full overflow-x-auto rounded-lg bg-muted/60 p-1 sm:w-fit">
                    <TabsTrigger value="all" className="h-10 min-w-fit flex-1 px-3 sm:h-8 sm:flex-none">
                      {t("common.all")}
                    </TabsTrigger>
                    <TabsTrigger value="unread" className="h-10 min-w-fit flex-1 px-3 sm:h-8 sm:flex-none">
                      {t("bookmarks.unread")}
                    </TabsTrigger>
                    <TabsTrigger value="favorites" className="h-10 min-w-fit flex-1 px-3 sm:h-8 sm:flex-none">
                      {t("bookmarks.favorites")}
                    </TabsTrigger>
                    <TabsTrigger value="archive" className="h-10 min-w-fit flex-1 px-3 sm:h-8 sm:flex-none">
                      {t("bookmarks.archive")}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-card/60 p-1 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setQuickFindOpen(true)}
                    className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
                  >
                    <SearchIcon aria-hidden className="size-4 shrink-0" />
                    <span className="truncate">{t("bookmarks.search-placeholder")}</span>
                  </button>
                  <div className="h-5 w-px shrink-0 bg-border/70" />
                  <MemoDisplaySettingMenu className="size-10 sm:size-8" />
                  <HeaderAction
                    icon={<ImportIcon className="size-3.5" strokeWidth={1.8} />}
                    label={t("bookmarks.import")}
                    onClick={() => setImportOpen(true)}
                  />
                  <HeaderAction
                    icon={
                      <RefreshCwIcon className={cn("size-3.5", coverRefresh.status === "running" && "animate-spin")} strokeWidth={1.8} />
                    }
                    label={coverRefresh.status === "running" ? t("bookmarks.refreshing-covers") : t("bookmarks.refresh-covers")}
                    onClick={() => void refreshCovers()}
                    disabled={coverRefresh.status === "running"}
                    busy={coverRefresh.status === "running"}
                    description={t("bookmarks.refresh-covers-scope")}
                  />
                </div>
                {refreshStatus !== null ? (
                  <div
                    aria-live="polite"
                    aria-atomic="true"
                    className={cn(
                      "flex flex-wrap items-center gap-1.5 pr-1 font-mono text-xs text-muted-foreground",
                      coverRefresh.status === "done" && coverRefresh.failed === 0 && "text-success",
                      coverRefresh.status === "done" && coverRefresh.failed > 0 && "text-warning",
                      coverRefresh.status === "error" && "text-destructive",
                    )}
                  >
                    {coverRefresh.status === "done" && <CheckIcon className="size-3" strokeWidth={2} />}
                    {refreshStatus}
                    {coverRefresh.status === "running" && (
                      <button
                        type="button"
                        onClick={cancelRefresh}
                        className="shrink-0 rounded-md p-2 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {t("common.cancel")}
                      </button>
                    )}
                  </div>
                ) : null}
              </header>
            )}
          />
        </div>
      </section>
      <BookmarksImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
};

export default Bookmarks;

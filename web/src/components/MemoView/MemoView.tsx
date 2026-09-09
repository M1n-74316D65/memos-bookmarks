import { PinIcon } from "lucide-react";
import {
  type ComponentType,
  forwardRef,
  memo,
  Suspense,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useResolvedUser } from "@/components/MemoContent/MentionResolutionContext";
import { loadMemoEditor } from "@/components/MemoEditor/loader";
import type { MemoEditorProps } from "@/components/MemoEditor/types";
import { useAuth } from "@/contexts/AuthContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import useNavigateTo from "@/hooks/useNavigateTo";
import { isMemoBlurred } from "@/lib/tag";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import { useTranslate } from "@/utils/i18n";
import { lazyWithReload } from "@/utils/lazy";
import { isSuperUser } from "@/utils/user";
import { getBentoCoverUrl, getBentoTileSnippet, getBentoTileSource, getBentoTileTitle } from "./bentoCover";
import { MemoBody, MemoCommentListView, MemoHeader } from "./components";
import { MEMO_CARD_BASE_CLASSES } from "./constants";
import { useImagePreview } from "./hooks";
import { computeCommentAmount, MemoViewContext } from "./MemoViewContext";
import { createMemoNavigationState, isMemoDetailPath, resolveMemoParentPage } from "./navigation";
import type { MemoViewHandle, MemoViewProps } from "./types";

const MemoShareImageDialog = lazyWithReload(() => import("../MemoActionMenu/MemoShareImageDialog"));
const PreviewImageDialog = lazyWithReload(() => import("../PreviewImageDialog"));

const MemoView = forwardRef<MemoViewHandle, MemoViewProps>((props, ref) => {
  const {
    memo: memoData,
    className,
    parentPage: parentPageProp,
    shareToken,
    compact,
    variant = "card",
    timeDisplay,
    showCreator,
    showVisibility,
    showPinned,
    showSpace,
  } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [EditorComponent, setEditorComponent] = useState<ComponentType<MemoEditorProps>>();
  const [cardWidth, setCardWidth] = useState(0);
  const [failedBentoCover, setFailedBentoCover] = useState<string>();
  const t = useTranslate();

  const currentUser = useCurrentUser();
  const { userTagsSetting } = useAuth();
  const creator = useResolvedUser(memoData.creator, { enabled: Boolean(showCreator || props.shareImageDialogOpen) });
  const isArchived = memoData.state === State.ARCHIVED;
  const readonly = memoData.creator !== currentUser?.name && !isSuperUser(currentUser);
  const location = useLocation();
  const navigateTo = useNavigateTo();
  const parentPage = resolveMemoParentPage({
    explicitParentPage: parentPageProp,
    pathname: location.pathname,
    search: location.search,
    memoName: memoData.name,
  });

  // Blur content when any tag has blur_content enabled in the current user's tag settings.
  const [showBlurredContent, setShowBlurredContent] = useState(false);
  const blurred = isMemoBlurred(memoData, userTagsSetting);
  const toggleBlurVisibility = useCallback(() => setShowBlurredContent((prev) => !prev), []);

  const { previewState, openPreview, setPreviewOpen } = useImagePreview();
  const editorHostRef = useRef<HTMLDivElement>(null);

  const focusMountedEditor = useCallback(() => {
    const codeMirrorContent = editorHostRef.current?.querySelector<HTMLElement>('.cm-content[contenteditable="true"]');
    const fallbackInput = editorHostRef.current?.querySelector<HTMLElement>("textarea, input");
    (codeMirrorContent ?? fallbackInput)?.focus();
  }, []);

  const openEditor = useCallback(() => {
    if (showEditor && EditorComponent) {
      focusMountedEditor();
      return;
    }
    void loadMemoEditor()
      .then(({ default: MemoEditor }) => {
        setEditorComponent(() => MemoEditor);
        setShowEditor(true);
      })
      .catch(() => undefined);
  }, [EditorComponent, focusMountedEditor, showEditor]);
  const closeEditor = useCallback(() => setShowEditor(false), []);

  useImperativeHandle(ref, () => ({ openEditor }), [openEditor]);

  const isInMemoDetailPage = isMemoDetailPath(location.pathname, memoData.name);
  const showCommentPreview = variant !== "bento" && !isInMemoDetailPage && computeCommentAmount(memoData) > 0;
  const bentoCover = variant === "bento" ? getBentoCoverUrl(memoData, shareToken) : undefined;
  const visibleBentoCover = bentoCover === failedBentoCover ? undefined : bentoCover;
  const bentoTileTitle = variant === "bento" ? getBentoTileTitle(memoData) : "";
  const bentoTitle = bentoTileTitle || memoData.name.split("/").pop() || memoData.name;
  const bentoBodySnippet = variant === "bento" && !visibleBentoCover ? getBentoTileSnippet(memoData) : "";
  const bentoSource = variant === "bento" ? getBentoTileSource(memoData) : "";
  const bentoCreator = creator?.displayName || creator?.username || "";
  const bentoMetadata = [bentoSource, bentoCreator].filter(Boolean).join(" · ");

  // The card width is only needed by the share-image dialog. Keep feed cards
  // free of a permanent ResizeObserver and measure only while that dialog is open.
  useLayoutEffect(() => {
    if (!props.shareImageDialogOpen) {
      return;
    }

    const card = cardRef.current;
    if (!card) {
      return;
    }

    const updateWidth = (nextWidth?: number) => {
      const width = Math.round(nextWidth ?? card.getBoundingClientRect().width);
      setCardWidth((prev) => (prev === width ? prev : width));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      const handleResize = () => updateWidth();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      updateWidth(entries[0]?.contentRect.width);
    });

    resizeObserver.observe(card);
    return () => resizeObserver.disconnect();
  }, [props.shareImageDialogOpen]);

  const contextValue = useMemo(
    () => ({
      memo: memoData,
      creator,
      currentUser,
      parentPage,
      shareToken,
      cardWidth,
      isArchived,
      readonly,
      showBlurredContent,
      blurred,
      openEditor,
      toggleBlurVisibility,
      openPreview,
    }),
    [
      memoData,
      creator,
      currentUser,
      parentPage,
      shareToken,
      cardWidth,
      isArchived,
      readonly,
      showBlurredContent,
      blurred,
      openEditor,
      toggleBlurVisibility,
      openPreview,
    ],
  );

  const article = (
    <article
      className={cn(
        MEMO_CARD_BASE_CLASSES,
        showCommentPreview ? "mb-0 rounded-b-none" : "mb-2",
        variant === "bento" &&
          "mb-0 overflow-hidden border-border/80 p-0 transition-[border-color,background-color] hover:border-foreground/20",
        variant === "bento" && (visibleBentoCover ? "justify-end" : "justify-between"),
        className,
      )}
      ref={cardRef}
      tabIndex={variant === "bento" ? -1 : readonly ? -1 : 0}
    >
      {variant === "bento" ? (
        visibleBentoCover ? (
          <>
            <div aria-hidden className="absolute inset-0">
              <img
                src={visibleBentoCover}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-opacity group-hover:opacity-95"
                onError={() => setFailedBentoCover(visibleBentoCover)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            </div>
            {/* Cover tiles trade the full card body for a glanceable title overlay; the
                action menu and full content stay one click away on the detail page. */}
            <button
              type="button"
              className="relative z-10 flex h-full w-full cursor-pointer flex-col justify-end p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => navigateTo(`/${memoData.name}`, { state: createMemoNavigationState(parentPage) })}
            >
              {(bentoSource || (showPinned && memoData.pinned)) && (
                <div className="mb-2 flex min-w-0 items-center gap-2 text-[11px] font-medium text-white/75">
                  {bentoSource && <span className="truncate font-mono">{bentoSource}</span>}
                  {showPinned && memoData.pinned && (
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-white">
                      <PinIcon className="size-3" strokeWidth={2} />
                      {t("common.pinned")}
                    </span>
                  )}
                </div>
              )}
              <p className="line-clamp-3 text-sm font-semibold leading-5 text-white drop-shadow-sm">{bentoTitle}</p>
              {bentoCreator && <p className="mt-1.5 line-clamp-1 text-xs text-white/70">{bentoCreator}</p>}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="relative z-10 flex h-full w-full cursor-pointer flex-col p-4 text-left transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => navigateTo(`/${memoData.name}`, { state: createMemoNavigationState(parentPage) })}
          >
            {(bentoMetadata || (showPinned && memoData.pinned)) && (
              <div className="mb-3 flex min-w-0 items-center gap-2 text-[11px] font-medium text-muted-foreground">
                {bentoMetadata && <span className="truncate font-mono">{bentoMetadata}</span>}
                {showPinned && memoData.pinned && (
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-foreground">
                    <PinIcon className="size-3" strokeWidth={2} />
                    {t("common.pinned")}
                  </span>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 text-sm font-semibold leading-5 text-card-foreground">{bentoTitle}</p>
              {bentoBodySnippet && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{bentoBodySnippet}</p>}
            </div>
          </button>
        )
      ) : (
        <>
          <MemoHeader
            timeDisplay={timeDisplay}
            showCreator={showCreator}
            showVisibility={showVisibility}
            showPinned={showPinned}
            showSpace={showSpace}
          />

          <MemoBody compact={compact} />
        </>
      )}

      {previewState.items.length > 0 && (
        <Suspense fallback={null}>
          <PreviewImageDialog
            open={previewState.open}
            onOpenChange={setPreviewOpen}
            items={previewState.items}
            initialIndex={previewState.index}
          />
        </Suspense>
      )}

      {props.onShareImageDialogOpenChange && props.shareImageDialogOpen && (
        <Suspense fallback={null}>
          <MemoShareImageDialog open onOpenChange={props.onShareImageDialogOpenChange} />
        </Suspense>
      )}
    </article>
  );

  const memoDisplay = showCommentPreview ? (
    <div className="w-full mb-2">
      {article}
      <MemoCommentListView />
    </div>
  ) : (
    article
  );

  return (
    <MemoViewContext.Provider value={contextValue}>
      {showEditor && EditorComponent ? (
        <div ref={editorHostRef} className="w-full">
          <EditorComponent
            autoFocus
            className="mb-2"
            cacheKey={`inline-memo-editor-${memoData.name}`}
            memo={memoData}
            parentMemoName={memoData.parent || undefined}
            onConfirm={closeEditor}
            onCancel={closeEditor}
          />
        </div>
      ) : (
        memoDisplay
      )}
    </MemoViewContext.Provider>
  );
});

MemoView.displayName = "MemoView";

export default memo(MemoView);

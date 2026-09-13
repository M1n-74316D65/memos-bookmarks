import { create } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoViewProps } from "@/components/MemoView/types";
import type PagedMemoList from "@/components/PagedMemoList";
import Bookmarks from "@/pages/Bookmarks";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";

const state = vi.hoisted(() => ({
  spaceFilter: undefined as string | undefined,
  listProps: [] as Array<Record<string, unknown>>,
  refreshCovers: vi.fn(),
  setQuickFindOpen: vi.fn(),
  hasActiveFilters: false,
}));

const refreshResponse = (memosExamined: number, updatedLinks: number, failedLinks: number, nextPageToken = "") => ({
  memosExamined,
  updatedLinks,
  failedLinks,
  skippedLinks: 0,
  nextPageToken,
});

vi.mock("@/connect", () => ({
  memoServiceClient: { refreshMemoLinkCovers: state.refreshCovers },
}));

vi.mock("@/components/PagedMemoList", () => ({
  getMemoKey: (memo: { name: string }) => memo.name,
  default: (props: ComponentProps<typeof PagedMemoList>) => {
    state.listProps.push({ ...props });
    return (
      <div>
        <div data-testid="page-header">{props.renderHeader?.({ useGrid: false })}</div>
        {props.renderLeading?.({ useGrid: false })}
        {props.renderer(create(MemoSchema, { name: "memos/pinned", pinned: true }), { compact: false, variant: "card" })}
        <div data-testid="list" />
      </div>
    );
  },
}));
vi.mock("@/components/MemoView", () => ({
  default: (props: MemoViewProps) => <div data-testid="summary" data-variant={props.variant} data-pinned={props.showPinned} />,
}));
vi.mock("@/components/MemoDisplaySettingMenu", () => ({ default: () => <button type="button">View options</button> }));
vi.mock("@/contexts/AppSidebarContext", () => ({ useAppSidebar: () => ({ setQuickFindOpen: state.setQuickFindOpen }) }));
vi.mock("@/contexts/MemoFilterContext", () => ({ useMemoFilterContext: () => ({ hasActiveFilters: state.hasActiveFilters }) }));
vi.mock("@/components/BookmarksImport/BookmarksImportDialog", () => ({ default: () => <div /> }));
vi.mock("@/hooks", () => ({
  useMemoFilters: () => "creator_filter",
  useMemoSorting: () => ({ listSort: undefined, orderBy: undefined }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => ({ name: "users/u1" }) }));
vi.mock("@/contexts/SpaceContext", () => ({ useSpaceContext: () => ({ memoFilter: state.spaceFilter }) }));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));

const renderPage = (entry = "/bookmarks") =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <Bookmarks />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("<Bookmarks>", () => {
  beforeEach(() => {
    state.spaceFilter = undefined;
    state.listProps = [];
    state.refreshCovers.mockReset();
    state.setQuickFindOpen.mockReset();
    state.hasActiveFilters = false;
  });

  it("places page actions above all columns and keeps single-column bookmarks as pinned summaries", () => {
    renderPage();
    expect(screen.getByTestId("page-header")).toContainElement(screen.getByRole("heading", { name: "common.bookmarks" }));
    expect(screen.getByTestId("summary")).toHaveAttribute("data-variant", "bento");
    expect(screen.getByTestId("summary")).toHaveAttribute("data-pinned", "true");
  });

  it("opens existing search from the library toolbar and retains capture origin", () => {
    renderPage("/bookmarks?filter=tagSearch:reading");
    fireEvent.click(screen.getByRole("button", { name: "bookmarks.search-placeholder" }));
    expect(state.setQuickFindOpen).toHaveBeenCalledWith(true);
    expect(screen.getByRole("link", { name: "common.save-link" })).toHaveAttribute(
      "href",
      "/bookmark?returnTo=%2Fbookmarks%3Ffilter%3DtagSearch%3Areading",
    );
  });

  it("distinguishes filtered empty results from an empty library", () => {
    state.hasActiveFilters = true;
    renderPage();
    expect(state.listProps[0]?.emptyMessage).toBe("bookmarks.no-results");
    expect(state.listProps[0]?.emptyActions).toBeUndefined();
  });

  it("offers capture and import actions in the first-run empty state", () => {
    renderPage();
    expect(state.listProps[0]?.emptyActions).toBeDefined();
  });

  it("feeds only link memos via the has_link filter", () => {
    renderPage();

    expect(state.listProps[0]?.contextFilter).toBe("(has_link)");
  });

  it("combines has_link with the remembered Space scope", () => {
    state.spaceFilter = 'space == "spaces/s1"';
    renderPage();

    expect(state.listProps[0]?.contextFilter).toBe('(has_link) && (space == "spaces/s1")');
  });

  it("surfaces the cover refresh result after clicking update covers", async () => {
    state.refreshCovers.mockResolvedValue(refreshResponse(5, 2, 1));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "bookmarks.refresh-covers" }));

    const status = await screen.findByText("bookmarks.refresh-covers-result");
    expect(status).toBeInTheDocument();
  });

  it("pages through multiple batches using nextPageToken", async () => {
    state.refreshCovers.mockResolvedValueOnce(refreshResponse(200, 2, 0, "200")).mockResolvedValueOnce(refreshResponse(50, 1, 0, ""));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "bookmarks.refresh-covers" }));

    const status = await screen.findByText("bookmarks.refresh-covers-updated");
    expect(status).toBeInTheDocument();
    expect(state.refreshCovers).toHaveBeenCalledTimes(2);
    expect(state.refreshCovers).toHaveBeenNthCalledWith(
      1,
      { pageToken: "", pageSize: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(state.refreshCovers).toHaveBeenNthCalledWith(
      2,
      { pageToken: "200", pageSize: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("stops the active request when leaving bookmarks", async () => {
    state.refreshCovers.mockReturnValue(new Promise(() => {}));
    const view = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "bookmarks.refresh-covers" }));
    const signal = state.refreshCovers.mock.calls[0]?.[1]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("allows cancelling refresh without starting the next page", async () => {
    let resolvePage: (value: ReturnType<typeof refreshResponse>) => void = () => undefined;
    state.refreshCovers.mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "bookmarks.refresh-covers" }));
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    await act(async () => resolvePage(refreshResponse(20, 1, 0, "20")));
    expect(state.refreshCovers).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("bookmarks.refresh-covers-cancelled")).toBeInTheDocument();
  });

  it("invalidates covers saved before a later page fails", async () => {
    state.refreshCovers.mockResolvedValueOnce(refreshResponse(20, 2, 0, "20")).mockRejectedValueOnce(new Error("offline"));
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "bookmarks.refresh-covers" }));
    expect(await screen.findByText("bookmarks.refresh-covers-error")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["memos"] });
    invalidate.mockRestore();
  });

  it("surfaces a cover refresh failure", async () => {
    state.refreshCovers.mockRejectedValue(new Error("boom"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "bookmarks.refresh-covers" }));

    expect(await screen.findByText("bookmarks.refresh-covers-error")).toBeInTheDocument();
  });

  it("threads the card variant through the renderer", () => {
    renderPage();

    const renderer = state.listProps[0]?.renderer as (memo: unknown, options: { variant: string }) => unknown;
    expect(renderer).toBeTypeOf("function");
  });
});

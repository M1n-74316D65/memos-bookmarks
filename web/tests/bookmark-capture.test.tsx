import { create } from "@bufbuild/protobuf";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoInit } from "@/components/MemoEditor/hooks/useMemoInit";
import { cacheService } from "@/components/MemoEditor/services/cacheService";
import { EditorProvider, useEditorSelector } from "@/components/MemoEditor/state";
import Bookmark from "@/pages/Bookmark";
import { AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";

const state = vi.hoisted(() => ({ mutate: vi.fn(), error: vi.fn(), selectedSpaceName: "" }));
vi.mock("@/contexts/SpaceContext", () => ({ useSpaceContext: () => ({ selectedSpaceName: state.selectedSpaceName || undefined }) }));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => ({ name: "users/test" }) }));
vi.mock("@/hooks/useMemoQueries", () => ({ useCreateMemo: () => ({ mutate: state.mutate }) }));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));
vi.mock("react-hot-toast", () => ({ default: { error: state.error } }));
vi.mock("@/components/MemoEditor", () => ({
  default: (props: { initialContent?: string; defaultSpace?: string; cacheKey: string; onConfirm?: () => void; onCancel?: () => void }) => (
    <EditorProvider>
      <EditorProbe {...props} />
      <button type="button" onClick={props.onConfirm}>
        Save
      </button>
      {props.onCancel && (
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      )}
    </EditorProvider>
  ),
}));

function EditorProbe({ initialContent, defaultSpace, cacheKey }: { initialContent?: string; defaultSpace?: string; cacheKey: string }) {
  useMemoInit({ editorRef: { current: null }, username: "users/test", cacheKey, initialContent });
  const content = useEditorSelector((editor) => editor.content);
  const attachments = useEditorSelector((editor) => editor.metadata.attachments);
  return (
    <div
      data-testid="editor"
      data-space={defaultSpace}
      data-cache-key={cacheKey}
      data-attachments={attachments.map((attachment) => attachment.name).join(",")}
    >
      {content}
    </div>
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

const renderCapture = (query = "") =>
  render(
    <MemoryRouter initialEntries={[`/bookmark${query}`]}>
      <Bookmark />
      <LocationProbe />
    </MemoryRouter>,
  );

describe("bookmark capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.mutate.mockReset();
    state.selectedSpaceName = "";
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    cacheService.clearAll();
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["Save", "Cancel"])("returns to the filtered bookmarks page when choosing %s", (action) => {
    const returnTo = "/bookmarks?filter=tagSearch%3Awork&view=list";
    renderCapture(`?returnTo=${encodeURIComponent(returnTo)}`);
    fireEvent.change(screen.getByRole("textbox", { name: "bookmarks.capture-url-label" }), {
      target: { value: "https://example.com/article" },
    });
    fireEvent.click(screen.getByRole("button", { name: "bookmarks.capture-continue" }));
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(screen.getByTestId("location")).toHaveTextContent(returnTo);
  });

  it("offers a return link before a URL is entered", () => {
    const returnTo = "/bookmarks?filter=tagSearch%3Awork";
    renderCapture(`?returnTo=${encodeURIComponent(returnTo)}`);
    expect(screen.getByRole("link", { name: "memo.back-to" })).toHaveAttribute("href", returnTo);
  });

  it("places a capture in the Space encoded by its bookmark collection", () => {
    const returnTo = "/spaces/work/bookmarks?filter=tagSearch%3Aresearch";
    renderCapture(`?url=https://example.com/article&returnTo=${encodeURIComponent(returnTo)}`);

    expect(screen.getByTestId("editor")).toHaveAttribute("data-space", "spaces/work");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("location")).toHaveTextContent(returnTo);
  });

  it("autosaves into and returns to the Space bookmark collection", () => {
    const returnTo = "/spaces/work/bookmarks";
    state.mutate.mockImplementation((_memo, options: { onSuccess: () => void }) => options.onSuccess());
    renderCapture(`?url=https://example.com/article&autosave=1&returnTo=${encodeURIComponent(returnTo)}`);

    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ space: "spaces/work" }), expect.any(Object));
    expect(screen.getByTestId("location").textContent).toBe(returnTo);
  });

  it.each([
    "https://evil.example/bookmarks",
    "//evil.example/bookmarks",
    "/bookmarks/../settings",
    "/bookmarks-extra",
    "/settings",
  ])("falls back home when returnTo is %s", (returnTo) => {
    renderCapture(`?url=https://example.com/article&returnTo=${encodeURIComponent(returnTo)}`);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("still returns home when the standalone bookmarklet autosaves", () => {
    state.mutate.mockImplementation((_memo, options: { onSuccess: () => void }) => options.onSuccess());
    renderCapture("?url=https://example.com/article&autosave=1");
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("restores annotations and uploaded attachments when a capture is reopened", () => {
    const first = renderCapture("?url=https://example.com/article");
    const cacheKey = screen.getByTestId("editor").getAttribute("data-cache-key") ?? "";
    first.unmount();
    cacheService.saveNow(cacheService.key("users/test", cacheKey), "My annotation", [
      create(AttachmentSchema, { name: "attachments/image" }),
    ]);
    renderCapture("?url=https://example.com/article");
    expect(screen.getByTestId("editor").textContent).toBe("My annotation");
    expect(screen.getByTestId("editor").getAttribute("data-attachments")).toBe("attachments/image");
  });

  it("keeps drafts separate for different captured URLs", () => {
    const first = renderCapture("?url=https://example.com/article");
    const cacheKey = screen.getByTestId("editor").getAttribute("data-cache-key") ?? "";
    first.unmount();
    cacheService.saveNow(cacheService.key("users/test", cacheKey), "First article notes");
    renderCapture("?url=https://example.com/other");
    expect(screen.getByTestId("editor").textContent).toBe("https://example.com/other #unread");
    expect(screen.getByTestId("editor").getAttribute("data-cache-key")).not.toBe(cacheKey);
  });

  it("places reviewed captures in the selected Space", () => {
    state.selectedSpaceName = "spaces/work";
    renderCapture("?url=https://example.com/article");
    expect(screen.getByTestId("editor").getAttribute("data-space")).toBe("spaces/work");
  });

  it("autosaves captures in the selected Space", () => {
    state.selectedSpaceName = "spaces/work";
    renderCapture("?url=https://example.com/article&autosave=1");
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ space: "spaces/work" }), expect.any(Object));
  });

  it("lets a user enter a URL and review a draft", () => {
    renderCapture();
    fireEvent.change(screen.getByRole("textbox", { name: "bookmarks.capture-url-label" }), {
      target: { value: "https://example.com/article" },
    });
    fireEvent.click(screen.getByRole("button", { name: "bookmarks.capture-continue" }));
    expect(screen.getByTestId("editor").textContent).toBe("https://example.com/article #unread");
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("does not autosave an unsafe URL", () => {
    renderCapture("?url=javascript:alert(1)&autosave=1");
    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("bookmarks.capture-invalid-url");
  });

  it("preserves tags in the draft after autosave fails", async () => {
    state.mutate.mockImplementation((_memo, options: { onError: () => void }) => options.onError());
    renderCapture("?url=https://example.com/article&title=Example&tags=work,read-later&autosave=1");
    expect((await screen.findByTestId("editor")).textContent).toBe("[Example](https://example.com/article) #work #read-later");
  });

  it("shows feedback when copying the bookmarklet fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    renderCapture();
    fireEvent.click(screen.getByRole("button", { name: "bookmarks.capture-copy-bookmarklet" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("bookmarks.capture-copy-failed"));
  });

  it("exposes the generated bookmarklet URL for browser bookmarking", () => {
    renderCapture();
    const link = screen.getByRole("link", { name: "bookmarks.capture-button-label" });
    expect(link.getAttribute("href")).toBe(
      `javascript:location.href='${window.location.origin}/bookmark?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&autosave=1'`,
    );
  });
});

import { create } from "@bufbuild/protobuf";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import MemoView from "@/components/MemoView";
import { MemoRelation_Type, MemoSchema, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { UserSetting_TagsSettingSchema } from "@/types/proto/api/v1/user_service_pb";

vi.mock("@/components/MemoContent/MentionResolutionContext", () => ({ useResolvedUser: () => undefined }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userTagsSetting: create(UserSetting_TagsSettingSchema, { tags: { sensitive: { blurContent: true } } }) }),
}));
vi.mock("@/contexts/SpaceContext", () => ({ useSpaceContext: () => ({ duplicateSpaceTitles: new Set(), spaceByName: new Map() }) }));
vi.mock("@/utils/i18n", () => ({ findNearestMatchedLanguage: () => "en", useTranslate: () => (key: string) => key }));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => ({ name: "users/me" }) }));
vi.mock("@/hooks/useNavigateTo", () => ({ default: () => vi.fn() }));
vi.mock("@/components/MemoView/hooks", () => ({
  useImagePreview: () => ({ previewState: { items: [], open: false, index: 0 }, openPreview: vi.fn(), setPreviewOpen: vi.fn() }),
}));
vi.mock("@/components/MemoView/components", () => ({
  MemoHeader: () => <div data-testid="header" />,
  MemoBody: () => <div data-testid="body" />,
  MemoCommentListView: () => <div data-testid="comments" />,
}));

const memo = create(MemoSchema, {
  name: "memos/bookmark",
  creator: "users/me",
  relations: [{ type: MemoRelation_Type.COMMENT, relatedMemo: { name: "memos/bookmark" } }],
});

describe("MemoView bento variant", () => {
  it("keeps comment previews out of the fixed-height tile", () => {
    render(
      <MemoryRouter>
        <MemoView memo={memo} variant="bento" />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("comments")).not.toBeInTheDocument();
    expect(screen.queryByTestId("body")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /bookmark/ })).toBeInTheDocument();
  });
});

const bookmark = create(MemoSchema, {
  name: "memos/source",
  creator: "users/me",
  content: "Secret title\nSecret excerpt",
  tags: ["sensitive"],
  property: { links: [{ url: "https://example.com/article", title: "Secret title", coverAttachmentUid: "cover" }] },
  pinned: true,
  visibility: Visibility.PUBLIC,
  space: "spaces/research",
});

it("conceals sensitive text, links, and images until explicit reveal", () => {
  const { container } = render(
    <MemoryRouter>
      <MemoView memo={bookmark} variant="bento" />
    </MemoryRouter>,
  );
  expect(container).not.toHaveTextContent("Secret");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "memo.click-to-show-sensitive-content" }));
  expect(screen.getByRole("link", { name: "Secret title" })).toHaveAttribute("href", "/memos/source");
  expect(container.querySelector("img")).toBeInTheDocument();
});

it("uses concise detail links with independent safe source navigation and metadata", () => {
  const { container } = render(
    <MemoryRouter>
      <MemoView memo={{ ...bookmark, tags: [] }} variant="bento" showSpace showVisibility showPinned />
    </MemoryRouter>,
  );
  const detail = screen.getByRole("link", { name: "Secret title" });
  const source = screen.getByRole("link", { name: /example.com/ });
  expect(detail).toHaveAttribute("href", "/memos/source");
  expect(detail).not.toContainElement(source);
  expect(source).toHaveAttribute("href", "https://example.com/article");
  expect(source).toHaveAttribute("target", "_blank");
  expect(source).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByText("common.pinned")).toBeVisible();
  expect(screen.getByTitle(/research/)).toBeVisible();
  expect(screen.getByText("memo.visibility.public")).toBeVisible();
  expect(container.querySelector("article")).toHaveClass("rounded-xl", "focus-within:border-ring/50");
});

it("omits unsafe source URLs", () => {
  render(
    <MemoryRouter>
      <MemoView
        memo={create(MemoSchema, { name: "memos/unsafe", content: "Title", property: { links: [{ url: "javascript:alert(1)" }] } })}
        variant="bento"
      />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole("link")).toHaveLength(1);
});

it("reveals a text summary without including its excerpt in the detail link name", () => {
  render(
    <MemoryRouter>
      <MemoView memo={{ ...bookmark, property: undefined }} variant="bento" />
    </MemoryRouter>,
  );
  expect(screen.queryByText("Secret excerpt")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "memo.click-to-show-sensitive-content" }));
  expect(screen.getByText("Secret excerpt")).toBeVisible();
  expect(screen.getByRole("link", { name: "Secret title" })).toBeVisible();
  expect(screen.getByText("Secret title")).toHaveClass("line-clamp-2");
  expect(screen.getByText("Secret excerpt")).toHaveClass("line-clamp-1");
});

it("keeps the originating collection and query in detail navigation state", () => {
  const LocationState = () => {
    const location = useLocation();
    return <output>{JSON.stringify({ path: location.pathname, state: location.state })}</output>;
  };
  render(
    <MemoryRouter initialEntries={["/bookmarks?filter=saved"]}>
      <MemoView memo={memo} variant="bento" />
      <LocationState />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("link", { name: "bookmark" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    JSON.stringify({ path: "/memos/bookmark", state: { from: "/bookmarks?filter=saved" } }),
  );
});

it("falls back to the text summary when a cover cannot load", () => {
  const { container } = render(
    <MemoryRouter>
      <MemoView memo={{ ...bookmark, tags: [] }} variant="bento" />
    </MemoryRouter>,
  );
  const cover = container.querySelector("img");
  if (!cover) throw new Error("Expected the saved cover to render");
  fireEvent.error(cover);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("Secret excerpt")).toBeVisible();
});

describe("MemoView detail cover", () => {
  it("renders the saved cover only on the memo detail route", () => {
    const detail = render(
      <MemoryRouter initialEntries={["/memos/source"]}>
        <MemoView memo={{ ...bookmark, tags: [] }} />
      </MemoryRouter>,
    );

    expect(detail.container.querySelector("img")).toHaveAttribute("src", "/file/memos/source/covers/cover");
    expect(screen.getByTestId("header")).toBeVisible();
    expect(screen.getByTestId("body")).toBeVisible();
    detail.unmount();

    const feed = render(
      <MemoryRouter>
        <MemoView memo={{ ...bookmark, tags: [] }} />
      </MemoryRouter>,
    );
    expect(feed.container.querySelector("img")).toBeNull();
  });

  it("keeps sensitive covers concealed", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/memos/source"]}>
        <MemoView memo={bookmark} />
      </MemoryRouter>,
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("removes a detail cover that cannot load without hiding the memo", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/memos/source"]}>
        <MemoView memo={{ ...bookmark, tags: [] }} />
      </MemoryRouter>,
    );
    const cover = container.querySelector("img");
    if (!cover) throw new Error("Expected the saved cover to render");
    fireEvent.error(cover);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("body")).toBeVisible();
  });
});

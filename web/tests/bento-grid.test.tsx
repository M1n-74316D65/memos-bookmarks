import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BentoGrid from "@/components/BentoGrid";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";

// jsdom has no layout engine (clientWidth is 0, which overrides the album's
// defaultContainerWidth on the ref callback), so every test spies a real width.
// These assert render structure, not row packing — the layout math is
// react-photo-album's.
let clientWidth: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
});
afterEach(() => {
  clientWidth.mockRestore();
});
const buildMemo = (overrides: MessageInitShape<typeof MemoSchema> = {}) =>
  create(MemoSchema, { name: "memos/main", content: "hello", attachments: [], ...overrides });

const getKey = (memo: { name: string }) => memo.name;

const namedCard = (memo: ReturnType<typeof buildMemo>) => <div data-name={memo.name} />;

describe("<BentoGrid>", () => {
  it("keeps text summaries readable regardless of full memo length", () => {
    const { container } = render(
      <BentoGrid
        items={[
          buildMemo({ name: "memos/short", content: "Short title" }),
          buildMemo({ name: "memos/long", content: `Long title\n${"A long paragraph. ".repeat(100)}` }),
          buildMemo({ name: "memos/third", content: "Another title" }),
        ]}
        getKey={getKey}
        renderItem={namedCard}
      />,
    );

    const widths = [...container.querySelectorAll<HTMLElement>("[data-name]")].map((tile) =>
      Number.parseFloat(tile.parentElement?.style.width ?? "0"),
    );
    const heights = [...container.querySelectorAll<HTMLElement>("[data-name]")].map((tile) =>
      Number.parseFloat(tile.parentElement?.style.height ?? "0"),
    );
    expect(widths).toHaveLength(3);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(260);
    expect(widths[0]).toBeCloseTo(widths[1], 0);
    expect(widths.map((width, index) => width / heights[index])).toEqual([
      expect.closeTo(3, 2),
      expect.closeTo(3, 2),
      expect.closeTo(3, 2),
    ]);
  });

  it("moves mixed-aspect tiles to another row before making one too narrow", () => {
    clientWidth.mockReturnValue(1136);
    const withAspect = (name: string, width: number, height: number) =>
      buildMemo({
        name,
        property: { links: [{ url: `https://example.com/${name}`, coverAttachmentUid: name, coverWidth: width, coverHeight: height }] },
      });
    const { container } = render(
      <BentoGrid
        items={[withAspect("wide", 16, 9), withAspect("square", 1, 1), buildMemo({ name: "memos/text" })]}
        getKey={getKey}
        renderItem={namedCard}
      />,
    );

    const widths = [...container.querySelectorAll<HTMLElement>("[data-name]")].map((tile) =>
      Number.parseFloat(tile.parentElement?.style.width ?? "0"),
    );
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(260);
  });

  it("renders one tile per item inside the album", () => {
    const { container } = render(
      <BentoGrid items={[buildMemo({ name: "memos/a" }), buildMemo({ name: "memos/b" })]} getKey={getKey} renderItem={namedCard} />,
    );

    const album = container.querySelector(".react-photo-album") as HTMLElement;
    expect(album).toBeTruthy();
    expect(container.querySelectorAll("[data-name]")).toHaveLength(2);
  });

  it("renders the leading node above the album", () => {
    const { getByTestId } = render(
      <BentoGrid items={[buildMemo()]} getKey={getKey} renderItem={namedCard} leading={<div data-testid="composer" />} />,
    );

    expect(getByTestId("composer")).toBeInTheDocument();
    const leadingWrapper = getByTestId("composer").parentElement as HTMLElement;
    const album = leadingWrapper.nextElementSibling as HTMLElement;
    expect(album.classList.contains("react-photo-album")).toBe(true);
    expect(album.contains(leadingWrapper)).toBe(false);
  });

  it("renders the priority item first", () => {
    const first = buildMemo({ name: "memos/first" });
    const second = buildMemo({ name: "memos/second" });
    const { container } = render(<BentoGrid items={[first, second]} getKey={getKey} renderItem={namedCard} priorityKey="memos/second" />);

    const tiles = [...container.querySelectorAll<HTMLElement>("[data-name]")];
    expect(tiles[0]).toHaveAttribute("data-name", "memos/second");
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<BentoGrid items={[]} getKey={getKey} renderItem={namedCard} />);
    expect(container.querySelector(".react-photo-album")?.children).toHaveLength(0);
  });
});

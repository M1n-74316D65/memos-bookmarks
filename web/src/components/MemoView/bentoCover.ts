import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { getAttachmentType, getAttachmentUrl, getMemoCoverUrl, isImage } from "@/utils/attachment";

/** Locally cached cover for the first link that carries one. */
export const getMemoLinkCoverUrl = (memo: Memo, shareToken?: string): string | undefined => {
  const linkCover = (memo.property?.links ?? []).find((link) => Boolean(link.coverAttachmentUid))?.coverAttachmentUid;
  return linkCover ? getMemoCoverUrl(memo.name, linkCover, shareToken) : undefined;
};

/**
 * Cover source for bento tiles: the locally cached link cover when the memo carries one,
 * otherwise the first image attachment.
 */
export const getBentoCoverUrl = (memo: Memo, shareToken?: string): string | undefined => {
  const linkCover = getMemoLinkCoverUrl(memo, shareToken);
  if (linkCover) return linkCover;
  const image = (memo.attachments ?? []).find((attachment) => isImage(getAttachmentType(attachment)));
  return image ? getAttachmentUrl(image) : undefined;
};

/** First safe source destination for opening a saved link. */
export const getBentoTileSourceUrl = (memo: Memo): URL | undefined => {
  const bookmarkSource = memo.bookmark?.sourceUrl;
  if (bookmarkSource && URL.canParse(bookmarkSource)) {
    const url = new URL(bookmarkSource);
    if (url.protocol === "https:" || url.protocol === "http:") return url;
  }
  for (const link of memo.property?.links ?? []) {
    if (!URL.canParse(link.url)) continue;
    const url = new URL(link.url);
    if (url.protocol === "https:" || url.protocol === "http:") return url;
  }
  return undefined;
};

/** Compact, human-readable source for link tiles. */
export const getBentoTileSource = (memo: Memo): string => getBentoTileSourceUrl(memo)?.hostname.replace(/^www\./, "") ?? "";

const stripMarkdown = (line: string): string =>
  line
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/[#*>`~]/g, "")
    .trim();

const getCapturedBookmarkTitle = (line: string): string | undefined => {
  const match = line.trim().match(/^\[([^\]]+)]\([^)]*\)(?:\s+#[^\s#]+)*\s*$/);
  return match?.[1]?.trim() || undefined;
};

/** Tile title: the first stored link title, else the first meaningful content line. */
export const getBentoTileTitle = (memo: Memo): string => {
  const linkTitle = (memo.property?.links ?? []).find((link) => Boolean(link.title))?.title;
  if (linkTitle) {
    return linkTitle;
  }
  for (const line of (memo.content ?? "").split("\n")) {
    const capturedTitle = getCapturedBookmarkTitle(line);
    if (capturedTitle) return capturedTitle;
    const stripped = stripMarkdown(line);
    if (stripped) return stripped;
  }
  return "";
};

/** Tile body snippet: subsequent lines for non-cover text cards. */
export const getBentoTileSnippet = (memo: Memo): string => {
  const lines = (memo.content ?? "")
    .split("\n")
    .filter((line) => !/^(?:\s*#[^\s#]+)+\s*$/.test(line))
    .map((line) => stripMarkdown(line))
    .filter((line) => line.length > 0);
  const remaining = lines.slice(1).join(" ");
  if (remaining.trim()) return remaining.trim();
  return (memo.property?.links ?? []).find((link) => Boolean(link.description))?.description.trim() ?? "";
};

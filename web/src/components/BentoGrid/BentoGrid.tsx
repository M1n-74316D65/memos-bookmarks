import { type ReactNode, useMemo } from "react";
import { type Photo, RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import { columnCountForWidth, GRID_GAP } from "@/components/ColumnGrid";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { BENTO_ROW_UNIT, BENTO_ROW_UNIT_SMALL, BENTO_SMALL_WIDTH, memoVisualAspect } from "./bentoSpan";

interface BentoGridProps {
  items: Memo[];
  /** Stable identity for each item; also used as the React key. */
  getKey: (item: Memo) => string;
  renderItem: (item: Memo) => ReactNode;
  /** Optional node rendered above the album (e.g. the note composer). */
  leading?: ReactNode;
  /** Key rendered as the first tile, ahead of list order. */
  priorityKey?: string;
  /** Upper bound on photos per row; 0 or undefined means as many as fit. */
  maxColumns?: number;
}

/** Photo model carrying its memo; width/height encode the tile shape. */
interface BentoPhoto extends Photo {
  memo: Memo;
}

const TEXT_BASE_WIDTH = 1000;

/**
 * Bento layout built on react-photo-album's rows layout: a justified grid where each
 * row is solved from the tiles' aspect ratios, so media shape drives tile shape with
 * no hand-rolled packing. Summary readability bounds media shape and row density.
 */
const BentoGrid = ({ items, getKey, renderItem, leading, priorityKey, maxColumns }: BentoGridProps) => {
  const photos = useMemo(() => {
    const ordered = [...items];
    if (priorityKey) {
      const priorityIndex = ordered.findIndex((item) => getKey(item) === priorityKey);
      if (priorityIndex > 0) {
        const [priority] = ordered.splice(priorityIndex, 1);
        ordered.unshift(priority);
      }
    }
    return ordered.map<BentoPhoto>((memo) => {
      // Coverless summaries are typographic tiles, so give them a wider shape than
      // media cards instead of stretching a small amount of text into a tall box.
      const aspect = Math.max(1.5, Math.min(3, memoVisualAspect(memo) ?? 3));
      return { src: "", width: TEXT_BASE_WIDTH, height: Math.round(TEXT_BASE_WIDTH / aspect), memo, key: getKey(memo) };
    });
  }, [items, getKey, priorityKey]);

  return (
    <>
      {leading != null && (
        <div className="mx-auto w-full" style={{ marginBottom: GRID_GAP }}>
          {leading}
        </div>
      )}
      <RowsPhotoAlbum
        photos={photos}
        spacing={GRID_GAP}
        targetRowHeight={(containerWidth) => (containerWidth < BENTO_SMALL_WIDTH ? BENTO_ROW_UNIT_SMALL : BENTO_ROW_UNIT)}
        defaultContainerWidth={800}
        rowConstraints={(width) => ({
          maxPhotos: Math.min(columnCountForWidth(width), maxColumns || Infinity),
          singleRowMaxHeight: BENTO_ROW_UNIT,
        })}
        render={{
          photo: (_props, { photo, width, height }) => (
            <div className="relative overflow-hidden [&>*]:absolute [&>*]:inset-0" style={{ width, height }}>
              {renderItem(photo.memo)}
            </div>
          ),
        }}
      />
    </>
  );
};

export default BentoGrid;

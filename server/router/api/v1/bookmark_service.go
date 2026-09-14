package v1

import (
	"context"
	"net/url"
	"strconv"
	"strings"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

// SaveBookmark creates a bookmark, or restores and resurfaces an existing link bookmark.
func (s *APIV1Service) SaveBookmark(ctx context.Context, request *v1pb.SaveBookmarkRequest) (*v1pb.Memo, error) {
	if request.Bookmark == nil || request.Bookmark.Bookmark == nil {
		return nil, status.Error(codes.InvalidArgument, "bookmark is required")
	}
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Error(codes.Unauthenticated, "user not authenticated")
	}

	bookmark := request.Bookmark
	if bookmark.Bookmark.Type == v1pb.Bookmark_LINK {
		normalized, err := normalizeBookmarkURL(bookmark.Bookmark.SourceUrl)
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, "link bookmark requires a valid HTTP or HTTPS source URL")
		}
		bookmark.Bookmark.SourceUrl = normalized
	}

	if err := validateBookmark(bookmark); err != nil {
		return nil, err
	}
	if bookmark.Bookmark.Type == v1pb.Bookmark_LINK {
		key := strconv.FormatInt(int64(user.ID), 10) + ":" + bookmark.Bookmark.SourceUrl
		value, err, _ := s.bookmarkSaves.Do(key, func() (any, error) {
			return s.saveLinkBookmark(ctx, user.ID, bookmark)
		})
		if err != nil {
			return nil, err
		}
		return value.(*v1pb.Memo), nil
	}
	return s.CreateMemo(ctx, &v1pb.CreateMemoRequest{Memo: bookmark})
}

func (s *APIV1Service) saveLinkBookmark(ctx context.Context, userID int32, bookmark *v1pb.Memo) (*v1pb.Memo, error) {
	existing, err := s.findLinkBookmark(ctx, userID, bookmark.Bookmark.SourceUrl)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to check existing bookmarks")
	}
	if existing != nil {
		paths := []string{"update_time"}
		updated := &v1pb.Memo{
			Name:       buildMemoName(existing.UID),
			UpdateTime: timestamppb.New(time.Now()),
		}
		if existing.RowStatus == store.Archived {
			updated.State = v1pb.State_NORMAL
			paths = append(paths, "state")
		}
		return s.UpdateMemo(ctx, &v1pb.UpdateMemoRequest{Memo: updated, UpdateMask: &fieldmaskpb.FieldMask{Paths: paths}})
	}
	return s.CreateMemo(ctx, &v1pb.CreateMemoRequest{Memo: bookmark})
}

func validateBookmark(memo *v1pb.Memo) error {
	bookmark := memo.GetBookmark()
	if bookmark == nil {
		return nil
	}
	switch bookmark.Type {
	case v1pb.Bookmark_LINK:
		if _, err := normalizeBookmarkURL(bookmark.SourceUrl); err != nil {
			return status.Error(codes.InvalidArgument, "link bookmark requires a valid HTTP or HTTPS source URL")
		}
	case v1pb.Bookmark_TEXT:
		if strings.TrimSpace(memo.Content) == "" {
			return status.Error(codes.InvalidArgument, "text bookmark requires content")
		}
	case v1pb.Bookmark_ASSET:
		if len(memo.Attachments) == 0 {
			return status.Error(codes.InvalidArgument, "asset bookmark requires an attachment")
		}
	default:
		return status.Error(codes.InvalidArgument, "bookmark type is required")
	}
	return nil
}

func normalizeBookmarkURL(value string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", status.Error(codes.InvalidArgument, "invalid bookmark URL")
	}
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	parsed.Host = strings.ToLower(parsed.Host)
	parsed.Fragment = ""
	return parsed.String(), nil
}

func (s *APIV1Service) findLinkBookmark(ctx context.Context, creatorID int32, sourceURL string) (*store.Memo, error) {
	const pageSize = 100
	for offset := 0; ; offset += pageSize {
		limit := pageSize
		memos, err := s.Store.ListMemos(ctx, &store.FindMemo{
			CreatorID: &creatorID,
			Filters:   []string{"is_bookmark"},
			Limit:     &limit,
			Offset:    &offset,
		})
		if err != nil {
			return nil, err
		}
		for _, memo := range memos {
			bookmark := memo.Payload.GetBookmark()
			if bookmark.GetType() != storepb.Bookmark_LINK || bookmark.GetSourceUrl() == "" {
				continue
			}
			normalized, err := normalizeBookmarkURL(bookmark.GetSourceUrl())
			if err == nil && normalized == sourceURL {
				return memo, nil
			}
		}
		if len(memos) < pageSize {
			return nil, nil
		}
	}
}

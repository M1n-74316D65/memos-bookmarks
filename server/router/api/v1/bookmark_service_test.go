package v1

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	"github.com/usememos/memos/internal/httpgetter"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

type blockingBookmarkFetcher struct {
	started chan struct{}
	release chan struct{}
	once    sync.Once
}

func (f *blockingBookmarkFetcher) Get(ctx context.Context, _ string) (*httpgetter.HTMLMeta, error) {
	f.once.Do(func() { close(f.started) })
	select {
	case <-f.release:
		return &httpgetter.HTMLMeta{}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (f *blockingBookmarkFetcher) GetFresh(ctx context.Context, url string) (*httpgetter.HTMLMeta, error) {
	return f.Get(ctx, url)
}

func (*blockingBookmarkFetcher) GetImage(context.Context, string) (*httpgetter.Image, error) {
	return nil, nil
}

func TestSaveBookmarkValidatesTypeSpecificContent(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	user := createSpaceTestUser(ctx, t, service, "bookmark-validation", store.RoleUser)
	ctx = userCtx(ctx, user.ID)

	tests := []struct {
		name     string
		bookmark *v1pb.Memo
	}{
		{name: "missing metadata", bookmark: &v1pb.Memo{Content: "text"}},
		{name: "missing type", bookmark: &v1pb.Memo{Bookmark: &v1pb.Bookmark{}}},
		{name: "link missing source", bookmark: &v1pb.Memo{Bookmark: &v1pb.Bookmark{Type: v1pb.Bookmark_LINK}}},
		{name: "link unsupported scheme", bookmark: &v1pb.Memo{Bookmark: &v1pb.Bookmark{Type: v1pb.Bookmark_LINK, SourceUrl: "file:///tmp/a"}}},
		{name: "text missing content", bookmark: &v1pb.Memo{Bookmark: &v1pb.Bookmark{Type: v1pb.Bookmark_TEXT}}},
		{name: "asset missing attachment", bookmark: &v1pb.Memo{Bookmark: &v1pb.Bookmark{Type: v1pb.Bookmark_ASSET}}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := service.SaveBookmark(ctx, &v1pb.SaveBookmarkRequest{Bookmark: test.bookmark})
			require.Equal(t, codes.InvalidArgument, status.Code(err))
		})
	}
}

func TestSaveBookmarkDeduplicatesLinksAndRestoresArchive(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	user := createSpaceTestUser(ctx, t, service, "bookmark-deduplication", store.RoleUser)
	ctx = userCtx(ctx, user.ID)

	created, err := service.SaveBookmark(ctx, &v1pb.SaveBookmarkRequest{Bookmark: &v1pb.Memo{
		Content:    "original content",
		Visibility: v1pb.Visibility_PRIVATE,
		Bookmark:   &v1pb.Bookmark{Type: v1pb.Bookmark_LINK, SourceUrl: "HTTPS://EXAMPLE.COM/path#section", Favorited: true},
	}})
	require.NoError(t, err)
	require.Equal(t, "https://example.com/path", created.Bookmark.SourceUrl)

	_, err = service.UpdateMemo(ctx, &v1pb.UpdateMemoRequest{
		Memo:       &v1pb.Memo{Name: created.Name, State: v1pb.State_ARCHIVED},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"state"}},
	})
	require.NoError(t, err)

	duplicate, err := service.SaveBookmark(ctx, &v1pb.SaveBookmarkRequest{Bookmark: &v1pb.Memo{
		Content:  "replacement content",
		Bookmark: &v1pb.Bookmark{Type: v1pb.Bookmark_LINK, SourceUrl: "https://example.com/path#different"},
	}})
	require.NoError(t, err)
	require.Equal(t, created.Name, duplicate.Name)
	require.Equal(t, v1pb.State_NORMAL, duplicate.State)
	require.Equal(t, "original content", duplicate.Content)
	require.True(t, duplicate.Bookmark.Favorited)
}

func TestSaveBookmarkSerializesConcurrentLinkSaves(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	fetcher := &blockingBookmarkFetcher{started: make(chan struct{}), release: make(chan struct{})}
	service.linkMetadataFetcher = fetcher
	user := createSpaceTestUser(ctx, t, service, "bookmark-concurrency", store.RoleUser)
	ctx = userCtx(ctx, user.ID)

	const saves = 8
	start := make(chan struct{})
	names := make(chan string, saves)
	errs := make(chan error, saves)
	var ready sync.WaitGroup
	ready.Add(saves)
	for range saves {
		go func() {
			ready.Done()
			<-start
			memo, err := service.SaveBookmark(ctx, &v1pb.SaveBookmarkRequest{Bookmark: &v1pb.Memo{
				Content:  "https://example.com/concurrent",
				Bookmark: &v1pb.Bookmark{Type: v1pb.Bookmark_LINK, SourceUrl: "https://example.com/concurrent"},
			}})
			if err != nil {
				errs <- err
				return
			}
			names <- memo.Name
		}()
	}
	ready.Wait()
	close(start)
	<-fetcher.started
	time.Sleep(20 * time.Millisecond)
	close(fetcher.release)

	var name string
	for range saves {
		select {
		case err := <-errs:
			require.NoError(t, err)
		case got := <-names:
			if name == "" {
				name = got
			}
			require.Equal(t, name, got)
		case <-time.After(time.Second):
			t.Fatal("timed out waiting for bookmark save")
		}
	}

	bookmarks, err := service.Store.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID, Filters: []string{"is_bookmark"}})
	require.NoError(t, err)
	require.Len(t, bookmarks, 1)
}

func TestBookmarkMetadataIsExplicitAndSurvivesContentUpdate(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	user := createSpaceTestUser(ctx, t, service, "bookmark-metadata", store.RoleUser)
	ctx = userCtx(ctx, user.ID)

	normalMemo, err := service.CreateMemo(ctx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "https://example.com/not-a-bookmark"}})
	require.NoError(t, err)

	bookmark, err := service.SaveBookmark(ctx, &v1pb.SaveBookmarkRequest{Bookmark: &v1pb.Memo{
		Content:  "saved text",
		Bookmark: &v1pb.Bookmark{Type: v1pb.Bookmark_TEXT, Favorited: true},
	}})
	require.NoError(t, err)

	bookmarks, err := service.Store.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID, Filters: []string{"is_bookmark"}})
	require.NoError(t, err)
	require.Len(t, bookmarks, 1)
	require.NotEqual(t, normalMemo.Name, buildMemoName(bookmarks[0].UID))

	updated, err := service.UpdateMemo(ctx, &v1pb.UpdateMemoRequest{
		Memo:       &v1pb.Memo{Name: bookmark.Name, Content: "changed text"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"content"}},
	})
	require.NoError(t, err)
	require.Equal(t, v1pb.Bookmark_TEXT, updated.Bookmark.Type)
	require.True(t, updated.Bookmark.Favorited)
}

func TestBookmarkOnlyMutationsRejectOrdinaryMemosAndComments(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	user := createSpaceTestUser(ctx, t, service, "bookmark-boundaries", store.RoleUser)
	ctx = userCtx(ctx, user.ID)

	memo, err := service.CreateMemo(ctx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "ordinary memo"}})
	require.NoError(t, err)
	_, err = service.UpdateMemo(ctx, &v1pb.UpdateMemoRequest{
		Memo:       &v1pb.Memo{Name: memo.Name, Bookmark: &v1pb.Bookmark{Favorited: true}},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"bookmark.favorited"}},
	})
	require.Equal(t, codes.FailedPrecondition, status.Code(err))

	_, err = service.CreateMemoComment(ctx, &v1pb.CreateMemoCommentRequest{
		Name: memo.Name,
		Comment: &v1pb.Memo{
			Content:  "bookmark comment",
			Bookmark: &v1pb.Bookmark{Type: v1pb.Bookmark_TEXT},
		},
	})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}

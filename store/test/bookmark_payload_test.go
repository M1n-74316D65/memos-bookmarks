package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestBookmarkPayloadMigrationBackfillsLinkedMemos(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	defer ts.Close()
	owner, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	linked, err := ts.CreateMemo(ctx, &store.Memo{UID: "legacy-linked", CreatorID: owner.ID, Content: "linked", Visibility: store.Private, Pinned: true})
	require.NoError(t, err)
	plain, err := ts.CreateMemo(ctx, &store.Memo{UID: "legacy-plain", CreatorID: owner.ID, Content: "plain", Visibility: store.Private})
	require.NoError(t, err)
	missingSource, err := ts.CreateMemo(ctx, &store.Memo{UID: "legacy-missing-source", CreatorID: owner.ID, Content: "mailto:test@example.com", Visibility: store.Private})
	require.NoError(t, err)
	pinned := true
	require.NoError(t, ts.UpdateMemo(ctx, &store.UpdateMemo{
		ID:     linked.ID,
		Pinned: &pinned,
		Payload: &storepb.MemoPayload{
			Property: &storepb.MemoPayload_Property{HasLink: true},
			Links:    []*storepb.MemoPayload_LinkMetadata{{Url: "https://example.com/saved"}},
		},
	}))
	require.NoError(t, ts.UpdateMemo(ctx, &store.UpdateMemo{
		ID:      missingSource.ID,
		Payload: &storepb.MemoPayload{Property: &storepb.MemoPayload_Property{HasLink: true}},
	}))

	setting, err := ts.GetInstanceBasicSetting(ctx)
	require.NoError(t, err)
	setting.SchemaVersion = "0.31.7"
	_, err = ts.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{
		Key:   storepb.InstanceSettingKey_BASIC,
		Value: &storepb.InstanceSetting_BasicSetting{BasicSetting: setting},
	})
	require.NoError(t, err)
	require.NoError(t, ts.Migrate(ctx))

	linked, err = ts.GetMemo(ctx, &store.FindMemo{ID: &linked.ID})
	require.NoError(t, err)
	require.Equal(t, storepb.Bookmark_LINK, linked.Payload.Bookmark.Type)
	require.Equal(t, "https://example.com/saved", linked.Payload.Bookmark.SourceUrl)
	require.True(t, linked.Payload.Bookmark.Favorited)

	plain, err = ts.GetMemo(ctx, &store.FindMemo{ID: &plain.ID})
	require.NoError(t, err)
	require.Nil(t, plain.Payload.Bookmark)
	missingSource, err = ts.GetMemo(ctx, &store.FindMemo{ID: &missingSource.ID})
	require.NoError(t, err)
	require.Nil(t, missingSource.Payload.Bookmark)
}

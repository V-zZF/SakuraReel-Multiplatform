package tmdb

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDetailsSkipExtendedArchive(t *testing.T) {
	calls := []string{}
	fixture := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path+"?"+r.URL.RawQuery)
		json.NewEncoder(w).Encode(map[string]any{"id": 10, "title": "电影", "runtime": 112, "status": "Released", "videos": map[string]any{"results": []any{map[string]any{"name": "预告片", "site": "YouTube", "key": "trailer", "type": "Trailer"}}}})
	}))
	defer fixture.Close()
	c, _ := New(Options{Key: "test", APIBase: fixture.URL, ImageBase: fixture.URL + "/images", Language: "zh-CN"})
	out, err := c.Details(context.Background(), "movie", 10, nil)
	if err != nil || out.Metadata.Runtime != 112 || len(out.Metadata.Videos) != 1 {
		t.Fatalf("details/trailer missing: %+v %v", out, err)
	}
	if len(out.Metadata.Keywords)+len(out.Metadata.Aliases)+len(out.Metadata.Translations)+len(out.Metadata.ExternalIDs)+len(out.Metadata.Certifications) != 0 {
		t.Fatal("extended archive populated")
	}
	for _, call := range calls {
		for _, removed := range []string{"keywords", "alternative_titles", "translations", "external_ids", "release_dates", "content_ratings"} {
			if strings.Contains(call, removed) {
				t.Fatalf("removed archive requested: %s", call)
			}
		}
	}
}

func TestDefaultOptionsAndPersonalFailure(t *testing.T) {
	t.Setenv("TMDB_READ_TOKEN", "server.token.secret")
	t.Setenv("TMDB_API_KEY", "other")
	t.Setenv("TMDB_API_BASE", "https://api.themoviedb.org/3")
	t.Setenv("TMDB_IMAGE_BASE", "https://image.tmdb.org/t/p")
	o, err := Resolve(Options{CredentialMode: "server", Language: "ja-JP"})
	if err != nil || o.Key != "server.token.secret" || o.Language != "ja-JP" {
		t.Fatal("default resolution failed")
	}
	if _, err = Resolve(Options{CredentialMode: "server", ImageBase: "https://example.com"}); err == nil {
		t.Fatal("server secret allowed through browser image proxy")
	}
	personal, _ := Resolve(Options{CredentialMode: "personal", Key: "bad"})
	if personal.Key != "bad" {
		t.Fatal("personal key silently changed")
	}
}

func TestEpisodeArchivePreservesCreditsAndImages(t *testing.T) {
	var raw EpisodeData
	if err := json.Unmarshal([]byte(`{"id":42,"episode_number":3,"season_number":0,"name":"特别篇","overview":"单集简介","runtime":24,"air_date":"2026-01-01","still_path":"/still.png","vote_average":8.5,"vote_count":12,"production_code":"OVA-3","guest_stars":[{"id":5,"name":"演员","character":"角色","profile_path":"/actor.png"}],"crew":[{"id":6,"name":"导演","job":"Director","department":"Directing","profile_path":"/director.png"}]}`), &raw); err != nil {
		t.Fatal(err)
	}
	out := episodeMetadata(raw)
	if out.SeasonNumber != 0 || out.ID != 42 || out.Still != "/still.png" || out.VoteAverage != 8.5 || out.ProductionCode != "OVA-3" || len(out.GuestStars) != 1 || out.GuestStars[0].Role != "角色" || len(out.Crew) != 1 || out.Crew[0].Photo != "/director.png" {
		t.Fatalf("incomplete episode archive: %+v", out)
	}
}

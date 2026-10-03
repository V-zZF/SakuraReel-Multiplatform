package handler

import (
	"context"
	"fmt"
	"image"
	"image/png"
	"mal/internal/tmdb"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestImageDownloadBatchConcurrencyAndDeduplication(t *testing.T) {
	prior := postersDir
	SetPostersDir(t.TempDir())
	defer func() { postersDir = prior }()
	var calls, active, peak atomic.Int32
	firstWave := make(chan struct{})
	var release sync.Once
	fixture := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		n := active.Add(1)
		defer active.Add(-1)
		for old := peak.Load(); n > old; old = peak.Load() {
			if peak.CompareAndSwap(old, n) {
				break
			}
		}
		if n == imageDownloadConcurrency {
			release.Do(func() { close(firstWave) })
		}
		select {
		case <-firstWave:
		case <-r.Context().Done():
			return
		}
		_ = png.Encode(w, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	}))
	defer fixture.Close()
	client, err := tmdb.New(tmdb.Options{Key: "test", ImageBase: fixture.URL})
	if err != nil {
		t.Fatal(err)
	}
	batch := imageDownloadBatch{}
	names := make([]string, 18)
	for i := range 12 {
		batch.add(fmt.Sprintf("/image%d.png", i), "portrait", "cast", &names[i])
	}
	for i := range 6 {
		batch.add(fmt.Sprintf("/image%d.png", i), "portrait", "episodes", &names[12+i])
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	files, failures := batch.save(ctx, client)
	if len(failures) != 0 || len(files) != 12 || calls.Load() != 12 {
		t.Fatalf("downloads: files=%d calls=%d errors=%v", len(files), calls.Load(), failures)
	}
	if peak.Load() != imageDownloadConcurrency {
		t.Fatalf("expected %d concurrent requests, got %d", imageDownloadConcurrency, peak.Load())
	}
	for i := range 6 {
		if names[i] != names[12+i] {
			t.Fatal("shared image was not reused across metadata groups")
		}
	}
	for _, name := range names {
		if !localImageName(name) || name == "" {
			t.Fatalf("remote image was not replaced: %q", name)
		}
		if _, err := os.Stat(filepath.Join(postersDir, name)); err != nil {
			t.Fatal(err)
		}
	}
}

func TestImageDownloadBatchFailureAndCancellation(t *testing.T) {
	prior := postersDir
	SetPostersDir(t.TempDir())
	defer func() { postersDir = prior }()
	var calls atomic.Int32
	fixture := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer fixture.Close()
	client, err := tmdb.New(tmdb.Options{Key: "test", ImageBase: fixture.URL})
	if err != nil {
		t.Fatal(err)
	}
	batch := imageDownloadBatch{}
	var cast, episode string
	batch.add("/shared.png", "portrait", "cast", &cast)
	batch.add("/shared.png", "portrait", "episodes", &episode)
	files, failures := batch.save(context.Background(), client)
	if len(files) != 0 || len(failures) != 2 || calls.Load() != 1 {
		t.Fatalf("shared failure was not deduplicated and reported to each group: %v", failures)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	files, failures = batch.save(ctx, client)
	if len(files) != 0 || len(failures) != 2 || calls.Load() != 1 {
		t.Fatalf("cancelled batch fetched images or succeeded: %v", failures)
	}
}

// Compare the old serial loop with the batch under a fixed upstream latency.
func BenchmarkImageDownloads(b *testing.B) {
	prior := postersDir
	SetPostersDir(b.TempDir())
	defer func() { postersDir = prior }()
	fixture := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(10 * time.Millisecond)
		_ = png.Encode(w, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	}))
	defer fixture.Close()
	client, err := tmdb.New(tmdb.Options{Key: "test", ImageBase: fixture.URL})
	if err != nil {
		b.Fatal(err)
	}
	for _, parallel := range []bool{false, true} {
		label := "serial"
		if parallel {
			label = "parallel6"
		}
		b.Run(label, func(b *testing.B) {
			for b.Loop() {
				var files []string
				if parallel {
					batch := imageDownloadBatch{}
					names := make([]string, 12)
					for i := range names {
						batch.add(fmt.Sprintf("/image%d.png", i), "portrait", "cast", &names[i])
					}
					var failures map[string]string
					files, failures = batch.save(context.Background(), client)
					if len(failures) != 0 {
						b.Fatal(failures)
					}
				} else {
					for i := range 12 {
						name, err := downloadImage(context.Background(), client, fmt.Sprintf("/image%d.png", i), "portrait")
						if err != nil {
							b.Fatal(err)
						}
						files = append(files, name)
					}
				}
				for _, name := range files {
					_ = os.Remove(filepath.Join(postersDir, name))
				}
			}
		})
	}
}

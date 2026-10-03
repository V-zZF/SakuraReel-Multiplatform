package tmdb

import (
	"context"
	"encoding/json"
	"fmt"
	"mal/internal/model"
	"net/url"
	"sort"
	"strings"
)

// Archive resources are independent of the required details. Missing append results
// are retried individually so an unavailable translation or video never loses the work.
func (c *Client) archive(ctx context.Context, media string, id int64, result *Candidate, only ...string) {
	sections := []string{"videos"}
	if len(only) > 0 {
		requested := map[string]bool{}
		for _, key := range only {
			requested[key] = true
		}
		kept := []string{}
		for _, section := range sections {
			field := map[string]string{"alternative_titles": "aliases", "translations": "translations", "keywords": "keywords", "external_ids": "external_ids", "videos": "videos", "release_dates": "certifications", "content_ratings": "certifications"}[section]
			if requested[field] {
				kept = append(kept, section)
			}
		}
		sections = kept
	}
	if len(sections) == 0 {
		return
	}
	var appended map[string]json.RawMessage
	base := fmt.Sprintf("/%s/%d", media, id)
	_ = c.Get(ctx, base, url.Values{"append_to_response": {strings.Join(sections, ",")}}, &appended)
	labels := map[string]string{"alternative_titles": "别名", "translations": "翻译", "keywords": "关键词", "external_ids": "外部 ID", "videos": "预告片", "release_dates": "发行与分级", "content_ratings": "分级"}
	fields := map[string]string{"alternative_titles": "aliases", "translations": "translations", "keywords": "keywords", "external_ids": "external_ids", "videos": "videos", "release_dates": "certifications", "content_ratings": "certifications"}
	for _, section := range sections {
		raw := appended[section]
		if len(raw) == 0 || string(raw) == "null" {
			if err := c.Get(ctx, base+"/"+section, nil, &raw); err != nil {
				result.Warnings = append(result.Warnings, labels[section]+"未获取，可重试")
				result.FailedFields = append(result.FailedFields, fields[section])
				continue
			}
		}
		if err := decodeArchive(section, raw, &result.Metadata); err != nil {
			result.Warnings = append(result.Warnings, labels[section]+"资料格式无效，可重试")
			result.FailedFields = append(result.FailedFields, fields[section])
		}
	}
}
func decodeArchive(section string, raw json.RawMessage, m *model.Metadata) error {
	switch section {
	case "alternative_titles":
		var out struct {
			Titles []struct {
				Title  string `json:"title"`
				Region string `json:"iso_3166_1"`
				Type   string `json:"type"`
			} `json:"titles"`
			Results []struct {
				Title  string `json:"title"`
				Region string `json:"iso_3166_1"`
				Type   string `json:"type"`
			} `json:"results"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return err
		}
		for _, a := range append(out.Titles, out.Results...) {
			m.Aliases = append(m.Aliases, model.ArchiveItem{Name: a.Title, Region: a.Region, Value: a.Type})
		}
	case "translations":
		var out struct {
			Translations []struct {
				Name     string `json:"english_name"`
				Language string `json:"iso_639_1"`
				Region   string `json:"iso_3166_1"`
				Data     struct {
					Title    string `json:"title"`
					Name     string `json:"name"`
					Overview string `json:"overview"`
					Tagline  string `json:"tagline"`
				} `json:"data"`
			} `json:"translations"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return err
		}
		for _, a := range out.Translations {
			m.Translations = append(m.Translations, model.ArchiveItem{Name: a.Name, Region: a.Language + "-" + a.Region, Value: strings.TrimSpace(strings.Join([]string{a.Data.Title, a.Data.Name, a.Data.Tagline, a.Data.Overview}, "\n"))})
		}
	case "keywords":
		var out struct {
			Keywords []struct {
				Name string `json:"name"`
			} `json:"keywords"`
			Results []struct {
				Name string `json:"name"`
			} `json:"results"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return err
		}
		for _, a := range append(out.Keywords, out.Results...) {
			m.Keywords = append(m.Keywords, a.Name)
		}
	case "external_ids":
		var out map[string]any
		if err := json.Unmarshal(raw, &out); err != nil {
			return err
		}
		keys := []string{}
		for key := range out {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			value := out[key]
			if key != "id" && value != nil && value != "" && value != float64(0) {
				m.ExternalIDs = append(m.ExternalIDs, model.ArchiveItem{Name: key, Value: fmt.Sprint(value)})
			}
		}
	case "videos":
		var out struct {
			Results []struct {
				Name     string `json:"name"`
				Site     string `json:"site"`
				Key      string `json:"key"`
				Type     string `json:"type"`
				Language string `json:"iso_639_1"`
				Official bool   `json:"official"`
			} `json:"results"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return err
		}
		for _, a := range out.Results {
			m.Videos = append(m.Videos, model.Video{Name: a.Name, Site: a.Site, Key: a.Key, Type: a.Type, Language: a.Language, Official: a.Official})
		}
	case "content_ratings":
		var out struct {
			Results []struct {
				Region string `json:"iso_3166_1"`
				Rating string `json:"rating"`
			} `json:"results"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return err
		}
		for _, a := range out.Results {
			m.Certifications = append(m.Certifications, model.ArchiveItem{Name: "TV 分级", Region: a.Region, Value: a.Rating})
		}
	case "release_dates":
		var out struct {
			Results []struct {
				Region string `json:"iso_3166_1"`
				Dates  []struct {
					Certification string `json:"certification"`
					Date          string `json:"release_date"`
					Type          int    `json:"type"`
					Note          string `json:"note"`
				} `json:"release_dates"`
			} `json:"results"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return err
		}
		types := map[int]string{1: "首映", 2: "限定上映", 3: "影院上映", 4: "数字发行", 5: "实体发行", 6: "电视播出"}
		for _, r := range out.Results {
			for _, a := range r.Dates {
				m.Certifications = append(m.Certifications, model.ArchiveItem{Name: types[a.Type], Region: r.Region, Value: strings.TrimSpace(strings.Join([]string{a.Certification, a.Date, a.Note}, " · "))})
			}
		}
	}
	return nil
}

// Retry only requested archive fields and preserve every other candidate value.
func (c *Client) RetryArchive(ctx context.Context, media string, id int64, result *Candidate, fields []string) {
	labels := map[string]string{"aliases": "别名", "translations": "翻译", "keywords": "关键词", "external_ids": "外部 ID", "videos": "预告片", "certifications": "分级"}
	raw, _ := json.Marshal(result.Metadata)
	var data map[string]json.RawMessage
	_ = json.Unmarshal(raw, &data)
	for _, key := range fields {
		if labels[key] == "" {
			continue
		}
		delete(data, key)
		kept := result.FailedFields[:0]
		for _, failed := range result.FailedFields {
			if failed != key {
				kept = append(kept, failed)
			}
		}
		result.FailedFields = kept
		warnings := result.Warnings[:0]
		for _, warning := range result.Warnings {
			if !strings.Contains(warning, labels[key]) {
				warnings = append(warnings, warning)
			}
		}
		result.Warnings = warnings
	}
	raw, _ = json.Marshal(data)
	_ = json.Unmarshal(raw, &result.Metadata)
	// Unmarshal absent keys into a fresh struct to clear the requested lists.
	var clean model.Metadata
	_ = json.Unmarshal(raw, &clean)
	result.Metadata = clean
	c.archive(ctx, media, id, result, fields...)
}
func (c *Client) RefreshImages(ctx context.Context, media string, id int64, season *int, kind string, result *Candidate) error {
	path := fmt.Sprintf("/%s/%d", media, id)
	if kind == "poster" && season != nil {
		path += fmt.Sprintf("/season/%d", *season)
	}
	var w Work
	if err := c.Get(ctx, path, url.Values{"append_to_response": {"images"}, "include_image_language": {c.Language[:min(2, len(c.Language))] + ",en,ja,null"}}, &w); err != nil {
		return err
	}
	var list []Image
	switch kind {
	case "poster":
		list = append([]Image{{Path: w.PosterPath}}, w.Images.Posters...)
	case "backdrop":
		list = append([]Image{{Path: w.BackdropPath}}, w.Images.Backdrops...)
	case "logo":
		list = w.Images.Logos
	default:
		return fmt.Errorf("无效的图片类型")
	}
	result.Images[kind] = nil
	seen := map[string]bool{}
	for _, im := range list {
		if !ValidImagePath(im.Path) || seen[im.Path] {
			continue
		}
		seen[im.Path] = true
		size := "w500"
		if kind == "logo" {
			size = "original"
		}
		result.Images[kind] = append(result.Images[kind], ImageChoice{Path: im.Path, URL: c.ImageURL(im.Path, size)})
		if len(result.Images[kind]) >= 12 {
			break
		}
	}
	return nil
}

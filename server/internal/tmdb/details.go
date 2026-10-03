package tmdb

import (
	"context"
	"fmt"
	"mal/internal/model"
	"net/url"
	"sort"
	"strings"
	"sync"
)

type Work struct {
	OriginalLanguage string   `json:"original_language"`
	ID               int64    `json:"id"`
	Title            string   `json:"title"`
	Name             string   `json:"name"`
	OriginalTitle    string   `json:"original_title"`
	OriginalName     string   `json:"original_name"`
	Overview         string   `json:"overview"`
	ReleaseDate      string   `json:"release_date"`
	FirstAirDate     string   `json:"first_air_date"`
	AirDate          string   `json:"air_date"`
	PosterPath       string   `json:"poster_path"`
	BackdropPath     string   `json:"backdrop_path"`
	OriginCountry    []string `json:"origin_country"`
	GenreIDs         []int    `json:"genre_ids"`
	Genres           []struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	} `json:"genres"`
	Status      string  `json:"status"`
	Tagline     string  `json:"tagline"`
	LastAirDate string  `json:"last_air_date"`
	SeasonCount int     `json:"number_of_seasons"`
	VoteAverage float64 `json:"vote_average"`
	VoteCount   int     `json:"vote_count"`
	Budget      int64   `json:"budget"`
	Revenue     int64   `json:"revenue"`
	Homepage    string  `json:"homepage"`
	Collection  *struct {
		Name string `json:"name"`
	} `json:"belongs_to_collection"`
	Countries []struct {
		Name string `json:"name"`
		Code string `json:"iso_3166_1"`
	} `json:"production_countries"`
	Languages []struct {
		Name        string `json:"name"`
		EnglishName string `json:"english_name"`
	} `json:"spoken_languages"`
	Networks []struct {
		Name string `json:"name"`
	} `json:"networks"`
	Creators []struct {
		ID    int64  `json:"id"`
		Name  string `json:"name"`
		Photo string `json:"profile_path"`
	} `json:"created_by"`
	Runtime        int   `json:"runtime"`
	EpisodeRuntime []int `json:"episode_run_time"`
	EpisodeCount   int   `json:"number_of_episodes"`
	SeasonNumber   int   `json:"season_number"`
	Seasons        []struct {
		SeasonNumber int    `json:"season_number"`
		Name         string `json:"name"`
		Overview     string `json:"overview"`
		AirDate      string `json:"air_date"`
		EpisodeCount int    `json:"episode_count"`
	} `json:"seasons"`
	Episodes  []EpisodeData `json:"episodes"`
	Companies []struct {
		Name string `json:"name"`
	} `json:"production_companies"`
	Credits struct {
		Cast []CreditPerson `json:"cast"`
		Crew []CreditPerson `json:"crew"`
	} `json:"credits"`
	Images struct {
		Posters   []Image `json:"posters"`
		Backdrops []Image `json:"backdrops"`
		Logos     []Image `json:"logos"`
	} `json:"images"`
}
type CreditPerson struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Character  string `json:"character"`
	Job        string `json:"job"`
	Photo      string `json:"profile_path"`
	Department string `json:"department"`
}
type EpisodeData struct {
	ID             int64          `json:"id"`
	EpisodeNumber  int            `json:"episode_number"`
	SeasonNumber   int            `json:"season_number"`
	Name           string         `json:"name"`
	Overview       string         `json:"overview"`
	AirDate        string         `json:"air_date"`
	Runtime        int            `json:"runtime"`
	Still          string         `json:"still_path"`
	VoteAverage    float64        `json:"vote_average"`
	VoteCount      int            `json:"vote_count"`
	ProductionCode string         `json:"production_code"`
	GuestStars     []CreditPerson `json:"guest_stars"`
	Crew           []CreditPerson `json:"crew"`
}

func episodeMetadata(e EpisodeData) model.Episode {
	out := model.Episode{ID: e.ID, SeasonNumber: e.SeasonNumber, Number: e.EpisodeNumber, Name: e.Name, Overview: e.Overview, AirDate: e.AirDate, Runtime: e.Runtime, Still: e.Still, VoteAverage: e.VoteAverage, VoteCount: e.VoteCount, ProductionCode: e.ProductionCode}
	for _, p := range e.GuestStars {
		out.GuestStars = append(out.GuestStars, model.Person{ID: p.ID, Name: p.Name, Role: p.Character, Photo: p.Photo})
	}
	for _, p := range e.Crew {
		out.Crew = append(out.Crew, model.Person{ID: p.ID, Name: p.Name, Role: p.Job, Photo: p.Photo, Department: p.Department})
	}
	return out
}

type Image struct {
	Path     string `json:"file_path"`
	Language string `json:"iso_639_1"`
	Width    int    `json:"width"`
}
type ImageChoice struct {
	Path string `json:"path"`
	URL  string `json:"url"`
}
type Candidate struct {
	Title        string                   `json:"title"`
	Metadata     model.Metadata           `json:"metadata"`
	Images       map[string][]ImageChoice `json:"images"`
	Warnings     []string                 `json:"warnings"`
	FailedFields []string                 `json:"failed_fields"`
}

func (w Work) DisplayTitle() string {
	if w.Title != "" {
		return w.Title
	}
	return w.Name
}
func (w Work) Date() string {
	if w.ReleaseDate != "" {
		return w.ReleaseDate
	}
	return w.FirstAirDate
}
func (w Work) IsAnime() bool {
	animation := false
	for _, g := range w.GenreIDs {
		if g == 16 {
			animation = true
		}
	}
	for _, g := range w.Genres {
		if g.ID == 16 {
			animation = true
		}
	}
	for _, country := range w.OriginCountry {
		if country == "JP" && animation {
			return true
		}
	}
	return false
}
func (c *Client) Details(ctx context.Context, media string, id int64, season *int) (Candidate, error) {
	var w Work
	params := url.Values{"append_to_response": {"credits,images"}, "include_image_language": {c.Language[:min(2, len(c.Language))] + ",en,ja,null"}}
	initialWarnings := []string{}
	failed := []string{}
	if err := c.Get(ctx, fmt.Sprintf("/%s/%d", media, id), params, &w); err != nil {
		if basicErr := c.Get(ctx, fmt.Sprintf("/%s/%d", media, id), nil, &w); basicErr != nil {
			return Candidate{}, basicErr
		}
		var credits struct {
			Cast []CreditPerson `json:"cast"`
			Crew []CreditPerson `json:"crew"`
		}
		if e := c.Get(ctx, fmt.Sprintf("/%s/%d/credits", media, id), nil, &credits); e != nil {
			initialWarnings = append(initialWarnings, "演职员资料未获取，可重试")
			failed = append(failed, "cast", "crew")
		} else {
			w.Credits.Cast = credits.Cast
			w.Credits.Crew = credits.Crew
		}
		if e := c.Get(ctx, fmt.Sprintf("/%s/%d/images", media, id), nil, &w.Images); e != nil {
			initialWarnings = append(initialWarnings, "图片候选未完整获取，可重试")
		}
	}
	c.fillMissing(ctx, fmt.Sprintf("/%s/%d", media, id), &w, w.OriginalLanguage)

	m := model.Metadata{TMDbID: id, MediaType: media, SeasonNumber: season, Language: c.Language, Overview: w.Overview, ReleaseDate: w.Date(), OriginalTitle: w.OriginalTitle, Runtime: w.Runtime, EpisodeCount: w.EpisodeCount}
	m.Status, m.Tagline, m.OriginalLanguage, m.LastAirDate = w.Status, w.Tagline, w.OriginalLanguage, w.LastAirDate
	m.SeasonCount, m.VoteAverage, m.VoteCount, m.Budget, m.Revenue, m.Homepage = w.SeasonCount, w.VoteAverage, w.VoteCount, w.Budget, w.Revenue, w.Homepage
	if w.Collection != nil {
		m.Collection = w.Collection.Name
	}
	for _, g := range w.Genres {
		if g.Name != "" {
			m.Genres = append(m.Genres, g.Name)
		}
	}
	for _, g := range w.Countries {
		m.Countries = append(m.Countries, g.Name)
	}
	if len(m.Countries) == 0 {
		m.Countries = w.OriginCountry
	}
	for _, g := range w.Languages {
		name := g.Name
		if name == "" {
			name = g.EnglishName
		}
		m.SpokenLanguages = append(m.SpokenLanguages, name)
	}
	for _, g := range w.Networks {
		m.Networks = append(m.Networks, g.Name)
	}
	for _, p := range w.Creators {
		m.Creators = append(m.Creators, model.Person{ID: p.ID, Name: p.Name, Role: "创作者", Photo: p.Photo})
	}
	if m.OriginalTitle == "" {
		m.OriginalTitle = w.OriginalName
	}
	if len(w.EpisodeRuntime) > 0 {
		m.EpisodeRuntime = w.EpisodeRuntime[0]
	}
	for _, company := range w.Companies {
		m.Companies = append(m.Companies, company.Name)
	}
	for _, p := range w.Credits.Cast {
		m.Cast = append(m.Cast, model.Person{ID: p.ID, Name: p.Name, Role: p.Character, Photo: p.Photo})
	}
	for _, p := range w.Credits.Crew {
		m.Crew = append(m.Crew, model.Person{ID: p.ID, Name: p.Name, Role: p.Job, Photo: p.Photo, Department: p.Department})
	}
	result := Candidate{Title: w.DisplayTitle(), Metadata: m, Images: map[string][]ImageChoice{}, Warnings: initialWarnings, FailedFields: failed}
	imageSets := map[string][]Image{"poster": w.Images.Posters, "backdrop": w.Images.Backdrops, "logo": w.Images.Logos}
	imageSets["poster"] = append([]Image{{Path: w.PosterPath}}, imageSets["poster"]...)
	imageSets["backdrop"] = append([]Image{{Path: w.BackdropPath}}, imageSets["backdrop"]...)
	if media == "tv" {
		result.Metadata.Runtime = 0
		for _, s := range w.Seasons {
			result.Metadata.Seasons = append(result.Metadata.Seasons, model.Season{Number: s.SeasonNumber, Name: s.Name, Overview: s.Overview, AirDate: s.AirDate, EpisodeCount: s.EpisodeCount})
		}
		if season == nil {
			if len(w.Seasons) > 0 {
				result.Metadata.EpisodeCount = 0
				for _, s := range w.Seasons {
					if s.SeasonNumber > 0 {
						result.Metadata.EpisodeCount += s.EpisodeCount
					}
				}
			}
			var mu sync.Mutex
			var wg sync.WaitGroup
			slots := make(chan struct{}, 4)
			for _, ss := range w.Seasons {
				ss := ss
				wg.Add(1)
				go func() {
					defer wg.Done()
					select {
					case slots <- struct{}{}:
					case <-ctx.Done():
						mu.Lock()
						result.Warnings = append(result.Warnings, fmt.Sprintf("第 %d 季单集摘要获取超时，可重新获取", ss.SeasonNumber))
						mu.Unlock()
						return
					}
					defer func() { <-slots }()
					var sw Work
					err := c.Get(ctx, fmt.Sprintf("/tv/%d/season/%d", id, ss.SeasonNumber), nil, &sw)
					if err == nil {
						c.fillMissing(ctx, fmt.Sprintf("/tv/%d/season/%d", id, ss.SeasonNumber), &sw, w.OriginalLanguage)
					}
					mu.Lock()
					defer mu.Unlock()
					if err != nil {
						result.Warnings = append(result.Warnings, fmt.Sprintf("第 %d 季单集摘要未获取：%s", ss.SeasonNumber, err))
						return
					}
					for _, e := range sw.Episodes {
						result.Metadata.Episodes = append(result.Metadata.Episodes, episodeMetadata(e))
					}
				}()
			}
			wg.Wait()
			sort.Slice(result.Metadata.Episodes, func(i, j int) bool {
				a, b := result.Metadata.Episodes[i], result.Metadata.Episodes[j]
				if a.SeasonNumber != b.SeasonNumber {
					return a.SeasonNumber < b.SeasonNumber
				}
				return a.Number < b.Number
			})
		}
		if season != nil {
			var sw Work
			if err := c.Get(ctx, fmt.Sprintf("/tv/%d/season/%d", id, *season), params, &sw); err != nil {
				return Candidate{}, err
			}
			c.fillMissing(ctx, fmt.Sprintf("/tv/%d/season/%d", id, *season), &sw, w.OriginalLanguage)

			result.Metadata.SeasonName = sw.Name
			if result.Metadata.SeasonName == "" {
				if *season == 0 {
					result.Metadata.SeasonName = "特别篇"
				} else {
					result.Metadata.SeasonName = fmt.Sprintf("第 %d 季", *season)
				}
			}
			result.Title += " · " + result.Metadata.SeasonName
			if sw.Name == "" {
				result.Title = fmt.Sprintf("%s · 第 %d 季", w.DisplayTitle(), *season)
			}
			result.Metadata.Overview = sw.Overview
			result.Metadata.ReleaseDate = sw.AirDate
			result.Metadata.EpisodeCount = len(sw.Episodes)
			result.Metadata.Seasons = nil
			result.Metadata.Seasons = append(result.Metadata.Seasons, model.Season{Number: *season, Name: sw.Name, Overview: sw.Overview, AirDate: sw.AirDate, EpisodeCount: len(sw.Episodes)})
			for _, e := range sw.Episodes {
				result.Metadata.Episodes = append(result.Metadata.Episodes, episodeMetadata(e))
			}
			imageSets["poster"] = append([]Image{{Path: sw.PosterPath}}, sw.Images.Posters...)
			if sw.PosterPath == "" {
				imageSets["poster"] = w.Images.Posters
			}
			if len(sw.Credits.Cast) > 0 {
				result.Metadata.Cast = nil
				for _, p := range sw.Credits.Cast {
					result.Metadata.Cast = append(result.Metadata.Cast, model.Person{ID: p.ID, Name: p.Name, Role: p.Character, Photo: p.Photo})
				}
			}
		}
	}
	for kind, images := range imageSets {
		if kind == "logo" {
			sort.SliceStable(images, func(i, j int) bool {
				return images[i].Language == c.Language[:min(2, len(c.Language))] && images[j].Language != images[i].Language
			})
		}
		seen := map[string]bool{}
		for _, img := range images {
			if !ValidImagePath(img.Path) || seen[img.Path] {
				continue
			}
			seen[img.Path] = true
			size := "w500"
			if kind == "logo" {
				size = "original"
			}
			result.Images[kind] = append(result.Images[kind], ImageChoice{img.Path, c.ImageURL(img.Path, size)})
			if len(result.Images[kind]) >= 12 {
				break
			}
		}
	}
	for _, warning := range result.Warnings {
		if strings.Contains(warning, "单集") {
			result.FailedFields = append(result.FailedFields, "episodes")
			break
		}
	}
	c.archive(ctx, media, id, &result)
	return result, nil
}

// Preserve localized values and fill text gaps with the original language.
func (c *Client) fillMissing(ctx context.Context, path string, w *Work, language string) {
	missing := w.Overview == ""
	for _, e := range w.Episodes {
		if e.Overview == "" {
			missing = true
			break
		}
	}
	for _, s := range w.Seasons {
		if s.Overview == "" {
			missing = true
			break
		}
	}
	if !missing {
		return
	}
	if language == "" {
		language = "en-US"
	}
	if language == c.Language {
		return
	}
	fallback := *c
	fallback.Language = language
	var original Work
	if fallback.Get(ctx, path, nil, &original) != nil {
		return
	}
	if w.Overview == "" {
		w.Overview = original.Overview
	}
	if w.DisplayTitle() == "" {
		w.Title = original.Title
		w.Name = original.Name
	}
	for i, s := range w.Seasons {
		if s.Overview == "" {
			for _, o := range original.Seasons {
				if s.SeasonNumber == o.SeasonNumber {
					w.Seasons[i].Overview = o.Overview
					break
				}
			}
		}
	}
	for i, e := range w.Episodes {
		for _, o := range original.Episodes {
			if e.EpisodeNumber == o.EpisodeNumber {
				if e.Overview == "" {
					w.Episodes[i].Overview = o.Overview
				}
				if e.Name == "" {
					w.Episodes[i].Name = o.Name
				}
				break
			}
		}
	}
}

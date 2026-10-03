package model

import "encoding/json"

// Metadata is independent of personal ratings, notes, watch dates and ordering.
type Metadata struct {
	SeasonName       string        `json:"season_name,omitempty"`
	Genres           []string      `json:"genres,omitempty"`
	Status           string        `json:"status,omitempty"`
	Tagline          string        `json:"tagline,omitempty"`
	OriginalLanguage string        `json:"original_language,omitempty"`
	Countries        []string      `json:"countries,omitempty"`
	SpokenLanguages  []string      `json:"spoken_languages,omitempty"`
	LastAirDate      string        `json:"last_air_date,omitempty"`
	SeasonCount      int           `json:"season_count,omitempty"`
	VoteAverage      float64       `json:"vote_average,omitempty"`
	VoteCount        int           `json:"vote_count,omitempty"`
	Budget           int64         `json:"budget,omitempty"`
	Revenue          int64         `json:"revenue,omitempty"`
	Collection       string        `json:"collection,omitempty"`
	Networks         []string      `json:"networks,omitempty"`
	Creators         []Person      `json:"creators,omitempty"`
	Homepage         string        `json:"homepage,omitempty"`
	Keywords         []string      `json:"keywords,omitempty"`
	Aliases          []ArchiveItem `json:"aliases,omitempty"`
	Translations     []ArchiveItem `json:"translations,omitempty"`
	Certifications   []ArchiveItem `json:"certifications,omitempty"`
	ExternalIDs      []ArchiveItem `json:"external_ids,omitempty"`
	Videos           []Video       `json:"videos,omitempty"`

	TMDbID         int64     `json:"tmdb_id"`
	MediaType      string    `json:"media_type"`
	SeasonNumber   *int      `json:"season_number"`
	Language       string    `json:"language"`
	Overview       string    `json:"overview"`
	ReleaseDate    string    `json:"release_date"`
	OriginalTitle  string    `json:"original_title"`
	Companies      []string  `json:"companies"`
	Cast           []Person  `json:"cast"`
	Crew           []Person  `json:"crew"`
	Seasons        []Season  `json:"seasons"`
	Episodes       []Episode `json:"episodes"`
	Runtime        int       `json:"runtime"`
	EpisodeCount   int       `json:"episode_count"`
	EpisodeRuntime int       `json:"episode_runtime"`
	Backdrop       string    `json:"backdrop"`
	Logo           string    `json:"logo"`
}
type ArchiveItem struct {
	Name   string `json:"name"`
	Region string `json:"region,omitempty"`
	Value  string `json:"value"`
}
type Video struct {
	Name     string `json:"name"`
	Site     string `json:"site"`
	Key      string `json:"key"`
	Type     string `json:"type"`
	Language string `json:"language,omitempty"`
	Official bool   `json:"official,omitempty"`
}
type Person struct {
	Photo      string `json:"photo,omitempty"`
	Department string `json:"department,omitempty"`

	ID   int64  `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}
type Season struct {
	Number       int    `json:"number"`
	Name         string `json:"name"`
	Overview     string `json:"overview"`
	AirDate      string `json:"air_date"`
	EpisodeCount int    `json:"episode_count"`
}
type Episode struct {
	ID             int64    `json:"id,omitempty"`
	Still          string   `json:"still,omitempty"`
	VoteAverage    float64  `json:"vote_average,omitempty"`
	VoteCount      int      `json:"vote_count,omitempty"`
	ProductionCode string   `json:"production_code,omitempty"`
	GuestStars     []Person `json:"guest_stars,omitempty"`
	Crew           []Person `json:"crew,omitempty"`

	SeasonNumber int    `json:"season_number"`
	Number       int    `json:"number"`
	Name         string `json:"name"`
	Overview     string `json:"overview"`
	AirDate      string `json:"air_date"`
	Runtime      int    `json:"runtime"`
}

func EncodeMetadata(m *Metadata) string {
	if m == nil {
		return "null"
	}
	b, _ := json.Marshal(m)
	return string(b)
}

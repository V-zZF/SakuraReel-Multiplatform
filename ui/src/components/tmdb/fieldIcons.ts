export function fieldIcon(key: string) {
  if (["cast", "crew", "creators"].includes(key)) return "person";
  if (key.includes("date")) return "calendar";
  if (["vote_average", "vote_count"].includes(key)) return "star";
  if (["runtime", "episode_runtime"].includes(key)) return "clock";
  if (
    [
      "genres",
      "seasons",
      "episodes",
      "season_name",
      "season_count",
      "episode_count",
      "collection",
    ].includes(key)
  )
    return "layers";
  if (
    [
      "original_language",
      "spoken_languages",
      "countries",
      "translations",
    ].includes(key)
  )
    return "globe";
  if (["homepage", "external_ids"].includes(key)) return "link";
  if (["budget", "revenue"].includes(key)) return "money";
  if (key === "videos") return "film";
  if (["companies", "networks"].includes(key)) return "layers";
  if (key === "overview") return "note";
  if (key === "status") return "info";
  return "text";
}

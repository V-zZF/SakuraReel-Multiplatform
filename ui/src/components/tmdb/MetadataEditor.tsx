import { useState } from "react";
import type { Anime } from "../../types";
import {
  fieldLabels,
  fieldGroups,
  listFields,
  numberFields,
  formatValue,
  webRequest,
} from "../../data/tmdb";
import { data, posterUrl } from "../../data";
import Icon from "./Icon";
import { fieldIcon } from "./fieldIcons";
import Surface, { UnsavedDialog } from "./Surface";
import { useUnsaved } from "./useUnsaved";
export default function MetadataEditor({
  anime,
  onClose,
  onSaved,
}: {
  anime: Anime;
  onClose: () => void;
  onSaved: (a: Anime) => void;
}) {
  const [title, setTitle] = useState(anime.title);
  const [poster, setPoster] = useState(anime.poster);
  const [backdrop, setBackdrop] = useState(anime.metadata?.backdrop || "");
  const [logo, setLogo] = useState(anime.metadata?.logo || "");
  const initial = Object.fromEntries(
    Object.keys(fieldLabels)
      .filter((k) => k !== "title" && k !== "external_ids")
      .map((key) => {
        const value =
          anime.metadata?.[key as keyof NonNullable<Anime["metadata"]>];
        return [
          key,
          Array.isArray(value) || listFields.includes(key)
            ? JSON.stringify(value || [], null, 2)
            : String(value ?? ""),
        ];
      }),
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    title !== anime.title ||
    poster !== anime.poster ||
    backdrop !== (anime.metadata?.backdrop || "") ||
    logo !== (anime.metadata?.logo || "") ||
    JSON.stringify(values) !== JSON.stringify(initial);
  const { confirm, setConfirm, requestClose } = useUnsaved(
    dirty,
    busy,
    onClose,
  );
  async function upload(
    file: File | undefined,
    setter: (name: string) => void,
  ) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setter(await data.uploadPoster(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const fields: Record<string, unknown> = { backdrop, logo };
      for (const [key, value] of Object.entries(values)) {
        if (listFields.includes(key)) fields[key] = JSON.parse(value || "[]");
        else if (numberFields.includes(key)) {
          const n = Number(value || 0);
          if (
            !Number.isFinite(n) ||
            (key !== "vote_average" && !Number.isInteger(n)) ||
            n < 0
          )
            throw new Error(`${fieldLabels[key]}须为非负整数`);
          fields[key] = n;
        } else fields[key] = value;
      }
      const saved = await webRequest<Anime>(
        `/anime/${anime.id}/metadata`,
        { title, poster, fields, expected_rev: anime.server_rev },
        "PUT",
      );
      onSaved(saved);
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "列表资料格式无效，请检查填写内容"
          : e instanceof Error
            ? e.message
            : "保存失败",
      );
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Surface
        title="编辑作品资料"
        onClose={requestClose}
        footer={
          <div className="tmdb-editor-actions">
            <button disabled={busy} onClick={requestClose}>
              <Icon name="close" />
              取消
            </button>
            <button
              className="tmdb-primary"
              disabled={busy || !title.trim()}
              onClick={() => void save()}
            >
              <Icon name={busy ? "retry" : "check"} />
              {busy ? "保存中…" : "保存作品资料"}
            </button>
          </div>
        }
      >
        <fieldset disabled={busy} className="tmdb-body tmdb-form">
          <div className="tmdb-card">
            <p className="tmdb-info">
              作品资料独立保存，不修改个人评分、短评或观看记录。
            </p>
            {anime.metadata?.tmdb_id && (
              <details className="tmdb-expand">
                <summary>只读来源信息</summary>
                <p>
                  TMDb ID：{anime.metadata.tmdb_id} ·{" "}
                  {anime.metadata.media_type} ·{" "}
                  {anime.metadata.season_number === null
                    ? "整剧／电影"
                    : `季号 ${anime.metadata.season_number}`}
                </p>
                <p>{formatValue(anime.metadata.external_ids)}</p>
              </details>
            )}
            {error && (
              <p className="tmdb-error" role="alert">
                {error}
              </p>
            )}
            <label>
              <span className="tmdb-label-title">
                <Icon name="text" />
                片名
              </span>
              <input
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="tmdb-edit-grid">
              {[
                ["poster", "海报", poster, setPoster],
                ["backdrop", "背景图", backdrop, setBackdrop],
                ["logo", "Logo", logo, setLogo],
              ].map(([key, label, filename, setter]) => (
                <label key={key as string} className="tmdb-editor-image-card">
                  <span className="tmdb-label-title">
                    <Icon name="image" />
                    {label as string}
                  </span>
                  {filename && (
                    <img
                      src={posterUrl(filename as string)}
                      alt={label as string}
                      style={{ height: 100, objectFit: "contain" }}
                    />
                  )}
                  <span className="tmdb-upload-action">
                    <Icon name="upload" />
                    {filename ? "替换图片" : "选择图片"}
                  </span>
                  <input
                    className="tmdb-upload-input"
                    aria-label={`上传${label}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={busy}
                    onChange={(e) =>
                      void upload(
                        e.target.files?.[0],
                        setter as (s: string) => void,
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => (setter as (s: string) => void)("")}
                    disabled={busy}
                  >
                    <Icon name="trash" />
                    移除{label as string}
                  </button>
                </label>
              ))}
            </div>
          </div>
          {fieldGroups.map((group) => (
            <section className="tmdb-editor-group" key={group.name}>
              <h3 className="tmdb-section-heading">
                <Icon
                  name={
                    group.name === "演职员与制作"
                      ? "person"
                      : group.name === "季度与单集"
                        ? "layers"
                        : "text"
                  }
                />
                {group.name}
              </h3>
              <div className="tmdb-card">
                {group.keys
                  .filter((key) => key in values)
                  .map((key) => {
                    const value = values[key];
                    return listFields.includes(key) ? (
                      <div className="tmdb-edit-field" key={key}>
                        <span className="tmdb-label-title">
                          <Icon name={fieldIcon(key)} />
                          {fieldLabels[key]}
                        </span>
                        <StructuredList
                          kind={key}
                          value={value}
                          onChange={(v) => setValues({ ...values, [key]: v })}
                        />
                      </div>
                    ) : (
                      <label key={key}>
                        <span className="tmdb-label-title">
                          <Icon name={fieldIcon(key)} />
                          {fieldLabels[key]}
                        </span>
                        {key === "overview" ? (
                          <textarea
                            aria-label={fieldLabels[key]}
                            value={value}
                            onChange={(e) =>
                              setValues({ ...values, [key]: e.target.value })
                            }
                          />
                        ) : (
                          <input
                            aria-label={fieldLabels[key]}
                            step={key === "vote_average" ? "0.1" : undefined}
                            type={
                              key.endsWith("_date")
                                ? "date"
                                : numberFields.includes(key)
                                  ? "number"
                                  : "text"
                            }
                            min={0}
                            value={value}
                            onChange={(e) =>
                              setValues({ ...values, [key]: e.target.value })
                            }
                          />
                        )}
                      </label>
                    );
                  })}
              </div>
            </section>
          ))}
        </fieldset>
      </Surface>
      {confirm && (
        <UnsavedDialog
          busy={busy}
          onContinue={() => setConfirm(false)}
          onDiscard={onClose}
          onSave={() => void save()}
        />
      )}
    </>
  );
}
// Form controls keep the persisted structured lists editable without exposing JSON.
function StructuredList({
  kind,
  value,
  onChange,
}: {
  kind: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const rows = JSON.parse(value || "[]") as (
    | string
    | Record<string, string | number>
  )[];
  const stringLists = [
    "companies",
    "genres",
    "spoken_languages",
    "countries",
    "networks",
    "keywords",
  ];
  const layouts: Record<string, [string, string, string][]> = {
    creators: [
      ["name", "姓名", "text"],
      ["role", "职务", "text"],
    ],
    aliases: [
      ["name", "别名", "text"],
      ["region", "国家／地区", "text"],
      ["value", "别名类型", "text"],
    ],
    translations: [
      ["name", "语言名称", "text"],
      ["region", "语言／地区", "text"],
      ["value", "翻译内容", "textarea"],
    ],
    certifications: [
      ["name", "发行类型／分级", "text"],
      ["region", "国家／地区", "text"],
      ["value", "分级与发行资料", "textarea"],
    ],
    videos: [
      ["name", "视频名称", "text"],
      ["site", "平台（YouTube／Vimeo）", "text"],
      ["key", "视频 ID", "text"],
      ["type", "视频类型", "text"],
      ["language", "语言", "text"],
    ],

    cast: [
      ["name", "姓名", "text"],
      ["role", "角色", "text"],
    ],
    crew: [
      ["name", "姓名", "text"],
      ["role", "职务", "text"],
    ],
    seasons: [
      ["number", "季号（特别篇为 0）", "number"],
      ["name", "季名称", "text"],
      ["air_date", "首播日期", "date"],
      ["episode_count", "集数", "number"],
      ["overview", "摘要", "textarea"],
    ],
    episodes: [
      ["season_number", "季号", "number"],
      ["number", "集号", "number"],
      ["name", "集名称", "text"],
      ["air_date", "播出日期", "date"],
      ["runtime", "时长（分钟）", "number"],
      ["overview", "摘要", "textarea"],
    ],
  };
  function update(index: number, key: string, val: string | number) {
    const next = [...rows];
    next[index] =
      key === "item"
        ? String(val)
        : { ...(rows[index] as Record<string, string | number>), [key]: val };
    onChange(JSON.stringify(next));
  }
  return (
    <div>
      {rows.map((row, i) => (
        <details key={i} className="tmdb-list-row">
          <summary>
            {typeof row === "string"
              ? row || fieldLabels[kind]
              : row.name || `第 ${i + 1} 项`}
          </summary>
          {stringLists.includes(kind) ? (
            <input
              aria-label={fieldLabels[kind]}
              value={String(row)}
              onChange={(e) => update(i, "item", e.target.value)}
            />
          ) : (
            layouts[kind].map(([key, label, type]) => (
              <div className="tmdb-list-field" key={key}>
                <span>{label}</span>
                {type === "textarea" ? (
                  <textarea
                    aria-label={label}
                    value={(row as Record<string, string | number>)[key] || ""}
                    onChange={(e) => update(i, key, e.target.value)}
                  />
                ) : (
                  <input
                    aria-label={label}
                    type={type}
                    min={0}
                    value={(row as Record<string, string | number>)[key] ?? ""}
                    onChange={(e) =>
                      update(
                        i,
                        key,
                        type === "number"
                          ? Number(e.target.value)
                          : e.target.value,
                      )
                    }
                  />
                )}
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() =>
              onChange(JSON.stringify(rows.filter((_, n) => n !== i)))
            }
          >
            <Icon name="trash" />
            删除此项
          </button>
        </details>
      ))}
      <button
        type="button"
        onClick={() => {
          const item = stringLists.includes(kind)
            ? ""
            : Object.fromEntries(
                layouts[kind].map(([key, , type]) => [
                  key,
                  type === "number" ? 0 : "",
                ]),
              );
          onChange(JSON.stringify([...rows, item]));
        }}
      >
        <Icon name="plus" />
        添加{stringLists.includes(kind) ? fieldLabels[kind] : "一项"}
      </button>
    </div>
  );
}

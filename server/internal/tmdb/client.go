package tmdb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const APIBase = "https://api.themoviedb.org/3"
const ImageBase = "https://image.tmdb.org/t/p"

type Options struct {
	CredentialMode string `json:"credential_mode,omitempty"`
	Key            string `json:"key"`
	APIBase        string `json:"api_base"`
	ImageBase      string `json:"image_base"`
	Language       string `json:"language"`
}
type Client struct {
	Options
	HTTP *http.Client
}

// Resolve browser options before creating a client. Server secrets never follow browser proxies.
func DefaultAvailable() bool {
	return strings.TrimSpace(os.Getenv("TMDB_READ_TOKEN")) != "" || strings.TrimSpace(os.Getenv("TMDB_API_KEY")) != ""
}
func Resolve(o Options) (Options, error) {
	switch o.CredentialMode {
	case "", "personal":
		return o, nil
	case "server":
		if o.APIBase != "" || o.ImageBase != "" {
			return o, errors.New("默认 API 不支持自定义代理，请使用个人 Key")
		}
		o.Key = strings.TrimSpace(os.Getenv("TMDB_READ_TOKEN"))
		if o.Key == "" {
			o.Key = strings.TrimSpace(os.Getenv("TMDB_API_KEY"))
		}
		if o.Key == "" {
			return o, errors.New("服务端尚未配置默认 API，请填写个人 Key")
		}
		o.APIBase = os.Getenv("TMDB_API_BASE")
		o.ImageBase = os.Getenv("TMDB_IMAGE_BASE")
		// Resolved preview options are already trusted; do not resolve them a second time.
		o.CredentialMode = ""
		return o, nil
	default:
		return o, errors.New("无效的凭据使用方式")
	}
}
func New(o Options) (*Client, error) {
	o.Key = strings.TrimSpace(o.Key)
	if o.Key == "" {
		return nil, errors.New("请先在 API 设置中填写个人 Key")
	}
	if o.APIBase == "" {
		o.APIBase = APIBase
	}
	if o.ImageBase == "" {
		o.ImageBase = ImageBase
	}
	if o.Language == "" {
		o.Language = "zh-CN"
	}
	for _, base := range []string{o.APIBase, o.ImageBase} {
		u, err := url.Parse(base)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return nil, errors.New("代理地址须为完整的 http(s) 基础地址，不含查询参数或账号")
		}
	}
	o.APIBase = strings.TrimRight(o.APIBase, "/")
	o.ImageBase = strings.TrimRight(o.ImageBase, "/")
	return &Client{o, &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (c *Client) Get(ctx context.Context, path string, params url.Values, out any) error {
	if params == nil {
		params = url.Values{}
	}
	params.Set("language", c.Language)
	if !strings.Contains(c.Key, ".") {
		params.Set("api_key", c.Key)
	}
	req, err := http.NewRequestWithContext(ctx, "GET", c.APIBase+path+"?"+params.Encode(), nil)
	if err != nil {
		return errors.New("请求地址无效")
	}
	if strings.Contains(c.Key, ".") {
		req.Header.Set("Authorization", "Bearer "+c.Key)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return errors.New("TMDb 连接失败或超时，请检查网络与代理设置后重试")
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case 401, 403:
		return errors.New("TMDb Key 无效或没有访问权限")
	case 429:
		return errors.New("TMDb 请求过于频繁，请稍后重试")
	case 404:
		return errors.New("TMDb 未找到作品或季度")
	}
	if resp.StatusCode != 200 {
		return fmt.Errorf("TMDb 请求失败（HTTP %d），请稍后重试", resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(out); err != nil {
		return errors.New("TMDb 返回的资料格式无效")
	}
	return nil
}
func (c *Client) ImageURL(path, size string) string {
	if !ValidImagePath(path) {
		return ""
	}
	return c.ImageBase + "/" + size + path
}
func ValidImagePath(path string) bool {
	return len(path) > 1 && strings.HasPrefix(path, "/") && !strings.Contains(path, "..") && !strings.ContainsAny(path, "?#\\") && strings.Count(path, "/") == 1
}

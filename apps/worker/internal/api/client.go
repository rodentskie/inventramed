package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"apps/worker/internal/domain"
)

const MAX_RESPONSE_BYTES = 1 << 20

// Error is a non-2xx response from the app.
type Error struct {
	StatusCode int
	Code       string
	Message    string
}

func (e *Error) Error() string {
	return fmt.Sprintf("api status %d %s: %s", e.StatusCode, e.Code, e.Message)
}

// Client calls the app's worker endpoints with the worker bearer token.
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func New(baseURL, token string, timeout time.Duration) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		http:    &http.Client{Timeout: timeout},
	}
}

// Claim claims the next batch of messages to send.
func (c *Client) Claim(ctx context.Context) (domain.Claim, error) {
	return post[domain.Claim](ctx, c, "/api/worker/sms/claim", nil)
}

// Result reports the outcome of one attempt.
func (c *Client) Result(ctx context.Context, id string, input domain.ResultInput) (domain.ResultResponse, error) {
	payload, err := json.Marshal(input)
	if err != nil {
		return domain.ResultResponse{}, fmt.Errorf("marshal result: %w", err)
	}
	path := "/api/worker/sms/" + url.PathEscape(id) + "/result"
	return post[domain.ResultResponse](ctx, c, path, payload)
}

type envelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Error   *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func post[T any](ctx context.Context, c *Client, path string, payload []byte) (T, error) {
	var out T

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return out, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	res, err := c.http.Do(req)
	if err != nil {
		return out, fmt.Errorf("post %s: %w", path, err)
	}
	defer res.Body.Close()

	var env envelope
	decodeErr := json.NewDecoder(io.LimitReader(res.Body, MAX_RESPONSE_BYTES)).Decode(&env)

	if res.StatusCode < 200 || res.StatusCode > 299 {
		apiErr := &Error{StatusCode: res.StatusCode}
		if decodeErr == nil && env.Error != nil {
			apiErr.Code, apiErr.Message = env.Error.Code, env.Error.Message
		}
		return out, apiErr
	}
	if decodeErr != nil {
		return out, fmt.Errorf("decode %s response: %w", path, decodeErr)
	}
	if err := json.Unmarshal(env.Data, &out); err != nil {
		return out, fmt.Errorf("decode %s data: %w", path, err)
	}
	return out, nil
}

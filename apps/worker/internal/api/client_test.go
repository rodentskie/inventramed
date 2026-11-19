package api_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"apps/worker/internal/api"
	"apps/worker/internal/domain"
)

type recorded struct {
	path  string
	auth  string
	body  string
	ctype string
}

func newServer(t *testing.T, status int, response string, rec *recorded) *api.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		*rec = recorded{path: r.URL.Path, auth: r.Header.Get("Authorization"), body: string(body), ctype: r.Header.Get("Content-Type")}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(response))
	}))
	t.Cleanup(srv.Close)
	return api.New(srv.URL+"/", "secret", 5*time.Second)
}

func TestClient_Claim(t *testing.T) {
	t.Parallel()

	var rec recorded
	client := newServer(t, http.StatusOK,
		`{"success":true,"data":{"pollIntervalSecs":300,"claimTimeoutSecs":600,"messages":[{"id":"m1","phoneNumber":"+639171234567","body":"hi","attempt":1}]}}`,
		&rec)

	claim, err := client.Claim(context.Background())
	if err != nil {
		t.Fatalf("Claim() error = %v", err)
	}

	if rec.path != "/api/worker/sms/claim" || rec.auth != "Bearer secret" {
		t.Errorf("request = %+v", rec)
	}
	want := domain.Claim{
		PollIntervalSecs: 300,
		ClaimTimeoutSecs: 600,
		Messages:         []domain.ClaimedMessage{{ID: "m1", PhoneNumber: "+639171234567", Body: "hi", Attempt: 1}},
	}
	if claim.PollIntervalSecs != want.PollIntervalSecs || claim.ClaimTimeoutSecs != want.ClaimTimeoutSecs ||
		len(claim.Messages) != 1 || claim.Messages[0] != want.Messages[0] {
		t.Errorf("Claim() = %+v, want %+v", claim, want)
	}
}

func TestClient_Result(t *testing.T) {
	t.Parallel()

	var rec recorded
	client := newServer(t, http.StatusOK, `{"success":true,"data":{"id":"m1","status":"SENT","applied":true}}`, &rec)

	res, err := client.Result(context.Background(), "m1", domain.ResultInput{Attempt: 2, Success: true, ModemResponse: "+CMGS: 7"})
	if err != nil {
		t.Fatalf("Result() error = %v", err)
	}

	if rec.path != "/api/worker/sms/m1/result" || rec.ctype != "application/json" {
		t.Errorf("request = %+v", rec)
	}
	var sent map[string]interface{} // decoded generically to check that no extra keys are sent
	if err := json.Unmarshal([]byte(rec.body), &sent); err != nil {
		t.Fatalf("unmarshal body: %v", err)
	}
	if len(sent) != 3 || sent["attempt"] != float64(2) || sent["success"] != true || sent["modemResponse"] != "+CMGS: 7" {
		t.Errorf("body = %s", rec.body)
	}
	if res != (domain.ResultResponse{ID: "m1", Status: "SENT", Applied: true}) {
		t.Errorf("Result() = %+v", res)
	}
}

func TestClient_Errors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		status   int
		response string
		wantCode string
	}{
		{name: "envelope error", status: http.StatusNotFound, response: `{"success":false,"error":{"code":"NOT_FOUND","message":"gone"}}`, wantCode: "NOT_FOUND"},
		{name: "non-json error", status: http.StatusBadGateway, response: `bad gateway`, wantCode: ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var rec recorded
			client := newServer(t, tc.status, tc.response, &rec)

			_, err := client.Claim(context.Background())

			var apiErr *api.Error
			if !errors.As(err, &apiErr) {
				t.Fatalf("error = %v, want *api.Error", err)
			}
			if apiErr.StatusCode != tc.status || apiErr.Code != tc.wantCode {
				t.Errorf("error = %+v", apiErr)
			}
		})
	}
}

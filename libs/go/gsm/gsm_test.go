package gsm

import (
	"strings"
	"testing"
)

func TestGSM7Length(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		body      string
		wantChars int
		wantValid bool
	}{
		{name: "plain characters", body: strings.Repeat("a", 161), wantChars: 161, wantValid: true},
		{name: "extended characters count two", body: "{€}", wantChars: 6, wantValid: true},
		{name: "accented basic character", body: "Niño\n", wantChars: 5, wantValid: true},
		{name: "emoji is not GSM-7", body: "ok 💊", wantChars: 4, wantValid: false},
		{name: "empty body", body: "", wantChars: 0, wantValid: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			chars, valid := GSM7Length(tc.body)
			if chars != tc.wantChars || valid != tc.wantValid {
				t.Errorf("GSM7Length() = (%d, %v), want (%d, %v)", chars, valid, tc.wantChars, tc.wantValid)
			}
		})
	}
}

func TestHasControlChars(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		body string
		want bool
	}{
		{name: "plain text", body: "Paracetamol 500 mg\nexp 2026-11-02", want: false},
		{name: "ctrl-z", body: "abc\x1Adef", want: true},
		{name: "escape", body: "abc\x1B", want: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := HasControlChars(tc.body); got != tc.want {
				t.Errorf("HasControlChars() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestParseCMGS(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		resp        string
		wantRef     string
		wantDone    bool
		wantFailure string
	}{
		{name: "ref then ok", resp: "\r\n+CMGS: 12\r\n\r\nOK\r\n", wantRef: "+CMGS: 12", wantDone: true},
		{name: "ref without ok yet", resp: "\r\n+CMGS: 12\r\n", wantDone: false},
		{name: "partial ok line", resp: "\r\n+CMGS: 12\r\n\r\nOK", wantDone: false},
		{name: "echoed body ok before ref", resp: "> OK\r\nstock OK\r\n", wantDone: false},
		{name: "cms error", resp: "\r\n+CMS ERROR: 500\r\n", wantFailure: "+CMS ERROR: 500"},
		{name: "plain error", resp: "\r\nERROR\r\n", wantFailure: "ERROR"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			ref, done, failure := parseCMGS(tc.resp)
			if done != tc.wantDone || failure != tc.wantFailure || (tc.wantDone && ref != tc.wantRef) {
				t.Errorf("parseCMGS() = (%q, %v, %q), want (%q, %v, %q)",
					ref, done, failure, tc.wantRef, tc.wantDone, tc.wantFailure)
			}
		})
	}
}

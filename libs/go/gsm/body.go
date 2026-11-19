package gsm

import "strings"

// SINGLE_SMS_LIMIT is the most GSM-7 characters one SMS part can hold.
const SINGLE_SMS_LIMIT = 160

// These tables match apps/app/src/lib/sms-preview.ts, so the consumer accepts
// exactly what the settings preview counts as one GSM-7 part.
const (
	gsmBasic = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
		"ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
	// Extended characters take an escape plus their own, so they count as two.
	gsmExtended = "\f^{}\\[~]|€"
)

// GSM7Length counts the body in GSM-7 characters. valid is false when a
// character is outside GSM-7; that character still counts as one.
func GSM7Length(body string) (chars int, valid bool) {
	valid = true
	for _, r := range body {
		switch {
		case strings.ContainsRune(gsmExtended, r):
			chars += 2
		case strings.ContainsRune(gsmBasic, r):
			chars++
		default:
			chars++
			valid = false
		}
	}
	return chars, valid
}

// HasControlChars reports whether the body contains Ctrl-Z, which ends the
// body in text mode, or ESC, which cancels the send.
func HasControlChars(body string) bool {
	return strings.ContainsAny(body, "\x1A\x1B")
}

package domain

// ClaimedMessage is one message from POST /api/worker/sms/claim. It is also
// the payload published to the sms.send queue.
type ClaimedMessage struct {
	ID          string `json:"id"`
	PhoneNumber string `json:"phoneNumber"`
	Body        string `json:"body"`
	Attempt     int    `json:"attempt"`
}

// Claim is the response of POST /api/worker/sms/claim.
type Claim struct {
	PollIntervalSecs int              `json:"pollIntervalSecs"`
	ClaimTimeoutSecs int              `json:"claimTimeoutSecs"`
	Messages         []ClaimedMessage `json:"messages"`
}

// SendResult is the payload consumed from the sms.success queue.
type SendResult struct {
	ID            string `json:"id"`
	Attempt       int    `json:"attempt"`
	Success       bool   `json:"success"`
	Error         string `json:"error,omitempty"`
	ModemResponse string `json:"modemResponse,omitempty"`
}

// ResultInput is the body of POST /api/worker/sms/:id/result.
type ResultInput struct {
	Attempt       int    `json:"attempt"`
	Success       bool   `json:"success"`
	Error         string `json:"error,omitempty"`
	ModemResponse string `json:"modemResponse,omitempty"`
}

// ResultResponse is the response of POST /api/worker/sms/:id/result. Applied
// is false when the result was stale or repeated and the server ignored it.
type ResultResponse struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Applied bool   `json:"applied"`
}

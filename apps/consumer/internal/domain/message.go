package domain

// MessageEvent is the payload consumed from the sms.send queue. Attempt is the
// claim's attempt number and goes back unchanged in the result.
type MessageEvent struct {
	ID          string `json:"id"`
	PhoneNumber string `json:"phoneNumber"`
	Body        string `json:"body"`
	Attempt     int    `json:"attempt"`
}

// SendResult is the payload published to the sms.success queue.
type SendResult struct {
	ID            string `json:"id"`
	Attempt       int    `json:"attempt"`
	Success       bool   `json:"success"`
	Error         string `json:"error,omitempty"`
	ModemResponse string `json:"modemResponse,omitempty"`
}

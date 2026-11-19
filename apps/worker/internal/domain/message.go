package domain

// Message is a failed message candidate for retry or status update.
type Message struct {
	ID         string
	To         string
	Body       string
	Status     string
	RetryCount int16
}

// Settings holds retry configuration from the settings table.
type Settings struct {
	RetryLimit      int16
	RetryWindowDays int16
}

// StatusUpdate is the payload consumed from the sms.success queue.
type StatusUpdate struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// MessageEvent is the payload published to the sms.send queue.
type MessageEvent struct {
	ID   string `json:"id"`
	To   string `json:"to"`
	Body string `json:"body"`
}

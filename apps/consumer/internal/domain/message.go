package domain

// MessageEvent is the payload consumed from the sms.send queue.
type MessageEvent struct {
	ID   string `json:"id"`
	To   string `json:"to"`
	Body string `json:"body"`
}

// StatusUpdate is the payload published to the sms.success queue.
type StatusUpdate struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

package gsm

import (
	"fmt"
	"io"
	"strings"
	"time"

	"go.bug.st/serial"
)

const (
	baudRate    = 115200
	readTimeout = 5 * time.Second
	smsTimeout  = 30 * time.Second
)

// Device wraps a serial connection to a SIM800C GSM module.
type Device struct {
	port serial.Port
}

// NewDevice opens a serial port connection to the GSM module.
func NewDevice(portName string) (*Device, error) {
	mode := &serial.Mode{
		BaudRate: baudRate,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open(portName, mode)
	if err != nil {
		return nil, fmt.Errorf("open serial port %s: %w", portName, err)
	}

	if err := port.SetReadTimeout(readTimeout); err != nil {
		port.Close()
		return nil, fmt.Errorf("set read timeout: %w", err)
	}

	return &Device{port: port}, nil
}

// Close closes the serial connection.
func (d *Device) Close() error {
	return d.port.Close()
}

// Initialize sends AT setup commands to prepare the module for SMS sending.
func (d *Device) Initialize() error {
	if err := d.sendCommand("AT"); err != nil {
		return fmt.Errorf("at ping: %w", err)
	}
	if err := d.sendCommand("AT+CMGF=1"); err != nil {
		return fmt.Errorf("set sms text mode: %w", err)
	}
	if err := d.sendCommand(`AT+CSCS="GSM"`); err != nil {
		return fmt.Errorf("set character set: %w", err)
	}
	return nil
}

// SendSMS sends an SMS to the given number using AT commands. It returns the
// "+CMGS: <ref>" line the module sends back once the network accepts the message.
func (d *Device) SendSMS(number, message string) (string, error) {
	cmd := fmt.Sprintf(`AT+CMGS="%s"`, number)
	if _, err := fmt.Fprintf(d.port, "%s\r", cmd); err != nil {
		return "", fmt.Errorf("send cmgs: %w", err)
	}

	if err := d.waitForPrompt(); err != nil {
		return "", fmt.Errorf("wait for prompt: %w", err)
	}

	if _, err := fmt.Fprintf(d.port, "%s\x1A", message); err != nil {
		return "", fmt.Errorf("send sms body: %w", err)
	}

	ref, err := d.waitForCMGS(smsTimeout)
	if err != nil {
		return "", fmt.Errorf("sms confirmation: %w", err)
	}

	return ref, nil
}

// Ping checks if the module is responsive.
func (d *Device) Ping() error {
	return d.sendCommand("AT")
}

// NetworkRegistered returns true if the module is registered on the network.
func (d *Device) NetworkRegistered() (bool, error) {
	if _, err := fmt.Fprintf(d.port, "AT+CREG?\r"); err != nil {
		return false, fmt.Errorf("send creg: %w", err)
	}

	resp, err := d.readUntilOK(readTimeout)
	if err != nil {
		return false, err
	}

	// +CREG: 0,1 = home, +CREG: 0,5 = roaming
	registered := strings.Contains(resp, "+CREG: 0,1") || strings.Contains(resp, "+CREG: 0,5")
	return registered, nil
}

// SignalQuality returns the RSSI value (0–31; 99 = unknown).
func (d *Device) SignalQuality() (int, error) {
	if _, err := fmt.Fprintf(d.port, "AT+CSQ\r"); err != nil {
		return 0, fmt.Errorf("send csq: %w", err)
	}

	resp, err := d.readUntilOK(readTimeout)
	if err != nil {
		return 0, err
	}

	var rssi, ber int
	if _, err := fmt.Sscanf(strings.TrimSpace(resp), "+CSQ: %d,%d", &rssi, &ber); err != nil {
		return 0, fmt.Errorf("parse csq: %w", err)
	}

	return rssi, nil
}

func (d *Device) sendCommand(cmd string) error {
	if _, err := fmt.Fprintf(d.port, "%s\r", cmd); err != nil {
		return fmt.Errorf("write: %w", err)
	}

	resp, err := d.readUntilOK(readTimeout)
	if err != nil {
		return err
	}

	if !strings.Contains(resp, "OK") {
		return fmt.Errorf("unexpected response: %s", strings.TrimSpace(resp))
	}

	return nil
}

func (d *Device) waitForPrompt() error {
	if err := d.port.SetReadTimeout(readTimeout); err != nil {
		return fmt.Errorf("set timeout: %w", err)
	}

	buf := make([]byte, 1)
	deadline := time.Now().Add(readTimeout)

	for time.Now().Before(deadline) {
		n, err := d.port.Read(buf)
		if n > 0 && buf[0] == '>' {
			return nil
		}
		if err != nil && err != io.EOF {
			return fmt.Errorf("read prompt: %w", err)
		}
	}

	return fmt.Errorf("timeout waiting for '>' prompt")
}

// waitForCMGS reads until the final "OK" after "+CMGS:", or an error line.
// It matches whole lines, so an echoed body containing "OK" or "ERROR" can't
// end the wait early, and the trailing "OK" isn't left for the next command.
func (d *Device) waitForCMGS(timeout time.Duration) (string, error) {
	if err := d.port.SetReadTimeout(timeout); err != nil {
		return "", fmt.Errorf("set timeout: %w", err)
	}

	var sb strings.Builder
	buf := make([]byte, 256)
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		n, err := d.port.Read(buf)
		if n > 0 {
			sb.Write(buf[:n])
			ref, done, failure := parseCMGS(sb.String())
			if failure != "" {
				return "", fmt.Errorf("error response: %s", failure)
			}
			if done {
				return ref, nil
			}
		}
		if err != nil && err != io.EOF {
			return "", fmt.Errorf("read response: %w", err)
		}
	}

	return "", fmt.Errorf("response timeout after %s", timeout)
}

// parseCMGS scans complete lines. It returns the "+CMGS:" line and done once an
// "OK" line follows it, or the error line if the module reported one.
func parseCMGS(resp string) (ref string, done bool, failure string) {
	lines := strings.Split(resp, "\n")
	// The last element is a partial line until its "\n" arrives.
	for _, raw := range lines[:len(lines)-1] {
		line := strings.TrimSpace(raw)
		switch {
		case line == "ERROR" || strings.HasPrefix(line, "+CMS ERROR") || strings.HasPrefix(line, "+CME ERROR"):
			return "", false, line
		case strings.HasPrefix(line, "+CMGS:"):
			ref = line
		case line == "OK" && ref != "":
			return ref, true, ""
		}
	}
	return "", false, ""
}

func (d *Device) readUntilOK(timeout time.Duration) (string, error) {
	if err := d.port.SetReadTimeout(timeout); err != nil {
		return "", fmt.Errorf("set timeout: %w", err)
	}

	var sb strings.Builder
	buf := make([]byte, 256)
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		n, err := d.port.Read(buf)
		if n > 0 {
			sb.Write(buf[:n])
			s := sb.String()
			if strings.Contains(s, "OK") || strings.Contains(s, "ERROR") {
				return s, nil
			}
		}
		if err != nil && err != io.EOF {
			return sb.String(), fmt.Errorf("read: %w", err)
		}
	}

	return sb.String(), fmt.Errorf("response timeout after %s", timeout)
}

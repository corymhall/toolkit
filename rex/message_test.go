package rex

import (
	"bufio"
	"context"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type deliveryResult struct {
	payload map[string]string
	err     error
}

func testEndpoint(t *testing.T, acknowledge bool) (Endpoint, <-chan deliveryResult) {
	t.Helper()
	directory, err := os.MkdirTemp("/tmp", "tk-msg-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.RemoveAll(directory); err != nil {
			t.Error(err)
		}
	})
	path := filepath.Join(directory, "s")
	listener, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := listener.Close(); err != nil {
			t.Error(err)
		}
	})
	result := make(chan deliveryResult, 1)
	go func() { result <- serveMessage(listener, acknowledge) }()
	return Endpoint{Session: "conversation", Socket: path}, result
}

func serveMessage(listener net.Listener, acknowledge bool) deliveryResult {
	connection, err := listener.Accept()
	if err != nil {
		return deliveryResult{err: err}
	}
	var payload map[string]string
	err = json.NewDecoder(bufio.NewReader(connection)).Decode(&payload)
	if err == nil && acknowledge {
		_, err = connection.Write([]byte("{\"ok\":true}\n"))
	}
	closeErr := connection.Close()
	if err == nil {
		err = closeErr
	}
	return deliveryResult{payload: payload, err: err}
}

// TestSendPreservesLiteralMessage checks the actual Unix socket protocol.
func TestSendPreservesLiteralMessage(t *testing.T) {
	endpoint, received := testEndpoint(t, true)
	text := "Fix π\nLiteral $(echo no); 'quotes'"
	if err := Send(t.Context(), endpoint, text); err != nil {
		t.Fatal(err)
	}
	select {
	case result := <-received:
		if result.err != nil {
			t.Fatal(result.err)
		}
		if result.payload["text"] != text || result.payload["session_id"] != "conversation" {
			t.Fatalf("message changed: %#v", result.payload)
		}
	case <-time.After(time.Second):
		t.Fatal("message server did not finish")
	}
}

// TestLostAcknowledgementIsUncertain prevents a false failed-delivery claim.
func TestLostAcknowledgementIsUncertain(t *testing.T) {
	endpoint, received := testEndpoint(t, false)
	err := Send(t.Context(), endpoint, "hello")
	if err == nil || !strings.Contains(err.Error(), "may have succeeded") {
		t.Fatalf("expected uncertain delivery, got %v", err)
	}
	select {
	case result := <-received:
		if result.err != nil {
			t.Fatal(result.err)
		}
	case <-time.After(time.Second):
		t.Fatal("message server did not finish")
	}
}

// TestInvalidMessageNeverConnects rejects dangerous or oversized text first.
func TestInvalidMessageNeverConnects(t *testing.T) {
	for _, text := range []string{" ", "bad\x1btext", strings.Repeat("x", 65537)} {
		err := Send(context.Background(), Endpoint{Socket: "/missing-socket"}, text)
		if err == nil || !strings.Contains(err.Error(), "message must") {
			t.Fatalf("expected validation before socket access, got %v", err)
		}
	}
}

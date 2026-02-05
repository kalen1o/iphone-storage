package logging

import (
	"encoding/json"
	"os"
	"strings"
	"time"
)

type Level string

const (
	LevelDebug Level = "debug"
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

type Logger struct {
	service string
	env     string
	level   Level
}

func New(service, env string) *Logger {
	return &Logger{
		service: service,
		env:     env,
		level:   parseLevel(os.Getenv("LOG_LEVEL")),
	}
}

func parseLevel(v string) Level {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "debug":
		return LevelDebug
	case "warn", "warning":
		return LevelWarn
	case "error":
		return LevelError
	default:
		return LevelInfo
	}
}

func (l *Logger) Debug(msg string, fields map[string]any) { l.log(LevelDebug, msg, fields) }
func (l *Logger) Info(msg string, fields map[string]any)  { l.log(LevelInfo, msg, fields) }
func (l *Logger) Warn(msg string, fields map[string]any)  { l.log(LevelWarn, msg, fields) }
func (l *Logger) Error(msg string, fields map[string]any) { l.log(LevelError, msg, fields) }

func (l *Logger) log(level Level, msg string, fields map[string]any) {
	if !enabled(l.level, level) {
		return
	}

	entry := map[string]any{
		"ts":      time.Now().UTC().Format(time.RFC3339Nano),
		"level":   level,
		"service": l.service,
		"env":     l.env,
		"msg":     msg,
	}
	for k, v := range fields {
		entry[k] = v
	}

	b, err := json.Marshal(entry)
	if err != nil {
		// Last-resort fallback.
		os.Stdout.WriteString(`{"level":"error","msg":"failed to marshal log entry"}` + "\n")
		return
	}
	os.Stdout.Write(b)
	os.Stdout.WriteString("\n")
}

func enabled(min, level Level) bool {
	rank := func(l Level) int {
		switch l {
		case LevelDebug:
			return 10
		case LevelInfo:
			return 20
		case LevelWarn:
			return 30
		case LevelError:
			return 40
		default:
			return 20
		}
	}
	return rank(level) >= rank(min)
}


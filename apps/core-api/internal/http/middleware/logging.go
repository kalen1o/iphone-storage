package middleware

import (
	"net/http"
	"time"

	"github.com/kalen1o/iphone-storage/shared/logging"
)

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func Logging(log *logging.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}

			next.ServeHTTP(sw, r)

			log.Info("http request", map[string]any{
				"method":   r.Method,
				"path":     r.URL.Path,
				"status":   sw.status,
				"duration": time.Since(start).String(),
			})
		})
	}
}

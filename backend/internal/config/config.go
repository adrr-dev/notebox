// Package config holds server configuration resolved from flags, environment
// and defaults.
package config

import (
	"flag"
	"os"
	"path/filepath"
)

// Config is the resolved server configuration.
type Config struct {
	// Addr is the listen address. Defaults to loopback only: the product is a
	// local, single-user workspace server.
	Addr string
	// DBPath is the SQLite file path.
	DBPath string
	// StaticDir optionally serves a built frontend from disk (dev convenience).
	StaticDir string
	// GinMode is "debug" or "release".
	GinMode string
}

// Load resolves configuration from flags with environment fallbacks.
func Load(args []string) (Config, error) {
	fs := flag.NewFlagSet("ri3d-server", flag.ContinueOnError)
	cfg := Config{}
	fs.StringVar(&cfg.Addr, "addr", envOr("RI3D_ADDR", "127.0.0.1:8787"), "listen address")
	fs.StringVar(&cfg.DBPath, "db", envOr("RI3D_DB", defaultDBPath()), "SQLite database file")
	fs.StringVar(&cfg.StaticDir, "static", envOr("RI3D_STATIC", ""), "directory with built frontend assets (optional)")
	fs.StringVar(&cfg.GinMode, "gin-mode", envOr("RI3D_GIN_MODE", "release"), "gin mode: debug or release")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// defaultDBPath keeps the database next to the backend module by default so a
// fresh checkout works without setup.
func defaultDBPath() string {
	if dir, err := os.UserConfigDir(); err == nil {
		return filepath.Join(dir, "ri3d", "ri3d.db")
	}
	return "ri3d.db"
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

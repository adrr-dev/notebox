// Package database opens and migrates the SQLite database.
package database

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/art/notebox/backend/internal/models"
)

// Open connects to the SQLite file, creating parent directories as needed, and
// applies the pragmas the app relies on (WAL journal, busy timeout).
func Open(path string) (*gorm.DB, error) {
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
	}
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	pragmas := []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA busy_timeout = 5000",
		"PRAGMA foreign_keys = ON",
		"PRAGMA synchronous = NORMAL",
	}
	for _, pragma := range pragmas {
		if err := db.Exec(pragma).Error; err != nil {
			return nil, fmt.Errorf("apply %q: %w", pragma, err)
		}
	}
	return db, nil
}

// Migrate creates or updates the schema.
func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&models.Workspace{},
		&models.Node{},
		&models.Edge{},
		&models.Snapshot{},
	)
}

// Command ri3d-server runs the Ruang Informasi 3D backend: a local, single-user
// workspace server backed by SQLite.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/art/notebox/backend/internal/config"
	"github.com/art/notebox/backend/internal/database"
	"github.com/art/notebox/backend/internal/handlers"
	"github.com/art/notebox/backend/internal/router"
	"github.com/art/notebox/backend/internal/store"
	"github.com/art/notebox/backend/internal/web"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "ri3d-server:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	cfg, err := config.Load(args)
	if err != nil {
		return err
	}

	db, err := database.Open(cfg.DBPath)
	if err != nil {
		return err
	}
	if err := database.Migrate(db); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	repository := store.New(db)
	ctx := context.Background()
	count, err := repository.CountWorkspaces(ctx)
	if err != nil {
		return fmt.Errorf("count workspaces: %w", err)
	}
	if count == 0 {
		if _, err := repository.SeedWorkspace(ctx); err != nil {
			return fmt.Errorf("seed workspace: %w", err)
		}
		fmt.Println("ri3d-server: workspace awal dibuat (Ruang Informasi 3D)")
	}

	engine := router.New(router.Options{
		API:       handlers.New(repository),
		StaticFS:  web.DistFS(),
		StaticDir: cfg.StaticDir,
		GinMode:   cfg.GinMode,
	})
	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           engine,
		ReadHeaderTimeout: 10 * time.Second,
	}

	fmt.Printf("ri3d-server: mendengarkan di http://%s (db: %s)\n", cfg.Addr, cfg.DBPath)
	if web.HasDist() {
		fmt.Println("ri3d-server: frontend tertanam (prod build) disajikan dari API yang sama")
	}

	errc := make(chan error, 1)
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-errc:
		return err
	case <-stop:
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	}
}

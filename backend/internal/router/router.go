// Package router wires the HTTP surface: the JSON API under /api and, when a
// bundle is available, the frontend single-page app.
package router

import (
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/art/notebox/backend/internal/handlers"
)

// Options configures the engine.
type Options struct {
	API       *handlers.API
	StaticFS  fs.FS  // embedded bundle (production builds)
	StaticDir string // on-disk bundle (optional, any build)
	GinMode   string
}

// New builds the gin engine.
func New(opts Options) *gin.Engine {
	gin.SetMode(opts.GinMode)
	engine := gin.New()
	engine.Use(gin.Logger(), gin.Recovery())
	engine.MaxMultipartMemory = 8 << 20
	// Unmatched paths must reach the SPA handler untouched: gin's automatic
	// redirects would answer a deep client route with 301 instead of index.html.
	engine.RedirectTrailingSlash = false
	engine.RedirectFixedPath = false

	api := engine.Group("/api")
	opts.API.Register(api)

	engine.NoRoute(spaHandler(opts))
	return engine
}

// spaHandler serves the frontend for every non-API path, falling back to
// index.html so client-side routes survive a reload.
func spaHandler(opts Options) gin.HandlerFunc {
	bundle := opts.StaticFS
	if bundle == nil && opts.StaticDir != "" {
		if info, err := os.Stat(filepath.Join(opts.StaticDir, "index.html")); err == nil && !info.IsDir() {
			bundle = os.DirFS(opts.StaticDir)
		}
	}
	if bundle == nil {
		return func(c *gin.Context) {
			if strings.HasPrefix(c.Request.URL.Path, "/api/") {
				c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found", "message": "Endpoint tidak ditemukan."}})
				return
			}
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{
				"code":    "frontend_not_built",
				"message": "Frontend belum dibangun. Jalankan `npm run dev` di folder frontend, atau `make build` untuk binary tunggal.",
			}})
		}
	}
	fileServer := http.FileServer(http.FS(bundle))
	return func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found", "message": "Endpoint tidak ditemukan."}})
			return
		}
		requested := strings.TrimPrefix(c.Request.URL.Path, "/")
		if requested == "" {
			requested = "index.html"
		}
		if entry, err := bundle.Open(requested); err == nil {
			if info, statErr := entry.Stat(); statErr == nil && !info.IsDir() {
				entry.Close()
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
			entry.Close()
		}
		// Client-side route: answer with the entry document directly. Rewriting
		// the request path would make http.FileServer answer a 301 to "./".
		entry, err := fs.ReadFile(bundle, "index.html")
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "frontend_not_built", "message": "index.html tidak ditemukan pada bundel frontend."}})
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", entry)
	}
}

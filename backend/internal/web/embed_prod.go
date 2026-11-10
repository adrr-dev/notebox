//go:build prod

// Package web serves the frontend bundle embedded into the single production
// binary. The `make build` target copies frontend/dist here before compiling.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distEmbed embed.FS

// DistFS returns the embedded frontend assets rooted at the bundle directory.
func DistFS() fs.FS {
	sub, err := fs.Sub(distEmbed, "dist")
	if err != nil {
		return nil
	}
	return sub
}

// HasDist reports whether a frontend bundle is embedded in this binary.
func HasDist() bool { return true }

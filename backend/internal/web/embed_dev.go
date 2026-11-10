//go:build !prod

// Package web optionally serves the built frontend. In development builds
// (without the `prod` tag) nothing is embedded and the Vite dev server owns
// the UI.
package web

import "io/fs"

// DistFS returns the embedded frontend assets, or nil in development builds.
func DistFS() fs.FS { return nil }

// HasDist reports whether a frontend bundle is embedded in this binary.
func HasDist() bool { return false }

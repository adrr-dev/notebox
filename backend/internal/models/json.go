// Package models defines the persisted entities of Ruang Informasi 3D.
//
// The wire schema is the original workspace envelope produced by the legacy
// single-file app, so field names and value shapes are load-bearing:
//
//	{ app, version, formatVersion, knowledgeModelVersion, exportedAt, scope,
//	  nodes[], edges[], trash[], epistemicHistory[], learningEpisodes[],
//	  actionCycles[], camera, tour, fase2 }
//
// Everything that is not part of the graph itself (trash, epistemic records,
// camera, tour, physics state) is stored verbatim as JSON on the workspace row;
// nodes and edges are stored as rows because the app queries and rewrites them
// as a unit and they benefit from keys and indexes.
package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
)

// JSON is an arbitrary JSON document persisted as TEXT.
//
// It keeps the exact bytes it received so the envelope round-trips losslessly:
// null, missing and empty values stay distinguishable on the wire.
type JSON []byte

// Value implements driver.Valuer.
func (j JSON) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

// Scan implements sql.Scanner.
func (j *JSON) Scan(src any) error {
	switch v := src.(type) {
	case nil:
		*j = nil
	case []byte:
		*j = append((*j)[:0], v...)
	case string:
		*j = append((*j)[:0], v...)
	default:
		return fmt.Errorf("models.JSON: cannot scan %T", src)
	}
	return nil
}

// MarshalJSON emits the stored document verbatim.
func (j JSON) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}

// UnmarshalJSON keeps the exact bytes.
func (j *JSON) UnmarshalJSON(b []byte) error {
	*j = append((*j)[:0], b...)
	return nil
}

// IsNull reports whether the document is absent (NULL in the database).
func (j JSON) IsNull() bool { return len(j) == 0 }

// IsJSONNull reports whether the document is the literal JSON null.
func (j JSON) IsJSONNull() bool {
	return strings.TrimSpace(string(j)) == "null"
}

// SetString stores s as a JSON string document.
func (j *JSON) SetString(s string) {
	b, _ := json.Marshal(s)
	*j = b
}

// String returns the document as a Go string for debugging.
func (j JSON) String() string { return string(j) }

// ID is an entity identifier. The legacy app uses numeric ids for nodes and
// string ids ("edge_...") for edges; JSON marshaling preserves that distinction
// so exported files stay readable by both old and new frontends.
type ID string

// String returns the canonical string form.
func (id ID) String() string { return string(id) }

// MarshalJSON emits a JSON number when the id is numeric, a string otherwise.
func (id ID) MarshalJSON() ([]byte, error) {
	s := string(id)
	if s == "" {
		return []byte("null"), nil
	}
	if isNumericID(s) {
		return []byte(s), nil
	}
	return json.Marshal(s)
}

// UnmarshalJSON accepts both numeric and string ids.
func (id *ID) UnmarshalJSON(b []byte) error {
	s := strings.TrimSpace(string(b))
	switch {
	case s == "" || s == "null":
		*id = ""
	case s[0] == '"':
		var str string
		if err := json.Unmarshal(b, &str); err != nil {
			return err
		}
		*id = ID(str)
	default:
		*id = ID(s)
	}
	return nil
}

// isNumericID reports whether s is a plain decimal integer literal.
func isNumericID(s string) bool {
	if s == "" {
		return false
	}
	start := 0
	if s[0] == '-' {
		if len(s) == 1 {
			return false
		}
		start = 1
	}
	for i := start; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

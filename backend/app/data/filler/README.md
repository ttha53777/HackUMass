Hand-checked field maps for forms the Filler knows: `<form>.json` holds
`{"fields": {"<html id or name>": "<fill-sheet key>"}}`. Keys must be in
`app/filler/models.py` CATALOGUE (checked on load). A form with a map uses only
the map; a form without one is matched by rules and, for what is left, one
text-only model call. Phase 5 adds the first real form.

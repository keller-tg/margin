# Test fixtures — not live data

Everything in this folder is a **fixture**. Tests read these files and never call the network. `scripts/content/lib/wiki.ts` throws if a live request is attempted under Vitest.

- `wikimedia/*.recorded.json` are real Wikimedia API responses, recorded once and stored verbatim. Each file says when and from where in its `_FIXTURE` field.
- `wikimedia/*.handmade.json` are written by hand to cover edge cases. They are labelled the same way and are never presented as real API output.

The pipeline's own response cache (`content/cache/api/`) is separate. It is not a test fixture, and tests don't read it.

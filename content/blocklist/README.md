# Blocklist

Content policy (decision 2, 2026-10-05): graphic violence, explicit sexual content, drug-use topics and live political controversy are out. History and medicine are in when treated factually and calmly. This is not a blunt category ban.

The policy is enforced in three layers:

1. **Whole Vital-Articles sections** are excluded in `scripts/content/config/domains.ts` (wars and military, crime, politics and government, military technology, drugs and pharmacology, politicians, military leaders, criminals).
2. **`titles.txt` and `qids.txt`** veto single topics. Matching ignores case. Lines starting with `#` are comments.
3. **`categories.{en,de,fr}.txt`** hold one regular expression per line, matched case-insensitively against the topic's visible categories. Each pick is checked when it is made, and the verifier re-checks against the *current* list at bake time.

To veto something, add it here (or to `content/overrides.json`) and re-run `npm run content:prepare`. Frozen queue entries that now fail get re-picked.

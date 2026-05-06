#!/usr/bin/env bash
# Replace track-letter refs (A0..H4) in each issue body with real #N refs.
# Idempotent: pattern is the track letter, not #N, so re-running is a no-op.

set -euo pipefail

REPO="${REPO:-Alexandr-Kravchuk/HoloNext}"

# Perl substitution string — single source of truth for the mapping.
PERL_REPL='
  s/\bA0\b/#1/g;  s/\bA1\b/#2/g;  s/\bA2\b/#3/g;  s/\bA3\b/#4/g;
  s/\bA4\b/#5/g;  s/\bA5\b/#6/g;  s/\bA6\b/#7/g;  s/\bA7\b/#8/g;
  s/\bA8\b/#9/g;
  s/\bB1\b/#10/g; s/\bB2\b/#11/g; s/\bB3\b/#12/g; s/\bB4\b/#13/g;
  s/\bB5\b/#14/g; s/\bB6\b/#15/g;
  s/\bC1\b/#16/g; s/\bC2\b/#17/g; s/\bC3\b/#18/g;
  s/\bD1\b/#19/g; s/\bD2\b/#20/g; s/\bD3\b/#21/g; s/\bD4\b/#22/g;
  s/\bD5\b/#23/g; s/\bD6\b/#24/g;
  s/\bE1\b/#25/g; s/\bE2\b/#26/g; s/\bE3\b/#27/g; s/\bE4\b/#28/g;
  s/\bE5\b/#29/g;
  s/\bF1\b/#30/g; s/\bF2\b/#31/g; s/\bF3\b/#32/g; s/\bF4\b/#33/g;
  s/\bF5\b/#34/g;
  s/\bG1\b/#35/g; s/\bG2\b/#36/g; s/\bG3\b/#37/g; s/\bG4\b/#38/g;
  s/\bG5\b/#39/g; s/\bG6\b/#40/g;
  s/\bH1\b/#41/g; s/\bH2\b/#42/g; s/\bH3\b/#43/g; s/\bH4\b/#44/g;
'

for n in $(seq 1 44); do
  body=$(gh issue view "$n" --repo "$REPO" --json body --jq .body)
  new_body=$(printf '%s' "$body" | perl -pe "$PERL_REPL")
  if [ "$body" = "$new_body" ]; then
    echo "  #$n: no change"
    continue
  fi
  printf '%s' "$new_body" | gh issue edit "$n" --repo "$REPO" --body-file - >/dev/null
  echo "  #$n: updated"
done

echo "==> Cross-linking done."

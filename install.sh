#!/bin/sh
# Installs wmpy, the command-line tool for WM Keyboard's Python plugins.
#
#   curl -fsSL https://raw.githubusercontent.com/wasi-master/wmpy/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/wasi-master/wmpy/main/install.sh | sh -s -- --version 0.1.0 --dir ~/bin
#
# Downloads the release build for this computer from GitHub, checks it
# against the release's SHA-256, and puts it in ~/.local/bin, or in
# $WMPY_INSTALL_DIR. $WMPY_VERSION picks a release; the default is the latest.
# On Windows, use install.ps1.

set -eu

REPO_URL="https://github.com/wasi-master/wmpy"
version="${WMPY_VERSION:-}"
dir="${WMPY_INSTALL_DIR:-$HOME/.local/bin}"
# Where the release files are. Only for mirrors and the install test.
base="${WMPY_DOWNLOAD_BASE:-}"

say() { printf '%s\n' "wmpy install: $*" >&2; }
fail() { say "$*"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --version) [ $# -ge 2 ] || fail "--version needs a value"; version="$2"; shift 2 ;;
    --dir) [ $# -ge 2 ] || fail "--dir needs a value"; dir="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,11p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) fail "unknown option $1 (try --help)" ;;
  esac
done
version="${version#v}"

case "$(uname -s)" in
  Darwin) os="apple-darwin" ;;
  Linux) os="unknown-linux-musl" ;;
  MINGW*|MSYS*|CYGWIN*) fail "on Windows, run install.ps1 in PowerShell, or: scoop bucket add wmpy $REPO_URL; scoop install wmpy" ;;
  *) fail "no wmpy build for $(uname -s); install it with: cargo install --git https://github.com/wasi-master/wmkeyboard wmpy" ;;
esac

case "$(uname -m)" in
  x86_64|amd64) cpu="x86_64" ;;
  arm64|aarch64) cpu="aarch64" ;;
  *) fail "no wmpy build for $(uname -m); install it with cargo" ;;
esac
# A shell under Rosetta reports x86_64 on an Apple silicon Mac.
if [ "$os" = "apple-darwin" ] && [ "$cpu" = "x86_64" ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
  cpu="aarch64"
fi

asset="wmpy-$cpu-$os.tar.gz"
if [ -z "$base" ]; then
  if [ -n "$version" ]; then
    base="$REPO_URL/releases/download/v$version"
  else
    base="$REPO_URL/releases/latest/download"
  fi
fi

if command -v curl >/dev/null 2>&1; then
  fetch() { curl --proto '=https,file' --tlsv1.2 -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q "$1" -O "$2"; }
else
  fail "needs curl or wget"
fi

if command -v sha256sum >/dev/null 2>&1; then
  digest() { sha256sum "$1" | cut -d ' ' -f 1; }
elif command -v shasum >/dev/null 2>&1; then
  digest() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
elif command -v openssl >/dev/null 2>&1; then
  digest() { openssl dgst -sha256 "$1" | sed 's/^.*= *//'; }
else
  fail "needs sha256sum, shasum or openssl to check the download"
fi

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t wmpy)"
trap 'rm -rf "$tmp"' EXIT INT TERM

say "downloading $base/$asset"
fetch "$base/$asset" "$tmp/$asset" || fail "could not download $base/$asset"
fetch "$base/$asset.sha256" "$tmp/$asset.sha256" || fail "could not download $base/$asset.sha256"

want="$(sed -n 's/^\([0-9a-fA-F]\{64\}\).*/\1/p' "$tmp/$asset.sha256" | head -n 1 | tr 'A-F' 'a-f')"
got="$(digest "$tmp/$asset" | tr 'A-F' 'a-f')"
[ -n "$want" ] || fail "$asset.sha256 holds no SHA-256"
[ "$want" = "$got" ] || fail "$asset does not match its SHA-256 (expected $want, got $got)"

mkdir -p "$tmp/out"
tar -xzf "$tmp/$asset" -C "$tmp/out"
[ -f "$tmp/out/wmpy" ] || fail "$asset has no wmpy in it"

mkdir -p "$dir"
# Replace by rename, so a running wmpy (an editor's language server) keeps its file.
cp "$tmp/out/wmpy" "$dir/.wmpy.new"
chmod 755 "$dir/.wmpy.new"
mv -f "$dir/.wmpy.new" "$dir/wmpy"

say "installed $("$dir/wmpy" --version 2>/dev/null || echo wmpy) to $dir/wmpy"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) say "$dir is not on your PATH. Add this line to your shell's startup file:"
     # shellcheck disable=SC2016 # $PATH is meant literally here
     printf '  export PATH="%s:$PATH"\n' "$dir" >&2 ;;
esac

#!/bin/sh
# Tests install.sh against a fake release in a temporary folder: a good
# download installs and runs, a wrong SHA-256 is refused.
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

case "$(uname -s)" in Darwin) os=apple-darwin ;; *) os=unknown-linux-musl ;; esac
case "$(uname -m)" in arm64|aarch64) cpu=aarch64 ;; *) cpu=x86_64 ;; esac
if [ "$os" = apple-darwin ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]; then cpu=aarch64; fi
asset="wmpy-$cpu-$os.tar.gz"

mkdir -p "$work/pkg" "$work/release"
printf '#!/bin/sh\necho "wmpy 9.9.9 (fake)"\n' > "$work/pkg/wmpy"
chmod 755 "$work/pkg/wmpy"
cp "$here/LICENSE" "$work/pkg/LICENSE"
tar -czf "$work/release/$asset" -C "$work/pkg" wmpy LICENSE
( cd "$work/release" && { sha256sum "$asset" 2>/dev/null || shasum -a 256 "$asset"; } > "$asset.sha256" )

WMPY_DOWNLOAD_BASE="file://$work/release" WMPY_INSTALL_DIR="$work/bin" sh "$here/install.sh"
[ "$("$work/bin/wmpy" --version)" = "wmpy 9.9.9 (fake)" ] || { echo "FAIL: installed wmpy does not run"; exit 1; }
echo "ok   a good release installs and runs"

WMPY_DOWNLOAD_BASE="file://$work/nowhere" WMPY_INSTALL_DIR="$work/bin2" sh "$here/install.sh" 2>/dev/null && { echo "FAIL: a missing file installed"; exit 1; }
echo "ok   a missing release fails"

echo "0000000000000000000000000000000000000000000000000000000000000000  $asset" > "$work/release/$asset.sha256"
if WMPY_DOWNLOAD_BASE="file://$work/release" WMPY_INSTALL_DIR="$work/bin3" sh "$here/install.sh" 2>"$work/err"; then
  echo "FAIL: a wrong SHA-256 installed"; exit 1
fi
grep -q "does not match its SHA-256" "$work/err" || { echo "FAIL: wrong message: $(cat "$work/err")"; exit 1; }
[ ! -e "$work/bin3/wmpy" ] || { echo "FAIL: wmpy was left behind"; exit 1; }
echo "ok   a wrong SHA-256 is refused"

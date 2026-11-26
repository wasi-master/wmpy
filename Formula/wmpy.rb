# The release workflow rewrites version and every sha256 here on each tag.
class Wmpy < Formula
  desc "Make, check, test, preview and pack WM Keyboard's Python plugins"
  homepage "https://wmkeyboard.pages.dev/plugins/wmpy/"
  version "0.1.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/wasi-master/wmpy/releases/download/v#{version}/wmpy-aarch64-apple-darwin.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
    on_intel do
      url "https://github.com/wasi-master/wmpy/releases/download/v#{version}/wmpy-x86_64-apple-darwin.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/wasi-master/wmpy/releases/download/v#{version}/wmpy-aarch64-unknown-linux-musl.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
    on_intel do
      url "https://github.com/wasi-master/wmpy/releases/download/v#{version}/wmpy-x86_64-unknown-linux-musl.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  def install
    bin.install "wmpy"
    generate_completions_from_executable(bin/"wmpy", "completions")
  end

  test do
    assert_match "wmpy #{version}", shell_output("#{bin}/wmpy --version")
  end
end

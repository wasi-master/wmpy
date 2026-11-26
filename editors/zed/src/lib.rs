//! wmpy for Zed: starts `wmpy lsp` for Python files and plugin.json, and
//! gives Zed's JSON language server the plugin.json schema.
//!
//! The program comes from `lsp.wmpy.binary.path` in the settings, then
//! `PATH`, then the matching asset of the latest wmpy release on GitHub,
//! downloaded into this extension's work folder. Zed has no webviews, so the
//! server is told `{"preview": "browser"}`: the ▶ Preview code lens opens
//! the preview in the browser.

use std::fs;

use zed_extension_api::settings::LspSettings;
use zed_extension_api::{self as zed, serde_json, LanguageServerId, Result};

const SERVER: &str = "wmpy";
const REPO: &str = "wasi-master/wmpy";
const SCHEMA: &str = include_str!("../../schemas/plugin.schema.json");

struct Wmpy {
    cached: Option<String>,
}

/// The release asset for a platform, and the program's name inside it.
fn asset_for(os: zed::Os, arch: zed::Architecture) -> Result<(String, zed::DownloadedFileType, &'static str)> {
    let triple = match (os, arch) {
        (zed::Os::Mac, zed::Architecture::Aarch64) => "aarch64-apple-darwin",
        (zed::Os::Mac, zed::Architecture::X8664) => "x86_64-apple-darwin",
        (zed::Os::Linux, zed::Architecture::Aarch64) => "aarch64-unknown-linux-musl",
        (zed::Os::Linux, zed::Architecture::X8664) => "x86_64-unknown-linux-musl",
        (zed::Os::Windows, zed::Architecture::Aarch64) => "aarch64-pc-windows-msvc",
        (zed::Os::Windows, zed::Architecture::X8664) => "x86_64-pc-windows-msvc",
        _ => return Err("wmpy has no build for this computer. Install it with cargo and put it on PATH.".into()),
    };
    Ok(match os {
        zed::Os::Windows => (format!("wmpy-{triple}.zip"), zed::DownloadedFileType::Zip, "wmpy.exe"),
        _ => (format!("wmpy-{triple}.tar.gz"), zed::DownloadedFileType::GzipTar, "wmpy"),
    })
}

fn is_file(path: &str) -> bool {
    fs::metadata(path).is_ok_and(|m| m.is_file())
}

impl Wmpy {
    fn settings(worktree: &zed::Worktree) -> LspSettings {
        LspSettings::for_worktree(SERVER, worktree).unwrap_or_default()
    }

    /// The program and its environment, downloading it when it is nowhere else.
    fn program(&mut self, id: &LanguageServerId, worktree: &zed::Worktree) -> Result<(String, Vec<(String, String)>)> {
        if let Some(path) = Self::settings(worktree).binary.and_then(|b| b.path) {
            return Ok((path, Vec::new()));
        }
        if let Some(path) = worktree.which("wmpy") {
            return Ok((path, worktree.shell_env()));
        }
        if let Some(path) = &self.cached {
            if is_file(path) {
                return Ok((path.clone(), Vec::new()));
            }
        }
        let path = self.download(id)?;
        self.cached = Some(path.clone());
        Ok((path, Vec::new()))
    }

    fn download(&self, id: &LanguageServerId) -> Result<String> {
        zed::set_language_server_installation_status(id, &zed::LanguageServerInstallationStatus::CheckingForUpdate);
        let release = zed::latest_github_release(REPO, zed::GithubReleaseOptions { require_assets: true, pre_release: false })?;
        let (os, arch) = zed::current_platform();
        let (name, kind, exe) = asset_for(os, arch)?;
        let asset = release
            .assets
            .iter()
            .find(|a| a.name == name)
            .ok_or_else(|| format!("the wmpy {} release has no {name}", release.version))?;
        let dir = format!("wmpy-{}", release.version);
        let path = format!("{dir}/{exe}");
        if !is_file(&path) {
            zed::set_language_server_installation_status(id, &zed::LanguageServerInstallationStatus::Downloading);
            zed::download_file(&asset.download_url, &dir, kind).map_err(|e| format!("downloading {name}: {e}"))?;
            zed::make_file_executable(&path)?;
            // Older downloads are no longer needed.
            if let Ok(entries) = fs::read_dir(".") {
                for entry in entries.flatten() {
                    let n = entry.file_name().to_string_lossy().to_string();
                    if n.starts_with("wmpy-") && n != dir {
                        fs::remove_dir_all(entry.path()).ok();
                    }
                }
            }
        }
        zed::set_language_server_installation_status(id, &zed::LanguageServerInstallationStatus::None);
        Ok(path)
    }
}

/// [user]'s keys over [base]'s, one level deep.
fn merged(base: serde_json::Value, user: Option<serde_json::Value>) -> serde_json::Value {
    match (base, user) {
        (serde_json::Value::Object(mut b), Some(serde_json::Value::Object(u))) => {
            b.extend(u);
            serde_json::Value::Object(b)
        }
        (b, None) => b,
        (_, Some(u)) => u,
    }
}

impl zed::Extension for Wmpy {
    fn new() -> Self {
        Self { cached: None }
    }

    fn language_server_command(&mut self, id: &LanguageServerId, worktree: &zed::Worktree) -> Result<zed::Command> {
        let (command, env) = self.program(id, worktree)?;
        let args = Self::settings(worktree).binary.and_then(|b| b.arguments).unwrap_or_else(|| vec!["lsp".into()]);
        Ok(zed::Command { command, args, env })
    }

    fn language_server_initialization_options(&mut self, _id: &LanguageServerId, worktree: &zed::Worktree) -> Result<Option<serde_json::Value>> {
        let base = serde_json::json!({"preview": "browser"});
        Ok(Some(merged(base, Self::settings(worktree).initialization_options)))
    }

    fn language_server_workspace_configuration(&mut self, _id: &LanguageServerId, worktree: &zed::Worktree) -> Result<Option<serde_json::Value>> {
        Ok(Self::settings(worktree).settings)
    }

    fn language_server_additional_workspace_configuration(
        &mut self,
        _id: &LanguageServerId,
        target: &LanguageServerId,
        _worktree: &zed::Worktree,
    ) -> Result<Option<serde_json::Value>> {
        if target.as_ref() != "json-language-server" {
            return Ok(None);
        }
        let schema: serde_json::Value = serde_json::from_str(SCHEMA).map_err(|e| e.to_string())?;
        Ok(Some(serde_json::json!({
            "json": {"schemas": [{"fileMatch": ["plugin.json"], "schema": schema}]}
        })))
    }
}

zed::register_extension!(Wmpy);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_platform_has_its_asset() {
        let (name, _, exe) = asset_for(zed::Os::Mac, zed::Architecture::Aarch64).unwrap();
        assert_eq!((name.as_str(), exe), ("wmpy-aarch64-apple-darwin.tar.gz", "wmpy"));
        let (name, _, exe) = asset_for(zed::Os::Windows, zed::Architecture::X8664).unwrap();
        assert_eq!((name.as_str(), exe), ("wmpy-x86_64-pc-windows-msvc.zip", "wmpy.exe"));
        assert!(asset_for(zed::Os::Linux, zed::Architecture::X86).is_err());
    }

    #[test]
    fn user_options_win_over_ours() {
        let got = merged(serde_json::json!({"preview": "browser"}), Some(serde_json::json!({"preview": "none", "x": 1})));
        assert_eq!(got, serde_json::json!({"preview": "none", "x": 1}));
        assert_eq!(merged(serde_json::json!({"preview": "browser"}), None), serde_json::json!({"preview": "browser"}));
    }

    #[test]
    fn the_schema_parses() {
        let v: serde_json::Value = serde_json::from_str(SCHEMA).unwrap();
        assert!(v["definitions"]["manifest"].is_object());
    }
}

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

const MAX_INPUT_BYTES: usize = 200 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(180);
static NEXT: AtomicU64 = AtomicU64::new(0);

const POWERPOINT_SCRIPT: &str = "$ErrorActionPreference = 'Stop'; \
  $app = New-Object -ComObject PowerPoint.Application; \
  $deck = $app.Presentations.Open($env:CRYSTAL_CONVERT_IN, $true, $false, $false); \
  try { $deck.SaveAs($env:CRYSTAL_CONVERT_OUT, 32) } finally { $deck.Close(); \
  if ($app.Presentations.Count -eq 0) { $app.Quit() } }";

const WORD_SCRIPT: &str = "$ErrorActionPreference = 'Stop'; \
  $app = New-Object -ComObject Word.Application; \
  $doc = $app.Documents.Open($env:CRYSTAL_CONVERT_IN, $false, $true); \
  try { $doc.ExportAsFixedFormat($env:CRYSTAL_CONVERT_OUT, 17) } finally { $doc.Close(0); \
  if ($app.Documents.Count -eq 0) { $app.Quit() } }";

#[derive(Debug, PartialEq, Clone, Copy)]
enum Kind {
  Slides,
  Document,
  Html,
}

fn kind_of(name: &str) -> Option<(Kind, &'static str)> {
  let ext = name.rsplit_once('.')?.1.to_ascii_lowercase();
  match ext.as_str() {
    "pptx" => Some((Kind::Slides, "pptx")),
    "ppt" => Some((Kind::Slides, "ppt")),
    "docx" => Some((Kind::Document, "docx")),
    "html" => Some((Kind::Html, "html")),
    "htm" => Some((Kind::Html, "htm")),
    _ => None,
  }
}

fn program_files(relative: &str) -> Option<PathBuf> {
  ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"]
    .iter()
    .filter_map(|var| std::env::var_os(var))
    .map(|base| Path::new(&base).join(relative))
    .find(|path| path.is_file())
}

fn quiet(mut command: Command) -> Command {
  command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000);
  }
  command
}

fn run(command: Command) -> Result<(), String> {
  let mut child = quiet(command).spawn().map_err(|e| e.to_string())?;
  let started = Instant::now();
  loop {
    match child.try_wait().map_err(|e| e.to_string())? {
      Some(status) if status.success() => return Ok(()),
      Some(status) => return Err(format!("the converter exited with {status}")),
      None if started.elapsed() > TIMEOUT => {
        let _ = child.kill();
        return Err("the converter took too long".into());
      }
      None => std::thread::sleep(Duration::from_millis(100)),
    }
  }
}

fn office_to_pdf(dir: &Path, input: &Path, output: &Path, script: &str, app: &str, what: &str) -> Result<(), String> {
  let mut tried = Vec::new();
  if cfg!(windows) {
    let mut office = Command::new("powershell");
    office
      .args(["-NoProfile", "-NonInteractive", "-Command", script])
      .env("CRYSTAL_CONVERT_IN", input)
      .env("CRYSTAL_CONVERT_OUT", output);
    match run(office) {
      Ok(()) if output.is_file() => return Ok(()),
      Ok(()) => tried.push(format!("{app} wrote no PDF")),
      Err(err) => tried.push(format!("{app}: {err}")),
    }
  }
  let soffice = program_files("LibreOffice/program/soffice.exe").unwrap_or_else(|| PathBuf::from("soffice"));
  let mut libreoffice = Command::new(soffice);
  libreoffice.args(["--headless", "--convert-to", "pdf", "--outdir"]).arg(dir).arg(input);
  match run(libreoffice) {
    Ok(()) if output.is_file() => return Ok(()),
    Ok(()) => tried.push("LibreOffice wrote no PDF".to_string()),
    Err(err) => tried.push(format!("LibreOffice: {err}")),
  }
  Err(format!("Converting {what} needs {app} or LibreOffice ({})", tried.join("; ")))
}

fn html_to_pdf(dir: &Path, input: &Path, output: &Path) -> Result<(), String> {
  let browser = program_files("Microsoft/Edge/Application/msedge.exe")
    .or_else(|| program_files("Google/Chrome/Application/chrome.exe"))
    .ok_or("Converting HTML needs Microsoft Edge or Google Chrome")?;
  let url = tauri::Url::from_file_path(input).map_err(|_| "Could not address the HTML file")?;
  let mut command = Command::new(browser);
  command
    .args(["--headless", "--disable-gpu", "--no-first-run", "--disable-extensions", "--no-pdf-header-footer"])
    .arg(format!("--user-data-dir={}", dir.join("profile").display()))
    .arg(format!("--print-to-pdf={}", output.display()))
    .arg(url.as_str());
  run(command).map_err(|err| format!("Could not convert the HTML file: {err}"))?;
  if output.is_file() {
    Ok(())
  } else {
    Err("The browser wrote no PDF".into())
  }
}

fn convert(name: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
  let (kind, ext) = kind_of(name).ok_or("Only .pptx, .ppt, .docx, .html and .htm files can be converted")?;
  let dir = std::env::temp_dir().join(format!("crystal-os-convert-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let input = dir.join(format!("input.{ext}"));
  let output = dir.join("input.pdf");
  let result = std::fs::write(&input, bytes)
    .map_err(|e| e.to_string())
    .and_then(|()| match kind {
      Kind::Slides => office_to_pdf(&dir, &input, &output, POWERPOINT_SCRIPT, "PowerPoint", "slides"),
      Kind::Document => office_to_pdf(&dir, &input, &output, WORD_SCRIPT, "Word", "documents"),
      Kind::Html => html_to_pdf(&dir, &input, &output),
    })
    .and_then(|()| std::fs::read(&output).map_err(|e| e.to_string()));
  let _ = std::fs::remove_dir_all(&dir);
  result
}

#[tauri::command]
pub async fn convert_to_pdf(name: String, data: String) -> Result<tauri::ipc::Response, String> {
  if data.len() > MAX_INPUT_BYTES / 3 * 4 + 4 {
    return Err("File is too large to convert".into());
  }
  tauri::async_runtime::spawn_blocking(move || {
    let bytes = BASE64.decode(data).map_err(|err| format!("invalid data: {err}"))?;
    convert(&name, &bytes).map(tauri::ipc::Response::new)
  })
  .await
  .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_slides_documents_and_html_convert() {
    assert_eq!(kind_of("Week 1.PPTX"), Some((Kind::Slides, "pptx")));
    assert_eq!(kind_of("old.ppt"), Some((Kind::Slides, "ppt")));
    assert_eq!(kind_of("Lab 2.DOCX"), Some((Kind::Document, "docx")));
    assert_eq!(kind_of("old.doc"), None);
    assert_eq!(kind_of("outline.final.html"), Some((Kind::Html, "html")));
    assert_eq!(kind_of("page.htm"), Some((Kind::Html, "htm")));
    assert_eq!(kind_of("notes.pdf"), None);
    assert_eq!(kind_of("../evil.exe"), None);
    assert_eq!(kind_of("pptx"), None);
  }

  #[test]
  fn rejects_other_files_before_touching_disk() {
    assert!(convert("notes.txt", b"hi").is_err());
  }
}

/**
 * Settings → Install & update: update in place to the newest signed release,
 * pick a published release and save its Windows installer, or build one from a
 * local checkout when a release has no asset or has not been cut yet. The work
 * runs in Rust; see src-tauri/src/installer.rs for why none of it can happen
 * in the webview, and src-tauri/src/updater.rs for the in-place update.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CircleArrowUp, CircleStop, Download, FolderOpen, Hammer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildInstaller,
  cancelBuild,
  checkForUpdate,
  compareVersions,
  downloadInstaller,
  formatBytes,
  installerStatus,
  installUpdate,
  listReleases,
  onBuildProgress,
  onDownloadProgress,
  onUpdateProgress,
  pickSourceFolder,
  releaseStanding,
  revealFile,
  type InstallerStatus,
  type Release,
  type UpdateInfo,
  type UpdateProgress,
} from "@/lib/installerNative";

/** Build output kept in view. Older lines fall off the top. */
const MAX_LOG_LINES = 400;

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** `17 Sep 2026`, or empty when GitHub gave no date. */
function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The version the panel offers first: the newest stable release that actually
 * has an installer attached. Prereleases stay selectable but are never the
 * default, and a release with no asset is no use to the Download button.
 */
function defaultTag(releases: Release[]): string | null {
  const newest = (list: Release[]) =>
    list.reduce<Release | null>((best, release) => (!best || compareVersions(release.version, best.version) > 0 ? release : best), null);
  const withAsset = releases.filter((release) => release.asset);
  return (newest(withAsset.filter((release) => !release.prerelease)) ?? newest(withAsset) ?? releases[0])?.tag ?? null;
}

export default function InstallerSection() {
  const [status, setStatus] = useState<InstallerStatus | null>(null);
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [downloaded, setDownloaded] = useState<string | null>(null);

  /** Null until checked, "none" when up to date, else the update found. */
  const [update, setUpdate] = useState<UpdateInfo | "none" | null>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState<UpdateProgress | null>(null);

  const [building, setBuilding] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [built, setBuilt] = useState<string | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await installerStatus();
      setStatus(next);
      // A download or build started before this view mounted is still running
      // in Rust, so adopt it rather than showing idle buttons.
      setDownloading(next.downloading);
      setBuilding(next.building);
    } catch (err) {
      toast.error("Could not read the update status", { description: errorText(err) });
    }
  }, []);

  const refreshReleases = useCallback(async () => {
    setListError(null);
    try {
      const list = await listReleases();
      setReleases(list);
      setTag((current) => (current && list.some((release) => release.tag === current) ? current : defaultTag(list)));
    } catch (err) {
      setReleases([]);
      setListError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshReleases();
  }, [refreshStatus, refreshReleases]);

  useEffect(
    () =>
      onDownloadProgress((event) => {
        if (!event.done) {
          setProgress({ received: event.received, total: event.total });
          return;
        }
        setDownloading(false);
        setProgress(null);
        if (event.path) setDownloaded(event.path);
      }),
    [],
  );

  useEffect(
    () =>
      onBuildProgress((event) => {
        const line = event.line;
        if (line !== null) setLog((lines) => [...lines, line].slice(-MAX_LOG_LINES));
        if (event.done) {
          setBuilding(false);
          if (event.path) setBuilt(event.path);
        }
      }),
    [],
  );

  useEffect(() => onUpdateProgress(setUpdating), []);

  useEffect(() => {
    if (log.length) logEnd.current?.scrollIntoView({ block: "end" });
  }, [log]);

  const selected = releases?.find((release) => release.tag === tag) ?? null;

  const startDownload = async () => {
    if (!tag) return;
    setDownloading(true);
    setDownloaded(null);
    setProgress({ received: 0, total: selected?.asset?.size ?? 0 });
    try {
      const path = await downloadInstaller(tag);
      toast.success("Installer saved", { description: path });
    } catch (err) {
      toast.error("Download failed", { description: errorText(err) });
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  const checkUpdate = async () => {
    setChecking(true);
    try {
      setUpdate((await checkForUpdate()) ?? "none");
    } catch (err) {
      setUpdate(null);
      toast.error("Could not check for updates", { description: errorText(err) });
    } finally {
      setChecking(false);
    }
  };

  const startUpdate = async () => {
    setUpdating({ received: 0, total: 0, installing: false });
    try {
      // Success never returns: the app exits as the installer starts.
      await installUpdate();
    } catch (err) {
      toast.error("Update failed", { description: errorText(err) });
      setUpdating(null);
    }
  };

  const chooseSource = async () => {
    try {
      const picked = await pickSourceFolder();
      if (!picked) return;
      await refreshStatus();
      toast.success("Source folder set", { description: picked });
    } catch (err) {
      toast.error("Could not use that folder", { description: errorText(err) });
    }
  };

  const startBuild = async () => {
    setBuilding(true);
    setBuilt(null);
    setLog([]);
    try {
      const path = await buildInstaller();
      toast.success("Installer built", { description: path });
    } catch (err) {
      toast.error("Build failed", { description: errorText(err) });
    } finally {
      setBuilding(false);
    }
  };

  const stopBuild = async () => {
    try {
      await cancelBuild();
    } catch (err) {
      toast.error("Could not stop the build", { description: errorText(err) });
    }
  };

  const reveal = async (path: string) => {
    try {
      await revealFile(path);
    } catch (err) {
      toast.error("Could not open the folder", { description: errorText(err) });
    }
  };

  const percent = progress && progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null;
  const updatePercent =
    updating && updating.total > 0 ? Math.min(100, Math.round((updating.received / updating.total) * 100)) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">Installed version</p>
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {status ? `v${status.currentVersion} · releases from ${status.repo}` : "Reading…"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refreshReleases()} disabled={releases === null}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* ---------- Update in place ---------- */}
      <div className="space-y-3 border-t border-white/[0.06] pt-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Check for updates</p>
          <p className="text-xs text-muted-foreground">
            Downloads the newest release, checks its signature, and installs it. Crystal OS closes while the installer runs and opens again
            when it is done.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void checkUpdate()} disabled={checking || updating !== null}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : "Check for updates"}
          </Button>
          {update && update !== "none" && (
            <Button size="sm" onClick={() => void startUpdate()} disabled={updating !== null}>
              <CircleArrowUp className="mr-2 h-3.5 w-3.5" />
              {updating ? "Updating…" : `Update to v${update.version}`}
            </Button>
          )}
        </div>

        {update === "none" && <p className="text-xs text-muted-foreground">You have the latest release.</p>}
        {update && update !== "none" && !updating && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              v{update.version} is available (you have v{update.currentVersion}).
            </p>
            {update.notes && (
              <p className="line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground/80 [overflow-wrap:anywhere]">{update.notes}</p>
            )}
          </div>
        )}

        {updating && (
          <div className="space-y-1">
            <Progress value={updating.installing ? 100 : (updatePercent ?? undefined)} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {updating.installing
                ? "Starting the installer…"
                : updating.total > 0
                  ? `${formatBytes(updating.received)} of ${formatBytes(updating.total)} · ${updatePercent}%`
                  : updating.received > 0
                    ? `${formatBytes(updating.received)} downloaded`
                    : "Downloading…"}
            </p>
          </div>
        )}
      </div>

      {/* ---------- Download a published release ---------- */}
      <div className="space-y-3 border-t border-white/[0.06] pt-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Download an installer</p>
          <p className="text-xs text-muted-foreground">
            The newest release with an installer attached is chosen for you. Pick another version to install that one instead.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={tag ?? undefined} onValueChange={setTag} disabled={!releases?.length || downloading}>
            <SelectTrigger className="w-full sm:w-[19rem]" aria-label="Release to download">
              <SelectValue placeholder={releases === null ? "Loading releases…" : "No releases published"} />
            </SelectTrigger>
            <SelectContent>
              {releases?.map((release) => {
                const standing = status ? releaseStanding(release, status.currentVersion) : "older";
                const notes = [
                  standing === "current" ? "installed" : standing === "newer" ? "newer" : null,
                  release.prerelease ? "pre-release" : null,
                  release.asset ? null : "no installer",
                ].filter(Boolean);
                return (
                  <SelectItem key={release.tag} value={release.tag}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{release.name}</span>
                      {notes.length > 0 && <span className="text-xs text-muted-foreground">({notes.join(", ")})</span>}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Button size="sm" onClick={() => void startDownload()} disabled={!selected?.asset || downloading}>
            <Download className="mr-2 h-3.5 w-3.5" />
            {downloading ? "Downloading…" : "Download"}
          </Button>
          {downloaded && !downloading && (
            <Button variant="outline" size="sm" onClick={() => void reveal(downloaded)}>
              <FolderOpen className="mr-2 h-3.5 w-3.5" />
              Show in folder
            </Button>
          )}
        </div>

        {selected &&
          (selected.asset ? (
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {[selected.asset.name, formatBytes(selected.asset.size), formatDate(selected.publishedAt)].filter(Boolean).join(" · ")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              This release has no Windows installer attached. Build it from source below, or pick another version.
            </p>
          ))}

        {listError && <p className="text-xs text-red-400 [overflow-wrap:anywhere]">Could not list releases: {listError}</p>}

        {downloading && (
          <div className="space-y-1">
            <Progress value={percent ?? undefined} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {progress && progress.total > 0
                ? `${formatBytes(progress.received)} of ${formatBytes(progress.total)} · ${percent}%`
                : `${formatBytes(progress?.received ?? 0)} downloaded`}
            </p>
          </div>
        )}
      </div>

      {/* ---------- Build from a local checkout ---------- */}
      <div className="space-y-3 border-t border-white/[0.06] pt-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Build the latest from source</p>
          <p className="text-xs text-muted-foreground">
            Runs <code className="rounded bg-white/[0.06] px-1 py-0.5">npm run build:desktop</code> in a Crystal OS checkout. Needs Node.js
            and the Rust toolchain, and takes several minutes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void chooseSource()} disabled={building}>
            <FolderOpen className="mr-2 h-3.5 w-3.5" />
            {status?.sourceDir ? "Change folder" : "Choose folder"}
          </Button>
          <Button size="sm" onClick={() => void startBuild()} disabled={building || !status?.sourceOk}>
            <Hammer className="mr-2 h-3.5 w-3.5" />
            {building ? "Building…" : "Build installer"}
          </Button>
          {building && (
            <Button variant="outline" size="sm" onClick={() => void stopBuild()}>
              <CircleStop className="mr-2 h-3.5 w-3.5" />
              Stop
            </Button>
          )}
          {built && !building && (
            <Button variant="outline" size="sm" onClick={() => void reveal(built)}>
              <FolderOpen className="mr-2 h-3.5 w-3.5" />
              Show in folder
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {!status?.sourceDir
            ? "No source folder chosen yet."
            : status.sourceOk
              ? status.sourceDir
              : `Not a Crystal OS checkout any more: ${status.sourceDir}`}
        </p>

        {log.length > 0 && (
          <ScrollArea className="h-48 rounded-md border border-white/10 bg-black/40">
            <div className="terminal-font p-3 text-[11px] leading-relaxed text-neutral-300">
              {log.map((line, index) => (
                <p key={index} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {line}
                </p>
              ))}
              <div ref={logEnd} />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

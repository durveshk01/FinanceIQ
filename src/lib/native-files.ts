import { Capacitor } from "@capacitor/core";

export async function downloadOrShare(
  blob: Blob,
  filename: string,
): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () =>
        reject(new Error("Could not prepare the file for Android."));
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(blob);
    });
    const path = `financeiq-exports/${filename}`;
    const written = await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    try {
      await Share.share({
        title: "FinanceIQ Report",
        files: [written.uri],
        dialogTitle: "Save or share your FinanceIQ report",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Share canceled")
        return "Sharing canceled. The export remains in private app cache.";
      throw error;
    }
    return "Android share sheet opened. Choose an app or save destination.";
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to begin reading the object URL before revoking it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return `Downloaded ${filename}.`;
}

export async function clearNativeExports(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  try {
    await Filesystem.rmdir({
      path: "financeiq-exports",
      directory: Directory.Cache,
      recursive: true,
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "OS-PLUG-FILE-0008"
    )
      return;
    throw error;
  }
}

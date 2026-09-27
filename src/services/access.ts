import { PermissionsAndroid, Platform } from "react-native";
import { isScannerAvailable, scanner, type StorageAccess } from "@/native/scanner";
import { setState } from "@/state/store";

export function refreshAccess(): StorageAccess | null {
  if (!isScannerAvailable) return null;
  const access = scanner().getStorageAccess();
  setState({ access });
  return access;
}

/**
 * Asks for the broadest storage access the platform offers:
 * Android 11+ opens the "All files access" settings page; Android 10 and below show the read permission dialog.
 * Returns true when access is already available without leaving the app.
 */
export async function requestFullAccess(): Promise<boolean> {
  const access = refreshAccess();
  if (!access || Platform.OS !== "android") return false;
  if (access.allFilesAccess) return true;
  if (access.canRequestAllFilesAccess) {
    scanner().openAllFilesAccessSettings();
    return false;
  }
  if (access.needsReadPermission) {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE, {
      title: "Find your documents",
      message: "Dera Library reads your storage to list documents. Files are never moved, uploaded or changed.",
      buttonPositive: "Allow",
      buttonNegative: "Not now",
    });
    refreshAccess();
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  return false;
}

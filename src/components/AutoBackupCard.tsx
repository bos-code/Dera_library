import { useState } from "react";
import { Text, View } from "react-native";
import { formatRelativeDate } from "@/lib/format";
import { useQuery } from "@/lib/useQuery";
import { backupNow, chooseBackupFolder, getAutoBackup, turnOffAutoBackup } from "@/services/autoBackup";
import { showToast } from "@/services/toast";
import { notifyLibraryChanged } from "@/state/store";
import { spacing, type, useTheme } from "@/theme";
import { Button } from "./ui";

/** Weekly automatic backups to a folder the user picks (a cloud-synced folder works too). */
export function AutoBackupCard() {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery(getAutoBackup, []);
  if (!data) return null;

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
      notifyLibraryChanged();
    }
  };

  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      <Text style={[type.bodyStrong, { color: t.text }]}>Automatic weekly backup</Text>
      <Text style={[type.small, { color: data.lastError ? t.warning : t.textMuted }]}>
        {data.lastError ??
          (data.folderUri
            ? `To “${data.folderLabel}”${data.lastAt ? ` · last backup ${formatRelativeDate(data.lastAt).toLowerCase()}` : ""}. The 4 newest are kept.`
            : "Off. Choose a folder and Dera saves a backup there every week.")}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button
          label={data.folderUri ? "Change folder" : "Choose folder"}
          icon="folder-sync-outline"
          busy={busy}
          onPress={() => run(chooseBackupFolder)}
          style={{ flex: 1 }}
        />
        {data.folderUri ? (
          <Button
            label="Back up now"
            icon="content-save-outline"
            busy={busy}
            onPress={() =>
              run(async () => {
                const r = await backupNow();
                showToast(r === "ok" ? "Backup saved" : "Backup failed");
              })
            }
            style={{ flex: 1 }}
          />
        ) : null}
      </View>
      {data.folderUri ? (
        <Button label="Turn off automatic backup" variant="ghost" onPress={() => run(turnOffAutoBackup)} />
      ) : null}
    </View>
  );
}

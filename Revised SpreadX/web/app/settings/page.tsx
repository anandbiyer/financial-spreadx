import { SettingsView } from "@/components/SettingsView";
import { runOp } from "@/lib/python";

export const dynamic = "force-dynamic";

interface Settings {
  llm_provider: string;
  llm_model: string;
  confidence_threshold: number;
}

export default async function SettingsPage() {
  const settings = await runOp<Settings>("get_settings", {});
  return <SettingsView initial={settings} />;
}

import { History, PanelsTopLeft } from "lucide-react";
import type { StudioSkin } from "../lib/theme";

export function SkinSelector({
  skin,
  onChange,
}: {
  skin: StudioSkin;
  onChange: (skin: StudioSkin) => void;
}) {
  return (
    <div className="skin-selector" role="group" aria-label="界面样式">
      <button
        type="button"
        aria-label="切换到 Atelier 界面"
        aria-pressed={skin === "atelier"}
        title="Atelier 界面"
        onClick={() => onChange("atelier")}
      >
        <PanelsTopLeft size={16} aria-hidden />
      </button>
      <button
        type="button"
        aria-label="切换到经典界面"
        aria-pressed={skin === "classic"}
        title="经典界面"
        onClick={() => onChange("classic")}
      >
        <History size={16} aria-hidden />
      </button>
    </div>
  );
}

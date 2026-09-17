import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useHarness } from "@/hooks/useHarness";
import { harness } from "@/lib/harness/store";

const COLOR_LABELS = ["Core", "Drift", "Glow"];

/** Nebula colours, swirl speed, and stars. Used in the tab's popover and in Settings. */
export default function NebulaThemeControls() {
  const { theme } = useHarness();

  const setColor = (index: number, value: string) => {
    const colors = [...theme.colors] as [string, string, string];
    colors[index] = value;
    harness.setTheme({ colors });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Colours</p>
        <div className="flex gap-3">
          {theme.colors.map((color, index) => (
            <label key={index} className="flex flex-1 flex-col items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(index, e.target.value)}
                className="nebula-color-input h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                aria-label={`${COLOR_LABELS[index]} colour`}
              />
              {COLOR_LABELS[index]}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium uppercase tracking-wider text-muted-foreground">Swirl speed</span>
          <span className="tabular-nums text-muted-foreground">{theme.swirlSpeed === 0 ? "Still" : `${theme.swirlSpeed.toFixed(1)}×`}</span>
        </div>
        <Slider min={0} max={3} step={0.1} value={[theme.swirlSpeed]} onValueChange={([v]) => harness.setTheme({ swirlSpeed: v })} aria-label="Swirl speed" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Twinkling stars</span>
          <Switch checked={theme.stars.enabled} onCheckedChange={(enabled) => harness.setTheme({ stars: { ...theme.stars, enabled } })} aria-label="Twinkling stars" />
        </div>
        {theme.stars.enabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Density</span>
              <span className="tabular-nums">{Math.round(theme.stars.density * 100)}%</span>
            </div>
            <Slider min={0.05} max={1} step={0.05} value={[theme.stars.density]} onValueChange={([v]) => harness.setTheme({ stars: { ...theme.stars, density: v } })} aria-label="Star density" />
          </div>
        )}
      </div>

      <Button variant="ghost" size="sm" className="w-full" onClick={() => harness.resetTheme()}>
        <RotateCcw className="mr-2 h-3.5 w-3.5" />
        Reset look
      </Button>
    </div>
  );
}

import { useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LocateFixed } from "lucide-react";
import {
  cityListQuery,
  getPosition,
  locationErrorMessage,
  nearestCity,
  NEAREST_CITY_MAX_KM,
} from "@/hooks/useWeather";

export function LocationDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (cityId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (locating) return;
    if (!next) setError(null);
    onOpenChange(next);
  };

  const locate = async () => {
    setLocating(true);
    setError(null);
    let position: { lat: number; lon: number };
    try {
      position = await getPosition();
    } catch (err) {
      setLocating(false);
      setError(locationErrorMessage(err));
      return;
    }
    try {
      const cities = await queryClient.fetchQuery(cityListQuery);
      const city = nearestCity(cities, position.lat, position.lon);
      if (!city) {
        setError(
          `No Environment Canada location within ${NEAREST_CITY_MAX_KM} km of you.`,
        );
        return;
      }
      onPick(city.id);
      onOpenChange(false);
    } catch {
      setError("The location list could not be loaded. Try again.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="atmo-dialog-overlay fixed inset-0 z-50" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
          <AlertDialog.Content className="atmo-dialog pointer-events-auto w-full max-w-sm p-6 outline-none">
            <div className="flex items-start gap-4">
              <div className="atmo-dialog-icon shrink-0 rounded-xl p-3">
                <LocateFixed className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <AlertDialog.Title className="text-base font-semibold text-foreground">
                  Use your location?
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-1 text-sm text-muted-foreground">
                  Crystal OS asks your system for a rough position once to pick
                  the nearest Environment Canada location. It is not stored or
                  sent anywhere.
                </AlertDialog.Description>
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-4 text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel
                disabled={locating}
                className="atmo-dialog-btn rounded-lg px-4 py-2 text-sm text-foreground/80 transition-colors hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </AlertDialog.Cancel>
              <button
                type="button"
                onClick={locate}
                disabled={locating}
                className="atmo-dialog-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-70"
              >
                {locating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="h-3.5 w-3.5" />
                )}
                {locating
                  ? "Finding your location…"
                  : error
                    ? "Try again"
                    : "Use my location"}
              </button>
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

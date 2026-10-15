import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { atmosphere, useAtmosphere } from "@/lib/atmosphereStore";
import { cityListQuery, getPosition, nearestCity } from "@/hooks/useWeather";

let ran = false;

export function useAutoLocate() {
  const { autoLocate } = useAtmosphere();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!autoLocate || ran) return;
    ran = true;
    (async () => {
      const position = await getPosition();
      const cities = await queryClient.fetchQuery(cityListQuery);
      const city = nearestCity(cities, position.lat, position.lon);
      if (city) atmosphere.setCity(city.id);
    })().catch(() => {});
  }, [autoLocate, queryClient]);
}

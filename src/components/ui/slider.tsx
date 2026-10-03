import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    data-smooth=""
    className={cn("smooth-slider relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderPrimitive.Range data-smooth="" className="smooth-slider-range absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb data-smooth="" className="block h-5 w-5 cursor-grab rounded-full border-2 border-primary bg-background ring-offset-background transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out hover:scale-110 hover:shadow-[0_0_10px_hsl(var(--primary)/0.45)] active:cursor-grabbing active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };

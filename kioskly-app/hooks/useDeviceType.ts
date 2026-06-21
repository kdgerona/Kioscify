import { useWindowDimensions } from "react-native";

export const TABLET_BREAKPOINT = 768;

export type DeviceType = "phone" | "tablet";

// Portrait always gets the phone layout, even on a tablet — there's no room for the
// 3-panel tablet layout in a narrow vertical viewport. Landscape still picks by width,
// so a tablet rotated to landscape keeps its full layout.
export function useDeviceType(): DeviceType {
  const { width, height } = useWindowDimensions();
  const isPortrait = height >= width;
  if (isPortrait) return "phone";
  return width < TABLET_BREAKPOINT ? "phone" : "tablet";
}

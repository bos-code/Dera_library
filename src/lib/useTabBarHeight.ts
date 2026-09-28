import { BottomTabBarHeightContext } from "expo-router/js-tabs";
import { useContext } from "react";

/**
 * Height of the floating tab bar, or 0 when the screen is not inside the tab navigator.
 *
 * The tab bar is absolutely positioned so content scrolls (and blurs) underneath it, which means
 * every scroll view owes it that much bottom padding. useBottomTabBarHeight() throws outside a
 * tab screen and DocumentBrowser is also used by collection, tag and missing screens, so we read
 * the context directly and fall back to 0.
 */
export function useTabBarHeight(): number {
  return useContext(BottomTabBarHeightContext) ?? 0;
}

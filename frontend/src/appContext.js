import { createContext, useContext } from "react";

/* Navigation and workspace actions shared by the shell and every view. */
export const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

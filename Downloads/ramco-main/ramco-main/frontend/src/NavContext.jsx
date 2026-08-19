import { createContext, useContext } from 'react';

export const NavContext = createContext({ open: false, setOpen: () => {} });

export function useNav() {
  return useContext(NavContext);
}

import { createContext, useContext } from 'react';

export const UserContext = createContext<string>('');

export function useUserId() {
  return useContext(UserContext);
}

import { createContext, useContext } from 'react';
export const MeCtx = createContext(null);
export const useMe = () => useContext(MeCtx);
export const canWrite = (me) => !!me && me.role !== 'viewer';

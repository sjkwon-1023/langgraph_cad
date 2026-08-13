import { createContext, useContext } from 'react';

const EMPTY = { flaggedNodeIds: new Set(), flaggedEdgeIds: new Set() };

/**
 * Which elements the validator flagged. Kept out of node/edge state so that
 * highlighting never leaks into the saved graph.
 */
export const ValidationContext = createContext(EMPTY);

export const useIsFlaggedNode = (id) => useContext(ValidationContext).flaggedNodeIds.has(id);
export const useIsFlaggedEdge = (id) => useContext(ValidationContext).flaggedEdgeIds.has(id);

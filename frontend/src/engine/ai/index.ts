/**
 * AI Engine — Public API
 */

// Types
export type {
    AISuggestion,
    AISuggestedComponent,
    AISuggestedPin,
    AISuggestedNet,
    AISuggestedConnection,
    DiffAction,
    DiffItem,
    SuggestionDiff,
    SuggestionItemStatus,
    SuggestionPreviewItem,
    SuggestionPreviewState,
    UserEditLog,
} from './types';

// Diff
export { diffSuggestion } from './diffEngine';

// Merge
export {
    mergeSuggestion,
    getAcceptedIds,
    acceptAllSafe,
    rejectAll,
} from './mergeEngine';
export type { MergeResult } from './mergeEngine';

// Store
export { useSuggestionStore } from './suggestionStore';
export type { SuggestionStore } from './suggestionStore';

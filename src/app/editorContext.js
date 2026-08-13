import { createContext, useContext } from 'react';

export const EditorContext = createContext(null);

function useEditorContext() {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('EditorContext.Provider is required.');
  return editor;
}

export function useNodeEditor(nodeId) {
  const editor = useEditorContext();
  return {
    isEditing: editor.editingNodeId === nodeId,
    onEditClick: editor.onEditClick,
    onLabelUpdate: editor.onLabelUpdate,
    onEditCancel: editor.onEditCancel,
  };
}

export function useMarkGraphChanged() {
  return useEditorContext().onGraphChange;
}

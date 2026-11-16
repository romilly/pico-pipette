// Open and save files on the learner's computer.
// Chrome and Edge can save back to the same file; other browsers download a copy.

const PYTHON = [{ description: 'Python files', accept: { 'text/x-python': ['.py'] } }];

// Resolves to {name, text, handle}, or null if the learner cancels.
export async function openLocalFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: PYTHON });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.py,.txt';
    input.onchange = async () => {
      const file = input.files[0];
      resolve(file ? { name: file.name, text: await file.text(), handle: null } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// Saves text; returns the file handle to reuse next time (null when the browser downloads a copy,
// undefined if the learner cancels).
export async function saveLocalFile(name, text, handle) {
  if (window.showSaveFilePicker) {
    try {
      handle ??= await window.showSaveFilePicker({ suggestedName: name, types: PYTHON });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return handle;
    } catch (e) {
      if (e.name === 'AbortError') return undefined;
      throw e;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/x-python' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return null;
}

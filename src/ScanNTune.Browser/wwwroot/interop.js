// Small wrappers so .NET [JSImport] can call browser methods that need their own `this` (calling
// localStorage.getItem or window.open detached throws "Illegal invocation").
export function getItem(key) { return globalThis.localStorage.getItem(key); }
export function setItem(key, value) { globalThis.localStorage.setItem(key, value); }
export function removeItem(key) { globalThis.localStorage.removeItem(key); }
export function openUrl(url) { globalThis.open(url, "_blank"); }

// Trigger a browser download of base64-encoded bytes under the given filename.
export function downloadFile(name, base64, mime) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

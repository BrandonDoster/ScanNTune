// Small wrappers so .NET [JSImport] can call browser methods that need their own `this` (calling
// localStorage.getItem or window.open detached throws "Illegal invocation").
export function getItem(key) { return globalThis.localStorage.getItem(key); }
export function setItem(key, value) { globalThis.localStorage.setItem(key, value); }
export function removeItem(key) { globalThis.localStorage.removeItem(key); }
export function openUrl(url) { globalThis.open(url, "_blank"); }

// True when the primary pointer is a touch screen (phone/tablet). The shared UI uses this to turn off text
// entry in the numeric fields, since a mobile soft keyboard cannot type into them.
export function isTouchPrimary() { return globalThis.matchMedia("(pointer: coarse)").matches; }

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

let _pickedBytes = null;
let _activeFinish = null;

// Show a sheet with a real, directly-tapped <input type=file>. A genuine tap on the input is what lets iOS
// Safari open the file dialog (a programmatic click after an await does not, which is why Avalonia's own
// picker fails there). Resolves to "name\nlength" once a file is chosen and read, or null on cancel/dismiss.
export function pickImageFile(title) {
    // Only one sheet at a time: a second call (e.g. a double tap) dismisses the first rather than stacking.
    if (_activeFinish) _activeFinish(null);
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.55);display:flex;align-items:flex-end;justify-content:center;";

        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            if (_activeFinish === finish) _activeFinish = null;
            overlay.remove();
            resolve(value);
        };
        _activeFinish = finish;

        const sheet = document.createElement("div");
        sheet.style.cssText = "background:#24263a;color:#e6e8f0;width:100%;max-width:520px;box-sizing:border-box;border-radius:16px 16px 0 0;padding:20px;font-family:system-ui,sans-serif;";

        const heading = document.createElement("div");
        heading.textContent = title;
        heading.style.cssText = "font-size:15px;font-weight:500;margin-bottom:14px;";

        // Our own styled button is what the user sees; the real <input> is layered transparently over it, so
        // all of the browser's default file-input chrome (the plain button, the "No file chosen" text) is
        // hidden underneath and only this styling shows.
        const button = document.createElement("div");
        button.textContent = "Choose file";
        button.style.cssText = "position:relative;overflow:hidden;background:#3f6fd8;color:#fff;text-align:center;padding:14px;border-radius:10px;font-size:16px;font-weight:500;cursor:pointer;";

        const input = document.createElement("input");
        input.type = "file";
        // Only the raster formats the engine can actually decode (OpenCV on desktop, Skia in the browser), so
        // the user is not offered SVG/HEIC/AVIF and the like that would just fail after upload.
        input.accept = ".png,.jpg,.jpeg,.bmp,.tif,.tiff,.webp,image/png,image/jpeg,image/bmp,image/tiff,image/webp";
        // Transparent, covering the WHOLE button so the finger taps the <input> itself. iOS Safari opens the
        // file dialog only from a genuine tap directly on the input element (a label that forwards the tap to a
        // hidden input, or a programmatic .click() after an await, counts as synthetic there and opens nothing).
        // 16px font stops iOS zooming in on focus; top/left + 100% (not the inset shorthand) so the overlay
        // still covers the button on older iOS Safari (< 14.5).
        input.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;font-size:16px;cursor:pointer;";
        button.appendChild(input);

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.style.cssText = "display:block;width:100%;margin-top:10px;background:transparent;color:#9aa0b8;border:0;padding:12px;font-size:15px;cursor:pointer;";

        input.addEventListener("change", async () => {
            const file = input.files && input.files[0];
            if (!file) { finish(null); return; }
            const bytes = new Uint8Array(await file.arrayBuffer());
            _pickedBytes = bytes;
            finish(file.name + "\n" + bytes.length);
        });
        cancel.addEventListener("click", () => finish(null));
        // Dismiss on a fresh press on the backdrop, NOT on click: the tap that opens the sheet is a touch-down
        // on the button, and its follow-up click lands mid-screen on this backdrop; a click handler would then
        // close the sheet the instant it opened. A pointerdown only fires for a new, deliberate tap outside.
        overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) finish(null); });

        sheet.appendChild(heading);
        sheet.appendChild(button);
        sheet.appendChild(cancel);
        overlay.appendChild(sheet);
        document.body.appendChild(overlay);
    });
}

// Copy the last picked file's bytes into the .NET-provided buffer in one bulk memory write.
export function copyPickedBytes(dest) {
    if (_pickedBytes) dest.set(_pickedBytes);
    _pickedBytes = null;
}

// Drop any held bytes without copying (used when the .NET side rejects the pick), so a large buffer is freed.
export function clearPickedBytes() {
    _pickedBytes = null;
}

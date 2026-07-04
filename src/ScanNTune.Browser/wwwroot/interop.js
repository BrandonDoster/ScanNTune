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
        let diagCleanup = null;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            if (diagCleanup) diagCleanup();
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

        // Show the REAL <input type=file> directly and visibly. iOS Safari opens the OS file dialog only from a
        // genuine tap on a visible input; a transparent overlay input (opacity:0) does get tapped but iOS will
        // not honour it, so the dialog never opens (confirmed on a device). Its button chrome is themed via
        // ::file-selector-button; the 16px font stops iOS zooming in on focus.
        const style = document.createElement("style");
        style.textContent =
            ".snt-file{display:block;margin:2px auto 0;font-size:16px;color:#e6e8f0;max-width:100%;}" +
            ".snt-file::file-selector-button,.snt-file::-webkit-file-upload-button{" +
            "background:#3f6fd8;color:#fff;border:0;border-radius:10px;padding:13px 16px;" +
            "font-size:16px;font-weight:500;margin-right:10px;cursor:pointer;font-family:inherit;}";

        const input = document.createElement("input");
        input.type = "file";
        input.className = "snt-file";
        // Only the raster formats the engine can actually decode (OpenCV on desktop, Skia in the browser), so
        // the user is not offered SVG/HEIC/AVIF and the like that would just fail after upload.
        input.accept = ".png,.jpg,.jpeg,.bmp,.tif,.tiff,.webp,image/png,image/jpeg,image/bmp,image/tiff,image/webp";

        // Keep real event listeners on the file input: iOS Safari opens the OS file dialog on tap only when the
        // input looks interactive to it, and an input carrying touch/click listeners qualifies where a bare one
        // in this sheet did not (confirmed on an iPhone). DO NOT remove these listeners; they are what makes the
        // picker work on iOS. They log to the console, which is also handy for debugging.
        let dn = 0;
        const dadd = (m) => console.log("[picker] " + (++dn) + ") " + m);
        dadd("UA " + navigator.userAgent);
        ["touchstart", "touchend", "pointerdown", "pointerup", "pointercancel", "click", "change"].forEach((t) =>
            input.addEventListener(t, (e) => dadd(t + " defaultPrevented=" + e.defaultPrevented)));
        // Surface thrown errors, unhandled promise rejections and console.error (where .NET/Avalonia report
        // failures) to the console too.
        const onDiagError = (e) => dadd("ERROR " + (e && (e.message || (e.reason && (e.reason.message || e.reason)) || e.type) || e));
        const origConsoleError = console.error;
        console.error = (...a) => {
            try { dadd("console.error " + a.map((x) => (x && x.message) || String(x)).join(" ")); } catch (_) { /* keep logging even if formatting a value throws */ }
            origConsoleError.apply(console, a);
        };
        globalThis.addEventListener("error", onDiagError);
        globalThis.addEventListener("unhandledrejection", onDiagError);
        diagCleanup = () => {
            globalThis.removeEventListener("error", onDiagError);
            globalThis.removeEventListener("unhandledrejection", onDiagError);
            console.error = origConsoleError;
        };

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

        sheet.appendChild(style);
        sheet.appendChild(heading);
        sheet.appendChild(input);
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

// ---------------------------------------------------------------------------------------------------------
// In-app debug console (web app only; this module is not loaded by the desktop head). A discreet floating
// button opens a panel that shows captured console output plus uncaught errors and promise rejections, with
// Copy and Share, so a phone user can send us the log without any devtools. The C# side logs through the
// browser console too (BrowserConsoleLogger), so its output appears here as well. Add console.log anywhere in
// the JS or C# and it shows up.
(function initDebugConsole() {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (window.__sntDebug) return; // a re-import must not double-hook the console
    window.__sntDebug = true;

    const MAX = 500;
    const lines = [];
    let bodyEl = null; // the <pre> in the open panel, or null when closed

    const fmt = (a) => {
        try {
            if (a instanceof Error) return a.stack || (a.name + ": " + a.message);
            if (a !== null && typeof a === "object") return JSON.stringify(a);
            return String(a);
        } catch (_) { return "[unserializable]"; }
    };
    const stamp = () => { try { return new Date().toLocaleTimeString(); } catch (_) { return ""; } };
    const text = () => lines.join("\n");
    const push = (level, args) => {
        lines.push(stamp() + " [" + level + "] " + args.map(fmt).join(" "));
        if (lines.length > MAX) lines.shift();
        if (bodyEl) { bodyEl.textContent = text(); bodyEl.scrollTop = bodyEl.scrollHeight; }
    };

    ["log", "info", "warn", "error"].forEach((m) => {
        const orig = console[m] ? console[m].bind(console) : function () { };
        console[m] = function (...a) { try { push(m, a); } catch (_) { /* logging must never throw */ } orig(...a); };
    });
    window.addEventListener("error", (e) => push("error", [e.message + " @ " + (e.filename || "") + ":" + (e.lineno || "")]));
    window.addEventListener("unhandledrejection", (e) => push("reject", [(e.reason && (e.reason.stack || e.reason.message)) || e.reason]));

    const mkBtn = (label, bg, fg) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText = "background:" + bg + ";color:" + fg + ";border:0;border-radius:8px;padding:8px 12px;font:14px system-ui,sans-serif;cursor:pointer;";
        return b;
    };

    let panel = null;
    const close = () => { if (panel) { panel.remove(); panel = null; bodyEl = null; } };
    const open = () => {
        if (panel) return;
        panel = document.createElement("div");
        panel.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:#14151f;color:#e6e8f0;display:flex;flex-direction:column;";
        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:8px;padding:10px;flex-wrap:wrap;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);";
        const title = document.createElement("div");
        title.textContent = "Debug log";
        title.style.cssText = "font:600 14px system-ui,sans-serif;margin-right:auto;";
        const copy = mkBtn("Copy", "#3f6fd8", "#fff");
        const share = mkBtn("Share", "#3f6fd8", "#fff");
        const clear = mkBtn("Clear", "#5a3f3f", "#fff");
        const closeBtn = mkBtn("Close", "transparent", "#9aa0b8");
        bodyEl = document.createElement("pre");
        bodyEl.style.cssText = "flex:1;margin:0;padding:10px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:11px/1.5 monospace;background:#0c0d14;";
        bodyEl.textContent = text();
        copy.addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(text()); }
            catch (_) {
                const ta = document.createElement("textarea");
                ta.value = text();
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand("copy"); } catch (e2) { /* nothing else to try */ }
                ta.remove();
            }
            copy.textContent = "Copied";
            setTimeout(() => { copy.textContent = "Copy"; }, 1200);
        });
        share.addEventListener("click", async () => {
            try { if (navigator.share) { await navigator.share({ title: "ScanNTune debug log", text: text() }); } else { share.textContent = "No share"; } }
            catch (_) { /* user cancelled the share sheet */ }
        });
        clear.addEventListener("click", () => { lines.length = 0; bodyEl.textContent = ""; });
        closeBtn.addEventListener("click", close);
        bar.append(title, copy, share, clear, closeBtn);
        panel.append(bar, bodyEl);
        document.body.appendChild(panel);
    };

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "debug";
    toggle.setAttribute("aria-label", "Open the debug log");
    toggle.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483645;background:rgba(40,42,58,0.7);color:#9aa0b8;border:1px solid rgba(255,255,255,0.15);border-radius:8px;font:11px system-ui,sans-serif;padding:5px 8px;opacity:0.55;cursor:pointer;";
    toggle.addEventListener("click", () => (panel ? close() : open()));

    const attach = () => { if (document.body) document.body.appendChild(toggle); };
    if (document.body) attach(); else window.addEventListener("DOMContentLoaded", attach);

    push("info", ["debug console ready"]);
})();

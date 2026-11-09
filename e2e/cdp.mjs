import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export async function createBrowser(options = { width: 1440, height: 900 }) {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const port = 9222;
  const userDataDir = path.resolve("./e2e/chrome-profile");
  fs.mkdirSync(userDataDir, { recursive: true });

  const chromeProc = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${options.width},${options.height}`,
    "about:blank",
  ]);

  // Wait for debug port to be available
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch {}
  }

  if (!wsUrl) {
    chromeProc.kill();
    throw new Error("Failed to connect to Chrome CDP");
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      const { resolve, reject } = callbacks.get(data.id);
      callbacks.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  const send = (method, params = {}) => {
    const msgId = id++;
    return new Promise((resolve, reject) => {
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  // Create new target (tab)
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

  const sendSession = (method, params = {}) => {
    const msgId = id++;
    return new Promise((resolve, reject) => {
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, sessionId, method, params }));
    });
  };

  await sendSession("Page.enable");
  await sendSession("Runtime.enable");
  await sendSession("Emulation.setDeviceMetricsOverride", {
    width: options.width,
    height: options.height,
    deviceScaleFactor: 2, // HiDPI retina quality!
    mobile: options.mobile || false,
  });

  return {
    async navigate(url) {
      await sendSession("Page.navigate", { url });
      await new Promise((r) => setTimeout(r, 1500));
    },
    async evaluate(expression) {
      return await sendSession("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
    },
    async screenshot(filePath, fullPage = false) {
      const result = await sendSession("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: fullPage,
      });
      const buffer = Buffer.from(result.data, "base64");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, buffer);
      console.log(`Saved screenshot: ${filePath} (${buffer.length} bytes)`);
    },
    async close() {
      try {
        ws.close();
      } catch {}
      chromeProc.kill("SIGKILL");
    },
  };
}

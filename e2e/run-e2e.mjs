import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowser } from "./cdp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, "screenshots");

async function main() {
  console.log("Starting mock server...");
  const serverProc = spawn("node", [path.resolve(__dirname, "mock-server.mjs")], {
    stdio: "inherit",
  });

  // Wait for server to start
  await new Promise((r) => setTimeout(r, 2000));

  let browser;
  try {
    console.log("Launching desktop browser...");
    browser = await createBrowser({ width: 1440, height: 1200 });

    // 1. Home Page
    console.log("Navigating to home page...");
    await browser.navigate("http://localhost:3456/");
    await new Promise((r) => setTimeout(r, 2500));
    await browser.screenshot(path.join(screenshotsDir, "01_home_desktop.png"), false);

    // 2. Login Modal
    console.log("Opening login modal...");
    const clicked = await browser.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loginBtn = buttons.find(b => b.textContent && (b.textContent.includes('Login') || b.textContent.includes('登录')));
        if (loginBtn) {
          loginBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("Login button clicked:", clicked);
    await new Promise((r) => setTimeout(r, 1200));
    await browser.screenshot(path.join(screenshotsDir, "02_login_modal.png"), false);

    // Close modal if open (press Escape)
    await browser.evaluate(`
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 600));

    // 3. GPU Node Instance Detail Page
    console.log("Navigating to GPU node detail page...");
    await browser.navigate("http://localhost:3456/instance/247679f3-f4f0-4d3c-b98c-8dfabc82edda");
    await new Promise((r) => setTimeout(r, 3000));
    await browser.screenshot(path.join(screenshotsDir, "03_instance_gpu_desktop_load.png"), true);

    // Switch to Ping tab
    console.log("Switching to Ping tab on GPU node detail page...");
    const pingTabClicked = await browser.evaluate(`
      (() => {
        const toggleButtons = Array.from(document.querySelectorAll('.node-detail-chart-header button, .node-detail-chart-header [role="radio"]'));
        const pingBtn = toggleButtons.find(b => b.textContent && (b.textContent.includes('Ping') || b.textContent.includes('延迟')));
        if (pingBtn) {
          pingBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("Ping tab clicked:", pingTabClicked);
    await new Promise((r) => setTimeout(r, 2500));
    await browser.screenshot(path.join(screenshotsDir, "03_instance_gpu_desktop_ping.png"), true);

    // 4. CPU Node Instance Detail Page (verify NO GPU shown)
    console.log("Navigating to CPU node detail page...");
    await browser.navigate("http://localhost:3456/instance/8899aabb-ccdd-eeff-0011-223344556677");
    await new Promise((r) => setTimeout(r, 3000));
    await browser.screenshot(path.join(screenshotsDir, "04_instance_cpu_desktop.png"), true);

    await browser.close();

    // 5. Mobile Instance Detail Page
    console.log("Launching mobile browser...");
    browser = await createBrowser({ width: 390, height: 844, mobile: true });
    await browser.navigate("http://localhost:3456/instance/247679f3-f4f0-4d3c-b98c-8dfabc82edda");
    await new Promise((r) => setTimeout(r, 3000));
    await browser.screenshot(path.join(screenshotsDir, "05_instance_gpu_mobile.png"), true);

    await browser.close();
    console.log("All E2E screenshot scenarios completed successfully!");
  } catch (err) {
    console.error("E2E failed:", err);
  } finally {
    if (browser) await browser.close();
    serverProc.kill("SIGKILL");
    process.exit(0);
  }
}

main();

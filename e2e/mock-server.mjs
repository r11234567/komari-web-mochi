import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { create, toBinary } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const jiti = createJiti(import.meta.url);
const browserProto = jiti("@komari/proto/komari/browser/v1/browser_pb");
const metricsProto = jiti("@komari/proto/komari/metrics/v1/metrics_pb");
const credProto = jiti("@komari/proto/komari/credential/v1/credential_pb");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// Agent definitions
const nodeGpuId = "247679f3-f4f0-4d3c-b98c-8dfabc82edda";
const nodeCpuId = "8899aabb-ccdd-eeff-0011-223344556677";

const resetTimeGpu = new Date(Date.now() + (5 * 24 + 14) * 3600_000 + 120_000);
const resetTimeCpu = new Date(Date.now() + (2 * 24 + 8) * 3600_000 + 120_000);

function sendUnary(res, schema, msg) {
  const binary = toBinary(schema, create(schema, msg));
  res.writeHead(200, {
    "Content-Type": "application/proto",
    "Content-Length": binary.length,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(Buffer.from(binary));
}

function sendStreamEnvelope(res, schema, msg) {
  const binary = toBinary(schema, create(schema, msg));
  const frame = Buffer.alloc(5 + binary.length);
  frame[0] = 0; // Data flag
  frame.writeUInt32BE(binary.length, 1);
  Buffer.from(binary).copy(frame, 5);
  res.write(frame);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === "/api/me") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    return res.end(JSON.stringify({
      logged_in: false,
      username: "",
      uuid: "",
      "2fa_enabled": false,
      sso_id: "",
      sso_type: "",
    }));
  }

  if (pathname === "/api/client/public") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    return res.end(JSON.stringify({
      sitename: "Komari Monitor",
      description: "Antigravity Enhanced Theme",
      record_preserve_time: 720,
      disable_password_login: false,
      oauth_enable: true,
      oauth_provider: "github",
      private_site: false,
    }));
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    return res.end();
  }

  // Connect RPC
  if (req.method === "POST") {
    if (pathname === "/komari.browser.v1.BrowserService/GetPublicInfo") {
      return sendUnary(res, browserProto.GetPublicInfoResponseSchema, {
        siteName: "Komari Monitor (Mochi)",
        siteDescription: "Antigravity Enhanced Theme",
        metricRetentionDays: 30,
        corsOriginCheckEnabled: false,
        disablePasswordLogin: false,
        oauthEnabled: true,
        oauthProvider: "github",
        privateSite: false,
        themeSettings: {
          showModernPingStats: true,
          modernPingStatsHours: 24,
        },
      });
    }

    if (pathname === "/komari.browser.v1.BrowserService/ListAgents") {
      return sendUnary(res, browserProto.ListAgentsResponseSchema, {
        agents: [
          {
            agentId: nodeGpuId,
            name: "US-Silicon-Valley-GPU",
            status: browserProto.AgentStatus.ONLINE,
            basicInfo: {
              os: "Ubuntu 24.04 LTS",
              architecture: "x86_64",
              cpuName: "AMD EPYC 7763 64-Core Processor",
              cpuCores: 16,
              memoryTotalBytes: 64n * 1024n * 1024n * 1024n,
              diskTotalBytes: 500n * 1024n * 1024n * 1024n,
              swapTotalBytes: 16n * 1024n * 1024n * 1024n,
              gpuName: "NVIDIA GeForce RTX 4090",
              region: "us",
              agentVersion: "1.2.97-DEV",
              weight: 100,
              trafficLimitBytes: 1000n * 1000n * 1000n * 1000n,
              trafficLimitType: "sum",
              tags: "GPU,AI,US-West",
              virtualization: "kvm",
              kernelVersion: "6.8.0-40-generic",
            },
            trafficAccounting: {
              nextReset: timestampFromDate(resetTimeGpu),
            },
          },
          {
            agentId: nodeCpuId,
            name: "DE-Frankfurt-Cloud",
            status: browserProto.AgentStatus.ONLINE,
            basicInfo: {
              os: "Debian GNU/Linux 13 (trixie)",
              architecture: "amd64",
              cpuName: "AMD EPYC 7663 56-Core Processor",
              cpuCores: 4,
              memoryTotalBytes: 8n * 1024n * 1024n * 1024n,
              diskTotalBytes: 100n * 1024n * 1024n * 1024n,
              swapTotalBytes: 2n * 1024n * 1024n * 1024n,
              gpuName: "", // NO GPU
              region: "de",
              agentVersion: "1.2.97-DEV",
              weight: 90,
              trafficLimitBytes: 500n * 1000n * 1000n * 1000n,
              trafficLimitType: "sum",
              tags: "VPS,Debian",
              virtualization: "kvm",
              kernelVersion: "6.12.115+deb13.1-amd64",
            },
            trafficAccounting: {
              nextReset: timestampFromDate(resetTimeCpu),
            },
          },
        ],
      });
    }

    if (pathname === "/komari.browser.v1.BrowserService/WatchAgentStatus") {
      res.writeHead(200, {
        "Content-Type": "application/connect+proto",
        "Transfer-Encoding": "chunked",
        "Access-Control-Allow-Origin": "*",
      });

      const now = new Date();

      // Emit GPU node
      sendStreamEnvelope(res, browserProto.WatchAgentStatusResponseSchema, {
        agent: {
          agentId: nodeGpuId,
          name: "US-Silicon-Valley-GPU",
          status: browserProto.AgentStatus.ONLINE,
        },
        latestReport: {
          observedAt: timestampFromDate(now),
          system: {
            uptime: { seconds: 864000n },
          },
          resources: {
            cpuPercent: 32.5,
            memoryUsedBytes: 22n * 1024n * 1024n * 1024n,
            swapUsedBytes: 512n * 1024n * 1024n,
            loadAverage: [1.25, 1.40, 1.15],
            tcpConnectionCount: 312n,
            udpConnectionCount: 42n,
            processCount: 220n,
            gpus: [
              {
                name: "NVIDIA GeForce RTX 4090",
                memoryTotalBytes: 24n * 1024n * 1024n * 1024n,
                memoryUsedBytes: 14n * 1024n * 1024n * 1024n,
                utilizationPercent: 68.5,
                temperatureCelsius: 62,
              },
            ],
          },
          networkInterfaces: [
            {
              name: "aggregate",
              bytesSentPerSecond: 15_400_000n,
              bytesReceivedPerSecond: 32_800_000n,
              bytesSent: 420n * 1000n * 1000n * 1000n,
              bytesReceived: 360n * 1000n * 1000n * 1000n,
            },
          ],
          disks: [
            {
              mountPoint: "aggregate",
              usedBytes: 142n * 1024n * 1024n * 1024n,
              totalBytes: 500n * 1024n * 1024n * 1024n,
            },
          ],
        },
      });

      // Emit CPU node (NO GPU)
      sendStreamEnvelope(res, browserProto.WatchAgentStatusResponseSchema, {
        agent: {
          agentId: nodeCpuId,
          name: "DE-Frankfurt-Cloud",
          status: browserProto.AgentStatus.ONLINE,
        },
        latestReport: {
          observedAt: timestampFromDate(now),
          system: {
            uptime: { seconds: 432000n },
          },
          resources: {
            cpuPercent: 18.2,
            memoryUsedBytes: 3n * 1024n * 1024n * 1024n,
            swapUsedBytes: 120n * 1024n * 1024n,
            loadAverage: [0.35, 0.42, 0.28],
            tcpConnectionCount: 95n,
            udpConnectionCount: 12n,
            processCount: 110n,
            gpus: [], // Empty GPUs
          },
          networkInterfaces: [
            {
              name: "aggregate",
              bytesSentPerSecond: 1_200_000n,
              bytesReceivedPerSecond: 4_500_000n,
              bytesSent: 120n * 1000n * 1000n * 1000n,
              bytesReceived: 180n * 1000n * 1000n * 1000n,
            },
          ],
          disks: [
            {
              mountPoint: "aggregate",
              usedBytes: 35n * 1024n * 1024n * 1024n,
              totalBytes: 100n * 1024n * 1024n * 1024n,
            },
          ],
        },
      });

      // Keep stream alive
      const interval = setInterval(() => {
        try {
          res.write(Buffer.from([0, 0, 0, 0, 0])); // Keep alive ping
        } catch {
          clearInterval(interval);
        }
      }, 5000);

      req.on("close", () => clearInterval(interval));
      return;
    }

    if (pathname === "/komari.metrics.v1.MetricsService/ListPingTasks") {
      return sendUnary(res, metricsProto.ListPingTasksResponseSchema, {
        tasks: [
          { taskId: 1n, name: "Shanghai Telecom", intervalSeconds: 60 },
          { taskId: 2n, name: "Guangzhou Mobile", intervalSeconds: 60 },
          { taskId: 3n, name: "Beijing Unicom", intervalSeconds: 60 },
          { taskId: 4n, name: "Tokyo NTT", intervalSeconds: 60 },
        ],
      });
    }

    if (pathname === "/komari.metrics.v1.MetricsService/GetPingStats") {
      return sendUnary(res, metricsProto.GetPingStatsResponseSchema, {
        stats: [
          { agentId: nodeGpuId, taskId: 1n, currentLatencyMs: 135, avgLatencyMs: 132, packetLossPercent: 0 },
          { agentId: nodeGpuId, taskId: 2n, currentLatencyMs: 142, avgLatencyMs: 140, packetLossPercent: 0 },
          { agentId: nodeGpuId, taskId: 3n, currentLatencyMs: 128, avgLatencyMs: 125, packetLossPercent: 0 },
          { agentId: nodeGpuId, taskId: 4n, currentLatencyMs: 98, avgLatencyMs: 95, packetLossPercent: 0 },
          { agentId: nodeCpuId, taskId: 1n, currentLatencyMs: 185, avgLatencyMs: 180, packetLossPercent: 0.5 },
          { agentId: nodeCpuId, taskId: 2n, currentLatencyMs: 195, avgLatencyMs: 190, packetLossPercent: 0 },
        ],
      });
    }

    if (pathname === "/komari.metrics.v1.MetricsService/QueryMetrics") {
      const now = Date.now();
      const pointsCount = 30;
      const step = 60 * 1000;

      const makePoints = (baseVal, variance) => {
        const pts = [];
        for (let i = pointsCount - 1; i >= 0; i--) {
          const t = new Date(now - i * step);
          const val = Math.max(0, baseVal + (Math.sin(i / 3) * variance));
          pts.push({ observedAt: timestampFromDate(t), value: val });
        }
        return pts;
      };

      const series = [
        { agentId: nodeGpuId, metric: "cpu.usage", queryPoints: makePoints(35, 10), labels: {} },
        { agentId: nodeGpuId, metric: "memory.used", queryPoints: makePoints(22 * 1024 * 1024 * 1024, 1024 * 1024 * 1024), labels: {} },
        { agentId: nodeGpuId, metric: "disk.used", queryPoints: makePoints(142 * 1024 * 1024 * 1024, 0), labels: {} },
        { agentId: nodeGpuId, metric: "net.in.rate", queryPoints: makePoints(32_000_000, 5_000_000), labels: {} },
        { agentId: nodeGpuId, metric: "net.out.rate", queryPoints: makePoints(15_000_000, 3_000_000), labels: {} },
        { agentId: nodeGpuId, metric: "connections.tcp", queryPoints: makePoints(310, 20), labels: {} },
        { agentId: nodeGpuId, metric: "connections.udp", queryPoints: makePoints(40, 5), labels: {} },
        { agentId: nodeGpuId, metric: "process.count", queryPoints: makePoints(220, 5), labels: {} },
        // GPU series for nodeGpuId
        { agentId: nodeGpuId, metric: "gpu.usage", queryPoints: makePoints(68.5, 12), labels: {} },
        { agentId: nodeGpuId, metric: "gpu.memory.used", queryPoints: makePoints(14 * 1024 * 1024 * 1024, 512 * 1024 * 1024), labels: {} },
        { agentId: nodeGpuId, metric: "gpu.memory.total", queryPoints: makePoints(24 * 1024 * 1024 * 1024, 0), labels: {} },

        // Ping latency metrics
        { agentId: nodeGpuId, metric: "ping.latency_ms", queryPoints: makePoints(135, 8), labels: { task_id: "1" } },
        { agentId: nodeGpuId, metric: "ping.latency_ms", queryPoints: makePoints(142, 6), labels: { task_id: "2" } },
        { agentId: nodeGpuId, metric: "ping.latency_ms", queryPoints: makePoints(128, 5), labels: { task_id: "3" } },
        { agentId: nodeGpuId, metric: "ping.latency_ms", queryPoints: makePoints(98, 4), labels: { task_id: "4" } },

        // CPU node series (NO GPU metrics)
        { agentId: nodeCpuId, metric: "cpu.usage", queryPoints: makePoints(18, 5), labels: {} },
        { agentId: nodeCpuId, metric: "memory.used", queryPoints: makePoints(3 * 1024 * 1024 * 1024, 256 * 1024 * 1024), labels: {} },
      ];

      return sendUnary(res, metricsProto.QueryMetricsResponseSchema, { series });
    }

    if (pathname === "/komari.credential.v1.PasswordLoginService/CancelPasswordLogin") {
      return sendUnary(res, credProto.CancelPasswordLoginResponseSchema, {});
    }

    if (pathname === "/komari.credential.v1.PasswordLoginService/BeginPasswordLogin") {
      return sendUnary(res, credProto.BeginPasswordLoginResponseSchema, {
        challenge: "mock-challenge-token",
        availableProviders: [
          { providerId: "totp", displayName: "Authenticator App (TOTP)" },
          { providerId: "email", displayName: "Email Code (admin@example.com)" },
        ],
      });
    }

    if (pathname === "/komari.credential.v1.PasswordLoginService/CompletePasswordLogin") {
      return sendUnary(res, credProto.CompletePasswordLoginResponseSchema, {});
    }
  }

  // Static files from dist
  let filePath = path.join(distDir, pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not Found");
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

const PORT = 3456;
server.listen(PORT, () => {
  console.log(`Mock E2E Server listening on http://localhost:${PORT}`);
});

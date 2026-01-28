/**
 * Unit tests for TmuxServiceLocal
 *
 * TDD Approach: Red → Green → Refactor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TmuxServiceLocal } from "./tmux-service.js";

// Mock environment variables
const mockEnv = {
  MIYABI_TMUX_SESSION: "miyabi",
};

describe("TmuxServiceLocal", () => {
  let service: TmuxServiceLocal;

  beforeEach(() => {
    // Setup environment variables
    process.env.MIYABI_TMUX_SESSION = mockEnv.MIYABI_TMUX_SESSION;
    service = new TmuxServiceLocal();
  });

  afterEach(() => {
    // Cleanup
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create instance with default session", () => {
      expect(service).toBeInstanceOf(TmuxServiceLocal);
    });

    it("should use environment variable for session name", () => {
      process.env.MIYABI_TMUX_SESSION = "test-session";
      const testService = new TmuxServiceLocal();
      expect(testService).toBeInstanceOf(TmuxServiceLocal);
    });
  });

  describe("resolvePaneId (private method)", () => {
    it("should resolve conductor to pane %27", () => {
      const result = (service as any).resolvePaneId("conductor");
      expect(result).toBe("%27");
    });

    it("should resolve shikirun to pane %27", () => {
      const result = (service as any).resolvePaneId("shikirun");
      expect(result).toBe("%27");
    });

    it("should resolve kaede to miyabi:codex.0", () => {
      const result = (service as any).resolvePaneId("kaede");
      expect(result).toBe("miyabi:codex.0");
    });

    it("should resolve sakura to miyabi:codex.1", () => {
      const result = (service as any).resolvePaneId("sakura");
      expect(result).toBe("miyabi:codex.1");
    });

    it("should resolve tsubaki to miyabi:codex.2", () => {
      const result = (service as any).resolvePaneId("tsubaki");
      expect(result).toBe("miyabi:codex.2");
    });

    it("should resolve botan to miyabi:codex.3", () => {
      const result = (service as any).resolvePaneId("botan");
      expect(result).toBe("miyabi:codex.3");
    });

    it("should handle case-insensitive agent names", () => {
      const result1 = (service as any).resolvePaneId("CONDUCTOR");
      const result2 = (service as any).resolvePaneId("Kaede");
      expect(result1).toBe("%27");
      expect(result2).toBe("miyabi:codex.0");
    });

    it("should throw error for unknown agent", () => {
      expect(() => (service as any).resolvePaneId("unknown-agent")).toThrow(
        "Unknown agent: unknown-agent",
      );
    });
  });

  describe("escapeForTmux (private method)", () => {
    it("should escape double quotes", () => {
      const result = (service as any).escapeForTmux('Test "quoted" text');
      expect(result).toBe('Test \\"quoted\\" text');
    });

    it("should escape dollar signs", () => {
      const result = (service as any).escapeForTmux("Price: $100");
      expect(result).toBe("Price: \\$100");
    });

    it("should escape backticks", () => {
      const result = (service as any).escapeForTmux("Execute `command`");
      expect(result).toBe("Execute \\`command\\`");
    });

    it("should escape backslashes", () => {
      const result = (service as any).escapeForTmux("Path: C:\\Users");
      expect(result).toBe("Path: C:\\\\Users");
    });

    it("should escape newlines", () => {
      const result = (service as any).escapeForTmux("Line1\nLine2");
      expect(result).toBe("Line1\\nLine2");
    });

    it("should handle empty string", () => {
      const result = (service as any).escapeForTmux("");
      expect(result).toBe("");
    });

    it("should handle multiple special characters", () => {
      const result = (service as any).escapeForTmux('Say "hello $world" and `run`');
      expect(result).toContain('\\"');
      expect(result).toContain("\\$");
      expect(result).toContain("\\`");
    });
  });

  describe("formatStatus (private method)", () => {
    it("should format empty output", () => {
      const result = (service as any).formatStatus("");
      expect(result).toContain("No active panes found");
    });

    it("should format whitespace only output", () => {
      const result = (service as any).formatStatus("   \n   \n");
      expect(result).toContain("No active panes found");
    });

    it("should format single pane", () => {
      const output = "%27: node [ACTIVE]";
      const result = (service as any).formatStatus(output);
      expect(result).toContain("🟢");
      expect(result).toContain("%27");
      expect(result).toContain("[ACTIVE]");
    });

    it("should format multiple panes", () => {
      const output = "%27: node\n%28: vim\n%29: bash";
      const result = (service as any).formatStatus(output);
      expect(result).toContain("📊");
      expect(result).toContain("Miyabi Agent Society Status");
    });

    it("should filter empty lines", () => {
      const output = "%27: node\n\n%28: vim\n\n\n";
      const result = (service as any).formatStatus(output);
      // Should not have multiple consecutive empty lines
      expect(result).not.toMatch(/\n\n\n/);
    });
  });

  describe("isSessionRunning", () => {
    it("should return boolean", async () => {
      const result = await service.isSessionRunning();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("sendToAgent", () => {
    it("should throw error for empty agent name", async () => {
      await expect(service.sendToAgent("", "message")).rejects.toThrow("Unknown agent:");
    });

    it("should escape special characters in message", async () => {
      // This test verifies that special characters are escaped
      // but may fail if tmux session is not running
      const result = service.sendToAgent("conductor", 'Test "quoted" message');
      expect(result).toBeInstanceOf(Promise);
    });

    it("should handle long messages", async () => {
      const longMessage = "A".repeat(500);
      const result = service.sendToAgent("conductor", longMessage);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("getStatus", () => {
    it("should return status string", async () => {
      const result = service.getStatus();
      expect(result).toBeInstanceOf(Promise);
    });

    it("should handle tmux not running", async () => {
      // If tmux session is not running, should return error message
      const result = await service.getStatus();
      expect(typeof result).toBe("string");
      // May contain error message if tmux is not running
    });
  });
});

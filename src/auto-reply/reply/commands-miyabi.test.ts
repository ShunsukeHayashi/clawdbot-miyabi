/**
 * Unit tests for /miyabi command handlers
 *
 * TDD Approach: Red → Green → Refactor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleMiyabiCommand } from "./commands-miyabi.js";
import { GitHubService } from "./services/github-service.js";
import { TmuxServiceLocal } from "./services/tmux-service.js";

// Mock services
vi.mock("./services/github-service.js");
vi.mock("./services/tmux-service.js");

// Mock command context
const createMockCommand = (commandBody: string) =>
  ({
    commandBodyNormalized: commandBody,
    commandBody,
    isAuthorizedSender: true,
    senderId: "test-user",
    channelId: "test-channel",
    from: "test-from",
    to: "test-to",
  }) as any;

// Mock params
const createMockParams = (commandBody: string) => ({
  command: createMockCommand(commandBody),
  sessionKey: "test-session",
  cfg: {} as any,
  sessionEntry: {} as any,
  ctx: {} as any,
});

describe("handleMiyabiCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("command routing", () => {
    it("should return null for non-miyabi commands", async () => {
      const params = createMockParams("/help");
      const result = await handleMiyabiCommand(params);
      expect(result).toBeNull();
    });

    it("should return null for empty command", async () => {
      const params = createMockParams("");
      const result = await handleMiyabiCommand(params);
      expect(result).toBeNull();
    });

    it("should return error for missing action", async () => {
      const params = createMockParams("/miyabi");
      const result = await handleMiyabiCommand(params);

      expect(result).not.toBeNull();
      expect(result?.shouldContinue).toBe(false);
      expect(result?.reply.text).toContain("Missing action");
    });

    it("should return error for unknown action", async () => {
      const params = createMockParams("/miyabi unknown");
      const result = await handleMiyabiCommand(params);

      expect(result).not.toBeNull();
      expect(result?.shouldContinue).toBe(false);
      expect(result?.reply.text).toContain("Unknown action");
    });
  });

  describe("/miyabi issue", () => {
    it("should return error for missing title", async () => {
      const params = createMockParams("/miyabi issue");
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("Missing issue title");
    });

    it("should return error for title too long", async () => {
      const longTitle = "A".repeat(501);
      const params = createMockParams(`/miyabi issue ${longTitle}`);
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("Title too long");
    });

    it("should create GitHub issue with valid title", async () => {
      // Mock GitHubService
      vi.mocked(GitHubService.prototype.createIssue).mockResolvedValue(
        "https://github.com/ShunsukeHayashi/miyabi-private/issues/123",
      );

      const params = createMockParams("/miyabi issue Test issue");
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("✅");
      expect(result?.reply.text).toContain("github.com");
    });

    it("should handle GitHub API errors", async () => {
      vi.mocked(GitHubService.prototype.createIssue).mockRejectedValue(
        new Error("GitHub API failed"),
      );

      const params = createMockParams("/miyabi issue Test issue");
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("❌");
      expect(result?.reply.text).toContain("Failed to create GitHub issue");
    });
  });

  describe("/miyabi status", () => {
    it("should return agent status", async () => {
      const mockStatus = `📊 Miyabi Agent Society Status:

🟢 %27                  node [ACTIVE]
⚪ miyabi:codex.0      vim`;

      vi.mocked(TmuxServiceLocal.prototype.getStatus).mockResolvedValue(mockStatus);

      const params = createMockParams("/miyabi status");
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("📊");
      expect(result?.reply.text).toContain("Miyabi Agent Society Status");
    });

    it("should handle tmux errors", async () => {
      vi.mocked(TmuxServiceLocal.prototype.getStatus).mockRejectedValue(
        new Error("tmux not running"),
      );

      const params = createMockParams("/miyabi status");
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("❌");
      expect(result?.reply.text).toContain("Failed to get agent status");
    });
  });

  describe("/miyabi agent", () => {
    it("should return error for missing agent name", async () => {
      const params = createMockParams("/miyabi agent");
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("Missing agent name");
    });

    it("should return error for missing command", async () => {
      const params = createMockParams("/miyabi agent conductor");
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("Missing command");
    });

    it("should return error for invalid agent", async () => {
      const params = createMockParams("/miyabi agent unknown-agent test message");
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("Unknown agent");
    });

    it("should return error for command too long", async () => {
      const longCommand = "A".repeat(1001);
      const params = createMockParams(`/miyabi agent conductor ${longCommand}`);
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("Command too long");
    });

    it("should send message to valid agent", async () => {
      vi.mocked(TmuxServiceLocal.prototype.sendToAgent).mockResolvedValue(
        "✅ Message sent to conductor",
      );

      const params = createMockParams("/miyabi agent conductor test message");
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("✅");
      expect(result?.reply.text).toContain("conductor");
    });

    it("should handle tmux errors", async () => {
      vi.mocked(TmuxServiceLocal.prototype.sendToAgent).mockRejectedValue(
        new Error("tmux command failed"),
      );

      const params = createMockParams("/miyabi agent conductor test message");
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("❌");
      expect(result?.reply.text).toContain("Failed to send command");
    });

    it("should handle case-insensitive agent names", async () => {
      vi.mocked(TmuxServiceLocal.prototype.sendToAgent).mockResolvedValue(
        "✅ Message sent to conductor",
      );

      const params1 = createMockParams("/miyabi agent Conductor test");
      const params2 = createMockParams("/miyabi agent CONDUCTOR test");
      const params3 = createMockParams("/miyabi agent Kaede test");

      const result1 = await handleMiyabiCommand(params1);
      const result2 = await handleMiyabiCommand(params2);
      const result3 = await handleMiyabiCommand(params3);

      expect(result1?.reply.text).toContain("✅");
      expect(result2?.reply.text).toContain("✅");
      expect(result3?.reply.text).toContain("✅");
    });
  });

  describe("error handling", () => {
    it("should catch and log unexpected errors", async () => {
      // Mock console.error to spy on calls
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Force an error by making GitHubService throw
      vi.mocked(GitHubService).mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      const params = createMockParams("/miyabi issue Test");
      const result = await handleMiyabiCommand(params);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result?.reply.text).toContain("❌");

      consoleErrorSpy.mockRestore();
    });
  });

  describe("input sanitization", () => {
    it("should handle special characters in title", async () => {
      vi.mocked(GitHubService.prototype.createIssue).mockResolvedValue(
        "https://github.com/test/issues/1",
      );

      // Test with special characters that might be used in command injection
      const params = createMockParams('/miyabi issue "Title; rm -rf /"');
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("✅");
    });

    it("should handle special characters in agent command", async () => {
      vi.mocked(TmuxServiceLocal.prototype.sendToAgent).mockResolvedValue("✅ Message sent");

      // Test with special characters
      const params = createMockParams('/miyabi agent conductor "message; cat /etc/passwd"');
      const result = await handleMiyabiCommand(params);

      expect(result?.reply.text).toContain("✅");
    });
  });
});

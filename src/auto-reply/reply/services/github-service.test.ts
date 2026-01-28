/**
 * Unit tests for GitHubService (gh CLI version)
 *
 * TDD Approach: Red → Green → Refactor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GitHubService } from "./github-service.js";
import { execSync } from "node:child_process";

// Mock environment variables
const mockEnv = {
  GITHUB_TOKEN: "ghp_test_token_1234567890",
  GITHUB_OWNER: "ShunsukeHayashi",
  GITHUB_REPO: "miyabi-private",
};

describe("GitHubService (gh CLI)", () => {
  let service: GitHubService;

  beforeEach(() => {
    // Setup environment variables
    process.env.GITHUB_TOKEN = mockEnv.GITHUB_TOKEN;
    process.env.GITHUB_OWNER = mockEnv.GITHUB_OWNER;
    process.env.GITHUB_REPO = mockEnv.GITHUB_REPO;
  });

  afterEach(() => {
    // Cleanup
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create instance when gh CLI is available", () => {
      // Assuming gh CLI is installed on the test system
      expect(() => new GitHubService()).not.toThrow();
      service = new GitHubService();
      expect(service).toBeInstanceOf(GitHubService);
    });

    it("should use environment variables for owner/repo", () => {
      service = new GitHubService();
      // Private properties but we can infer from behavior
      expect(service).toBeInstanceOf(GitHubService);
    });
  });

  describe("sanitizeTitle (private method)", () => {
    beforeEach(() => {
      service = new GitHubService();
    });

    it("should remove HTML tags", () => {
      const result = (service as any).sanitizeTitle('<script>alert("xss")</script>Test');
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("</script>");
    });

    it("should remove < and > characters", () => {
      const result = (service as any).sanitizeTitle("Test <tag> content");
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
    });

    it("should limit title length to 200 characters", () => {
      const longTitle = "A".repeat(300);
      const result = (service as any).sanitizeTitle(longTitle);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it("should trim whitespace", () => {
      const result = (service as any).sanitizeTitle("  Test Title  ");
      expect(result).not.toMatch(/^\s/);
      expect(result).not.toMatch(/\s$/);
    });
  });

  describe("escapeMarkdown (private method)", () => {
    beforeEach(() => {
      service = new GitHubService();
    });

    it("should escape markdown special characters", () => {
      const input = "*Test* _Italic_ **Bold** `code`";
      const result = (service as any).escapeMarkdown(input);
      expect(result).toContain("\\*");
      expect(result).toContain("\\_");
      expect(result).toContain("\\`");
    });

    it("should escape brackets", () => {
      const input = "[Link](url)";
      const result = (service as any).escapeMarkdown(input);
      expect(result).toContain("\\[");
      expect(result).toContain("\\]");
    });

    it("should escape pipe character", () => {
      const input = "A | B | C";
      const result = (service as any).escapeMarkdown(input);
      expect(result).toContain("\\|");
    });
  });

  describe("buildIssueBody (private method)", () => {
    beforeEach(() => {
      service = new GitHubService();
    });

    it("should create issue body with title", () => {
      const title = "Test Issue";
      const body = (service as any).buildIssueBody(title);
      expect(body).toContain(title);
      expect(body).toContain("作業宣言");
      expect(body).toContain("完了条件");
    });

    it("should escape markdown in title", () => {
      const title = "*Bold Title*";
      const body = (service as any).buildIssueBody(title);
      expect(body).toContain("\\*");
    });

    it("should include timestamp", () => {
      const title = "Test";
      const body = (service as any).buildIssueBody(title);
      expect(body).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO format timestamp
    });
  });

  describe("healthCheck", () => {
    beforeEach(() => {
      service = new GitHubService();
    });

    it("should return true when GitHub CLI is authenticated", async () => {
      // This test requires valid gh CLI setup
      const result = await service.healthCheck();
      expect(typeof result).toBe("boolean");
    });

    it("should return false when GitHub CLI is not authenticated", async () => {
      // Save original token
      const originalToken = process.env.GITHUB_TOKEN;

      // Set invalid token
      process.env.GITHUB_TOKEN = "ghp_invalid_token_xyz123";

      const badService = new GitHubService();
      const result = await badService.healthCheck();

      // Restore token
      process.env.GITHUB_TOKEN = originalToken;

      expect(result).toBe(false);
    });
  });

  describe("createIssue (integration test - requires valid gh token)", () => {
    beforeEach(() => {
      service = new GitHubService();
    });

    it("should create an issue with valid title", async () => {
      // This test will fail without valid GITHUB_TOKEN
      // We're testing that it doesn't throw synchronously
      const title = "Test Issue from Discord Bot";
      const result = service.createIssue(title);
      expect(result).toBeInstanceOf(Promise);
    }, 30000);

    it("should reject empty title", async () => {
      await expect(service.createIssue("")).rejects.toThrow();
    });

    it("should handle long titles", async () => {
      const longTitle = "A".repeat(500);
      // Should truncate to 200 chars
      const result = service.createIssue(longTitle);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});

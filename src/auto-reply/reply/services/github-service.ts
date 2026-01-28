/**
 * GitHub Service - GitHub CLI (gh) を使用したGitHub API操作
 *
 * miyabi-bridge.sh に依存せず、gh CLI を使用して GitHub API を呼び出す
 * 外部パッケージ依存を回避し、既存のghインストール環境を活用
 */

import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * spawnAsync - spawnをPromiseでラップ
 */
function spawnAsync(
  command: string,
  args: string[],
  options: { input?: string; env?: NodeJS.ProcessEnv; timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env || process.env,
      timeout: options.timeout,
    });

    let stdout = "";
    let stderr = "";

    if (options.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    }

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

export class GitHubService {
  private readonly owner: string;
  private readonly repo: string;
  private ghChecked: boolean = false;

  constructor() {
    this.owner = process.env.GITHUB_OWNER || "ShunsukeHayashi";
    this.repo = process.env.GITHUB_REPO || "miyabi-private";
  }

  /**
   * GitHub CLIがインストールされているか確認
   * 初回使用時にチェックを遅延実行
   */
  private async ensureGitHubCLI(): Promise<void> {
    if (this.ghChecked) {
      return;
    }

    try {
      // execAsyncを使用して非同期にチェック
      const { stdout } = await execAsync("command -v gh", {
        timeout: 5000,
      });

      if (!stdout || stdout.trim().length === 0) {
        throw new Error("GitHub CLI (gh) not found in PATH");
      }

      this.ghChecked = true;
    } catch (error) {
      throw new Error(
        "GitHub CLI (gh) is required but not installed. Install from: https://cli.github.com/",
      );
    }
  }

  /**
   * GitHub Issueを作成する
   * @param title Issueタイトル
   * @returns Issue URL
   */
  async createIssue(title: string): Promise<string> {
    try {
      // gh CLIのチェック（初回のみ）
      await this.ensureGitHubCLI();

      const sanitizedTitle = this.sanitizeTitle(title);
      const issueBody = this.buildIssueBody(title);

      // gh CLIを使用してIssueを作成
      // --body-file - で標準入力からボディを読み込む
      const fullTitle = `[P1] ${sanitizedTitle}`;

      // まずラベルを作成を試みる（失敗しても無視）
      try {
        await execAsync(
          'gh label create --repo $OWNER/$REPO miyabi --color "0366d6" --description "Miyabi Agent Society tasks"',
          {
            env: {
              ...process.env,
              OWNER: this.owner,
              REPO: this.repo,
              GH_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
            },
            timeout: 10000,
          },
        );
      } catch {
        // ラベル作成失敗は無視（既存または権限なし）
      }

      try {
        await execAsync(
          'gh label create --repo $OWNER/$REPO automation --color "0E8A16" --description "Automated tasks"',
          {
            env: {
              ...process.env,
              OWNER: this.owner,
              REPO: this.repo,
              GH_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
            },
            timeout: 10000,
          },
        );
      } catch {
        // ラベル作成失敗は無視
      }

      // spawnAsyncを使用して引数を配列として渡す
      const args = [
        "issue",
        "create",
        "--repo",
        `${this.owner}/${this.repo}`,
        "--title",
        fullTitle,
        "--body-file",
        "-",
        "--label",
        "miyabi,automation",
      ];

      const { stdout, stderr } = await spawnAsync("gh", args, {
        input: issueBody,
        env: {
          ...process.env,
          GH_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
        },
        timeout: 30000,
      });

      if (stderr) {
        // stderrがある場合でも、stdoutにURLが含まれていれば成功とみなす
        if (!stdout.trim()) {
          throw new Error(`gh command failed: ${stderr}`);
        }
      }

      // stdoutからURLを抽出（gh issue create はURLを出力する）
      const url = stdout.trim();
      if (!url.startsWith("https://github.com/")) {
        throw new Error(`Invalid response from gh command: ${url}\nstderr: ${stderr}`);
      }

      return url;
    } catch (error) {
      if (error instanceof Error) {
        // 元のstderrがあれば含める
        const stderrMatch = error.message.match(/stderr: (.+)/);
        const stderrInfo = stderrMatch ? `\nStderr: ${stderrMatch[1]}` : "";
        throw new Error(`GitHub API error: ${error.message}${stderrInfo}`);
      }
      throw new Error("Unknown GitHub API error");
    }
  }

  /**
   * タイトルをサニタイズ（無害化）
   * - HTMLタグを削除
   * - 長さを200文字に制限
   */
  private sanitizeTitle(title: string): string {
    return title
      .replace(/<[^>]*>/g, "") // HTMLタグ削除
      .replace(/[<>]/g, "") // < > を削除
      .trim()
      .substring(0, 200);
  }

  /**
   * Issue本文を構築
   */
  private buildIssueBody(title: string): string {
    const timestamp = new Date().toISOString();
    const escapedTitle = this.escapeMarkdown(title);

    return `## 作業宣言

### タスク概要
${escapedTitle}

### 担当
- Operator: Miyabi Agent Society (Discord Bot)
- 開始時刻: ${timestamp}

### 完了条件
- [ ] 実装完了
- [ ] テスト通過
- [ ] レビュー承認
- [ ] マージ完了

### コンテキスト
- **Source**: Discord Bot (/miyabi issue command)
- **Workspace**: clawdbot-miyabi
- **Environment**: Production

---

*This issue was created via Discord Bot /miyabi command*`;
  }

  /**
   * Markdown特殊文字をエスケープ
   * バッククォートで囲まれたテキスト内での表示崩れを防ぐ
   */
  private escapeMarkdown(text: string): string {
    // Markdownの特殊文字をバックスラッシュでエスケープ
    return text.replace(/([_*[\]~`>#+=|{}.!\\-])/g, "\\$&");
  }

  /**
   * GitHub CLIの認証チェック
   */
  async healthCheck(): Promise<boolean> {
    try {
      // gh CLIのチェック（初回のみ）
      await this.ensureGitHubCLI();

      const command = "gh auth status";
      const { stdout } = await execAsync(command, {
        env: {
          ...process.env,
          GH_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
        },
        timeout: 10000,
      });

      // "Logged in" という文字列が含まれていれば認証成功
      return stdout.includes("Logged in to github.com");
    } catch {
      return false;
    }
  }
}

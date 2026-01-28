/**
 * Tmux Service - tmuxセッション操作
 *
 * miyabi-bridge.sh に依存せず、Node.js の child_process で直接 tmux コマンドを実行
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export class TmuxServiceLocal {
  private readonly sessionName: string;

  constructor() {
    this.sessionName = process.env.MIYABI_TMUX_SESSION || "miyabi";
  }

  /**
   * エージェントにメッセージを送信
   * @param agent エージェント名
   * @param message 送信するメッセージ
   * @returns 送信結果
   */
  async sendToAgent(agent: string, message: string): Promise<string> {
    const paneId = this.resolvePaneId(agent);
    const escapedMessage = this.escapeForTmux(message);

    // tmux send-keys コマンドを非同期実行
    const command = `tmux send-keys -t ${paneId} "${escapedMessage}" Enter`;

    try {
      const { stderr } = await execAsync(command, {
        timeout: 5000, // 5秒タイムアウト
      });

      if (stderr) {
        // tmuxは警告をstderrに出力することがあるが、成功している場合もある
        if (stderr.includes("no server running")) {
          throw new Error(`tmux session not found: ${this.sessionName}`);
        }
        if (stderr.includes("can't find pane")) {
          throw new Error(`Agent pane not found: ${agent} (${paneId})`);
        }
      }

      return `✅ Message sent to ${agent}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`tmux command failed: ${error.message}`);
      }
      throw new Error("Unknown tmux error");
    }
  }

  /**
   * 全エージェントのステータスを取得
   * @returns ステータス文字列
   */
  async getStatus(): Promise<string> {
    const command = `tmux list-panes -s -F "#{pane_id}: #{pane_current_command} #{?pane_active,[ACTIVE],}"`;

    try {
      const { stdout } = await execAsync(command, {
        timeout: 5000,
      });

      return this.formatStatus(stdout);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("no server running")) {
          return `❌ tmux session "${this.sessionName}" is not running`;
        }
        throw new Error(`Failed to get status: ${error.message}`);
      }
      throw new Error("Unknown error");
    }
  }

  /**
   * 特定のエージェント名をtmuxペインIDに解決
   * @param agent エージェント名
   * @returns tmuxペインID
   */
  private resolvePaneId(agent: string): string {
    const agentLower = agent.toLowerCase();

    // エージェント名からペインIDへのマッピング
    const paneMap: Record<string, string> = {
      // Conductor (しきるん)
      conductor: "%27",
      shikirun: "%27",

      // CodeGen Society
      kaede: "miyabi:codex.0",
      codegen: "miyabi:codex.0",

      // Review Society
      sakura: "miyabi:codex.1",
      review: "miyabi:codex.1",

      // PR Society
      tsubaki: "miyabi:codex.2",
      pr: "miyabi:codex.2",

      // Deploy Society
      botan: "miyabi:codex.3",
      deploy: "miyabi:codex.3",
    };

    const paneId = paneMap[agentLower];

    if (!paneId) {
      throw new Error(`Unknown agent: ${agent}. Valid agents: ${Object.keys(paneMap).join(", ")}`);
    }

    return paneId;
  }

  /**
   * tmux送信用に文字列をエスケープ
   * - 二重引用符をエスケープ
   * - ドル記号をエスケープ（変数展開防止）
   * - バッククォートをエスケープ（コマンド置換防止）
   */
  private escapeForTmux(str: string): string {
    return str
      .replace(/\\/g, "\\\\") // バックスラッシュを最初にエスケープ
      .replace(/"/g, '\\"') // 二重引用符
      .replace(/\$/g, "\\$") // ドル記号
      .replace(/`/g, "\\`") // バッククォート
      .replace(/\n/g, "\\n"); // 改行
  }

  /**
   * ステータス出力を整形
   */
  private formatStatus(output: string): string {
    if (!output.trim()) {
      return "❌ No active panes found";
    }

    const lines = output.split("\n").filter((line) => line.trim());

    if (lines.length === 0) {
      return "❌ No active panes found";
    }

    const formatted = lines.map((line) => {
      // 例: "%27: node [ACTIVE]" を解析
      const parts = line.split(": ");
      if (parts.length < 2) {
        return `  ${line}`;
      }

      const paneId = parts[0];
      const rest = parts.slice(1).join(": ");
      const isActive = rest.includes("[ACTIVE]");

      const statusIcon = isActive ? "🟢" : "⚪";
      return `${statusIcon} ${paneId.padEnd(20)} ${rest}`;
    });

    return `📊 Miyabi Agent Society Status:\n\n${formatted.join("\n")}`;
  }

  /**
   * tmuxセッションが稼働中かチェック
   */
  async isSessionRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`tmux has-session -t ${this.sessionName} 2>/dev/null`, {
        timeout: 3000,
      });
      // tmux has-session はセッションがある場合 0 を返す
      return stdout.trim() === "0";
    } catch {
      return false;
    }
  }
}

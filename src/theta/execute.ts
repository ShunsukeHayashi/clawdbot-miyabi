/**
 * θ₄ EXECUTE: 実行(タイムアウト管理)
 *
 * 決定された処理方針に基づいて実行を行う。
 * タイムアウトとリトライを管理する。
 */

import { emitAgentEvent } from "../infra/agent-events.js";
import {
  type DecisionResult,
  ThetaCycleState,
  ThetaEvent,
  ThetaEventType,
  ThetaPhase,
} from "./types.js";
import type { ExecuteOptions, ExecutionResult } from "./types.js";

// 型のエクスポート
export type { ExecuteOptions, ExecutionResult };

/**
 * デフォルトの実行オプション
 */
const DEFAULT_OPTIONS: ExecuteOptions = {
  timeout: 30000, // 30秒
  retries: 3,
};

/**
 * 実行を実行する
 *
 * @param state - θサイクル状態
 * @param decision - 決定結果
 * @param executor - 実行関数
 * @param options - 実行オプション
 * @returns 更新された状態と実行結果
 */
export async function execute<T = unknown>(
  state: ThetaCycleState,
  decision: DecisionResult,
  executor: (params: Record<string, unknown>, signal?: AbortSignal) => Promise<T>,
  options?: Partial<ExecuteOptions>,
): Promise<{ state: ThetaCycleState; result: ExecutionResult }> {
  const { runId } = state;
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // P1-1修正: 実行開始時にcurrentPhaseを設定
  state.currentPhase = ThetaPhase.EXECUTE;

  // フェーズ開始イベント
  emitPhaseEvent(runId, ThetaEventType.PHASE_START, {
    phase: ThetaPhase.EXECUTE,
    strategy: decision.strategy,
    agent: decision.agent,
  });

  const startTime = Date.now();

  try {
    // リトライ付き実行
    const data = await executeWithRetry(
      executor,
      decision.params,
      opts.timeout,
      opts.retries,
      opts.onProgress,
    );

    const duration = Date.now() - startTime;
    const result: ExecutionResult = {
      success: true,
      data,
      duration,
    };

    // 実行イベント記録
    const executionEvent: ThetaEvent = {
      runId,
      phase: ThetaPhase.EXECUTE,
      timestamp: Date.now(),
      type: ThetaEventType.EXECUTION,
      data: {
        result,
      },
    };

    state.events.push(executionEvent);
    state.context.set("execute.result", result);

    // Agentイベントを発行
    emitAgentEvent({
      runId,
      stream: "tool",
      data: {
        type: "execute",
        success: true,
        duration,
      },
    });

    // フェーズ完了イベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_COMPLETE, {
      phase: ThetaPhase.EXECUTE,
      duration,
    });

    return { state, result };
  } catch (error) {
    const duration = Date.now() - startTime;
    const execError = error instanceof Error ? error : new Error(String(error));

    const result: ExecutionResult = {
      success: false,
      error: execError,
      duration,
    };

    // 実行エラーイベント記録
    const executionEvent: ThetaEvent = {
      runId,
      phase: ThetaPhase.EXECUTE,
      timestamp: Date.now(),
      type: ThetaEventType.EXECUTION,
      data: {
        result,
      },
    };

    state.events.push(executionEvent);
    state.context.set("execute.result", result);

    // エラーイベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_ERROR, {
      phase: ThetaPhase.EXECUTE,
      error: execError.message,
      duration,
    });

    return { state, result };
  }
}

/**
 * リトライ付きで実行する
 *
 * P1-2修正: AbortControllerを使用してタイムアウト時に実行を確実にキャンセル
 */
async function executeWithRetry<T>(
  executor: (params: Record<string, unknown>, signal?: AbortSignal) => Promise<T>,
  params: Record<string, unknown>,
  timeout: number,
  retries: number,
  onProgress?: (progress: number) => void,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // 各試行ごとに新しいAbortControllerを作成
    const controller = new AbortController();
    const signal = controller.signal;

    try {
      // 進度通知
      onProgress?.(attempt / (retries + 1));

      // タイムアウト付き実行（AbortSignalを渡す）
      const result = await withTimeout(executor(params, signal), timeout, controller);
      return result;
    } catch (error) {
      // タイムアウトの場合はAbortControllerでキャンセル済み
      // それ以外のエラーも記録
      lastError = error instanceof Error ? error : new Error(String(error));

      // 最後の試行で失敗した場合はエラーを投げる
      if (attempt >= retries) {
        throw new Error(`Execution failed after ${retries + 1} attempts: ${lastError.message}`);
      }

      // 指数バックオフで待機
      const delay = Math.min(1000 * 2 ** attempt, 10000);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Execution failed");
}

/**
 * タイムアウト付きで実行する
 *
 * P1-2修正: AbortControllerで確実にキャンセル
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timeoutId = setTimeout(() => {
        controller.abort(); // 実行をキャンセル
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Promiseが解決したらクリアンアップ（キャンセルされても実行）
      promise.finally?.(() => clearTimeout(timeoutId));
    }),
  ]);
}

/**
 * 指定ミリ秒待機する
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 実行結果を取得する
 *
 * @param state - θサイクル状態
 * @returns 実行結果
 */
export function getExecutionResult(state: ThetaCycleState): ExecutionResult | undefined {
  return state.context.get("execute.result") as ExecutionResult | undefined;
}

/**
 * フェーズイベントを発行する
 */
function emitPhaseEvent(runId: string, type: ThetaEventType, data: Record<string, unknown>): void {
  emitAgentEvent({
    runId,
    stream: "tool",
    data: {
      type: "theta_event",
      thetaEventType: type,
      ...data,
    },
  });
}

/**
 * バックグラウンド実行を開始する（完了を待たない）
 *
 * @param state - θサイクル状態
 * @param decision - 決定結果
 * @param executor - 実行関数
 * @param options - 実行オプション
 * @returns 実行ID（後で結果を取得するために使用）
 */
export function executeBackground<T = unknown>(
  state: ThetaCycleState,
  decision: DecisionResult,
  executor: (params: Record<string, unknown>, signal?: AbortSignal) => Promise<T>,
  options?: Partial<ExecuteOptions>,
): string {
  const executionId = `bg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  // 非同期実行（エラーは無視）
  execute(state, decision, executor, options).catch(() => {
    // バックグラウンド実行のエラーはログのみ記録
    emitAgentEvent({
      runId: state.runId,
      stream: "error",
      data: {
        type: "background_execution_error",
        executionId,
      },
    });
  });

  return executionId;
}
